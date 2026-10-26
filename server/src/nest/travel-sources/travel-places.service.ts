import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { StoredTravelSource, TravelPlaceExtraction, TravelMapCandidate } from '@trek/shared';
import { travelPlaceImageIdentitySchema } from '@trek/shared';
import type { z } from 'zod';
import { DatabaseService } from '../database/database.service';
import { MapsService } from '../maps/maps.service';
import { extractTravelPlaces } from './extract-travel-places';

@Injectable()
export class TravelPlacesService {
  constructor(private readonly db: DatabaseService, private readonly maps: MapsService) {}

  private source(userId: number, sourceId: string): StoredTravelSource {
    if (!/^[a-f0-9]{24}$/.test(sourceId)) throw new BadRequestException('Invalid source identity');
    const row = this.db.get<{ payload: string }>('SELECT payload FROM travel_sources WHERE user_id = ? AND source_id = ?', userId, sourceId);
    if (!row) throw new NotFoundException('Source not found');
    return JSON.parse(row.payload);
  }

  private saved(userId: number, sourceId: string): TravelPlaceExtraction | null {
    const row = this.db.get<{ payload: string }>('SELECT payload FROM travel_place_extractions WHERE user_id = ? AND source_id = ?', userId, sourceId);
    return row ? JSON.parse(row.payload) : null;
  }

  private store(userId: number, result: TravelPlaceExtraction) {
    // Do not attach the result of a slow lookup to a source that changed meanwhile.
    if (this.source(userId, result.source_id).content_hash !== result.source_content_hash) {
      throw new ConflictException('Source changed; extract again');
    }
    this.db.run('INSERT INTO travel_place_extractions (user_id, source_id, payload) VALUES (?, ?, ?) ON CONFLICT(user_id, source_id) DO UPDATE SET payload = excluded.payload', userId, result.source_id, JSON.stringify(result));
  }

  async extract(userId: number, sourceId: string, city: string, refreshMap = false): Promise<TravelPlaceExtraction> {
    const source = this.source(userId, sourceId);
    if (source.status !== 'available' || !source.content || !source.content_hash) throw new BadRequestException('Source text unavailable');
    const previous = this.saved(userId, sourceId);
    const reusable = previous?.version === 2 && previous.source_content_hash === source.content_hash && previous.city === city;
    if (reusable && !refreshMap) return { ...previous, stale: false };
    const result: TravelPlaceExtraction = {
      version: 2, source_id: sourceId, source_url: source.url, source_content_hash: source.content_hash,
      city, extracted_at: new Date().toISOString(), places: extractTravelPlaces(source.content), stale: false,
    };
    if (result.places.length > 12) {
      result.places = result.places.slice(0, 12);
      result.places[11].warnings.push('这篇地点较多，本次仅处理前 12 处');
    }
    for (const place of result.places) {
      // Keep reviewed image evidence when re-running extraction on unchanged source text.
      const imageIdentity = previous?.source_content_hash === result.source_content_hash
        ? previous.places.find(old => old.place_id === place.place_id && old.name_image_id) : undefined;
      if (imageIdentity) {
        place.name = imageIdentity.name;
        place.address = imageIdentity.address;
        place.name_image_id = imageIdentity.name_image_id;
        place.name_evidence = imageIdentity.name_evidence;
        place.name_status = 'source_only';
        place.warnings = place.warnings.filter(warning => !['原帖未给出明确地址', '名称过于简短，需补充地址后匹配'].includes(warning));
      }
      if (place.name_status === 'needs_confirmation') continue;
      try {
        const named = await this.maps.searchNominatim(`${place.name}, ${city}`, 'it', 'background');
        let rows = named;
        let basis: TravelMapCandidate['match_basis'] = 'name';
        if (!rows.length && place.address) {
          const address = place.address.replace(/\bP\.za\b/giu, 'Piazza');
          rows = await this.maps.searchNominatim(`${address}, ${city}`, 'it', 'background');
          basis = 'address';
        }
        place.candidates = rows.filter(row => row.osm_id && /^(node|way|relation):\d+$/.test(row.osm_id)
          && row.lat !== null && row.lng !== null && Number.isFinite(row.lat) && Number.isFinite(row.lng)
          && Math.abs(row.lat) <= 90 && Math.abs(row.lng) <= 180).slice(0, 5).map(row => ({
            candidate_id: row.osm_id!, name: row.name, address: row.address, lat: row.lat!, lng: row.lng!,
            match_basis: basis, url: `https://www.openstreetmap.org/${row.osm_id!.replace(':', '/')}`,
          }));
        place.map_status = place.candidates.length ? 'candidates' : 'not_found';
        if (basis === 'address' && place.candidates.length) place.warnings.push('地图仅匹配到地址，尚未确认是这家店');
        if (place.candidates.length > 1) place.warnings.push('有多个地图候选，可能存在同名地点，请核对');
        const normalizedAddress = (address: string) => address.toLocaleLowerCase().replace(/\bp\.za\b/gu, 'piazza').replace(/(\d)\s*\/\s*([a-z])/gu, '$1$2');
        const houseNumber = place.address?.match(/,\s*(\d+(?:\s*\/\s*[a-z])?)/iu)?.[1];
        if (houseNumber && place.candidates.some(candidate => !new RegExp(`\\b${normalizedAddress(houseNumber)}\\b`).test(normalizedAddress(candidate.address)))) {
          place.warnings.push('部分地图候选的门牌与原帖不一致或缺失，请核对地址');
        }
        const street = place.address && normalizedAddress(place.address).match(/\b(?:via|piazza|corso|viale|largo)\s+[^,]+/u)?.[0];
        if (street && place.candidates.some(candidate => !normalizedAddress(candidate.address).includes(street))) {
          place.warnings.push('部分地图候选的街道与原帖不一致，请核对地点');
        }
        const selected = reusable ? previous.places.find(old => old.place_id === place.place_id) : undefined;
        if (selected?.selected_candidate_id && place.candidates.some(candidate => candidate.candidate_id === selected.selected_candidate_id)) {
          place.selected_candidate_id = selected.selected_candidate_id;
          place.confirmed_at = selected.confirmed_at;
        }
      } catch {
        place.map_status = 'failed';
        place.warnings.push('地图查询失败，可稍后重新匹配');
      }
    }
    const latest = this.saved(userId, sourceId);
    if (latest?.source_content_hash === result.source_content_hash && latest.city === result.city) {
      for (const place of result.places) {
        const selected = latest.places.find(old => old.place_id === place.place_id);
        if (selected?.selected_candidate_id && place.candidates.some(candidate => candidate.candidate_id === selected.selected_candidate_id)) {
          place.selected_candidate_id = selected.selected_candidate_id;
          place.confirmed_at = selected.confirmed_at;
        }
      }
    }
    this.store(userId, result);
    return result;
  }

  correctIdentityFromImage(userId: number, sourceId: string, placeId: string, input: z.infer<typeof travelPlaceImageIdentitySchema>): TravelPlaceExtraction {
    const source = this.source(userId, sourceId);
    const result = this.saved(userId, sourceId);
    if (!result || result.source_content_hash !== source.content_hash) throw new ConflictException('Source changed; extract again');
    const place = result.places.find(item => item.place_id === placeId);
    if (!place) throw new NotFoundException('Place not found');
    if (!source.images?.some(image => image.image_id === input.image_id)) throw new BadRequestException('Image does not belong to source');
    const image = this.db.get('SELECT image_id FROM travel_source_images WHERE user_id = ? AND source_id = ? AND image_id = ?', userId, sourceId, input.image_id);
    if (!image) throw new BadRequestException('Source image is not saved');
    place.name = input.name;
    place.address = input.address;
    place.name_status = 'source_only';
    place.name_image_id = input.image_id;
    place.name_evidence = input.evidence;
    place.candidates = [];
    place.map_status = 'needs_details';
    place.selected_candidate_id = null;
    place.confirmed_at = null;
    place.warnings = ['名称与地址来自人工查看的帖子图片，地图位置仍需匹配和确认'];
    this.store(userId, result);
    return result;
  }

  confirm(userId: number, sourceId: string, placeId: string, candidateId: string): TravelPlaceExtraction {
    const source = this.source(userId, sourceId);
    const result = this.saved(userId, sourceId);
    if (!result || result.source_content_hash !== source.content_hash) throw new ConflictException('Source changed; extract again');
    const place = result.places.find(item => item.place_id === placeId);
    if (place && (place.name_status === 'needs_confirmation' || (place.name.length < 3 && !place.address))) {
      throw new BadRequestException('Place identity needs confirmation');
    }
    if (!place || !place.candidates.some(candidate => candidate.candidate_id === candidateId)) throw new BadRequestException('Unknown candidate');
    place.selected_candidate_id = candidateId;
    place.confirmed_at = new Date().toISOString();
    this.store(userId, result);
    return result;
  }
}
