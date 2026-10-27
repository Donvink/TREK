import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ExtractedTravelPlace, StoredTravelSource, TravelPlaceExtraction, TravelMapCandidate } from '@trek/shared';
import { travelPlaceImageIdentitySchema } from '@trek/shared';
import type { z } from 'zod';
import { DatabaseService } from '../database/database.service';
import { MapsService } from '../maps/maps.service';
import { extractTravelPlaces } from './extract-travel-places';
import { buildExtractionPrompt, PLACE_EXTRACTION_SYSTEM, validateExtraction, type ExtractionNote } from './llm-extract-places';
import { TravelLlmService } from './travel-llm.service';

const MAX_PLACES = 12;

/** Nominatim answer language for a city name, so street names come back as the source writes them. */
export function cityLanguage(city: string): string | undefined {
  const c = city.toLowerCase();
  if (/ital|torino|turin|milan|venez|venice|como|verona|genova/.test(c)) return 'it';
  if (/german|deutsch|münchen|munich|freiburg|stuttgart|konstanz/.test(c)) return 'de';
  if (/france|lyon|annecy|nice|strasbourg|colmar|paris/.test(c)) return 'fr';
  return undefined;
}

@Injectable()
export class TravelPlacesService {
  constructor(private readonly db: DatabaseService, private readonly maps: MapsService, private readonly llm: TravelLlmService) {}

  private source(userId: number, sourceId: string): StoredTravelSource {
    if (!/^[a-f0-9]{24}$/.test(sourceId)) throw new BadRequestException('Invalid source identity');
    const row = this.db.get<{ payload: string }>('SELECT payload FROM travel_sources WHERE user_id = ? AND source_id = ?', userId, sourceId);
    if (!row) throw new NotFoundException('Source not found');
    return JSON.parse(row.payload);
  }

  saved(userId: number, sourceId: string): TravelPlaceExtraction | null {
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

  /** The note as the extractor sees it, with whatever OCR text the collector uploaded. */
  private extractionNote(userId: number, source: StoredTravelSource): ExtractionNote {
    const texts = this.db.all<{ image_id: string; text: string }>(
      'SELECT image_id, text FROM travel_source_image_texts WHERE user_id = ? AND source_id = ?', userId, source.source_id,
    );
    return {
      title: source.title,
      content: source.content ?? '',
      images: (source.images ?? []).flatMap((image) => {
        const text = texts.find((row) => row.image_id === image.image_id)?.text;
        return image.image_id && text ? [{ order: image.order, image_id: image.image_id, text }] : [];
      }),
    };
  }

  async extract(userId: number, sourceId: string, city: string, refreshMap = false): Promise<TravelPlaceExtraction> {
    const source = this.source(userId, sourceId);
    if (source.status !== 'available' || !source.content || !source.content_hash) throw new BadRequestException('Source text unavailable');
    const previous = this.saved(userId, sourceId);
    const useLlm = this.llm.config(userId) !== null;
    const version = useLlm ? 3 : 2;
    const reusable = previous?.version === version && previous.source_content_hash === source.content_hash && previous.city === city;
    if (reusable && !refreshMap) return { ...previous, stale: false };

    let places: ExtractedTravelPlace[];
    let model: string | null = null;
    if (useLlm) {
      const note = this.extractionNote(userId, source);
      const answer = await this.llm.chatJson(userId, 'extract-places', PLACE_EXTRACTION_SYSTEM, buildExtractionPrompt(note));
      places = validateExtraction(answer.json, note);
      model = answer.model;
    } else {
      places = extractTravelPlaces(source.content);
    }
    const result: TravelPlaceExtraction = {
      version, extractor: useLlm ? 'llm' : 'rules', model, source_id: sourceId, source_url: source.url,
      source_content_hash: source.content_hash, city, extracted_at: new Date().toISOString(), places, stale: false,
    };
    if (result.places.length > MAX_PLACES) {
      result.places = result.places.slice(0, MAX_PLACES);
      result.places[MAX_PLACES - 1].warnings.push(`这篇地点较多，本次仅处理前 ${MAX_PLACES} 处`);
    }

    const sameSource = previous?.source_content_hash === result.source_content_hash ? previous : null;
    let bias: Promise<{ lat: number; lng: number } | undefined> | null = null;
    for (const place of result.places) {
      // Keep a reviewed identity from an image when extraction runs again on unchanged text.
      const reviewed = sameSource?.places.find((old) => old.place_id === place.place_id && old.name_image_id && !old.evidence);
      if (reviewed) {
        Object.assign(place, { name: reviewed.name, address: reviewed.address, name_image_id: reviewed.name_image_id, name_evidence: reviewed.name_evidence, name_status: 'source_only' });
        place.warnings = place.warnings.filter((warning) => !['原帖未给出明确地址', '名称过于简短，需补充地址后匹配'].includes(warning));
      }
      if (place.name_status === 'needs_confirmation') continue;
      // Looked up once, and only when some place goes on the map.
      bias ??= this.cityBias(city);
      await this.matchOnMap(place, city, await bias);
    }
    // Confirmations made while this ran still count.
    const latest = this.saved(userId, sourceId);
    if (latest?.source_content_hash === result.source_content_hash && latest.city === result.city) {
      for (const place of result.places) {
        const selected = latest.places.find((old) => old.place_id === place.place_id);
        if (selected?.selected_candidate_id && place.candidates.some((candidate) => candidate.candidate_id === selected.selected_candidate_id)) {
          place.selected_candidate_id = selected.selected_candidate_id;
          place.confirmed_at = selected.confirmed_at;
        }
      }
    }
    this.store(userId, result);
    return result;
  }

  private async cityBias(city: string): Promise<{ lat: number; lng: number } | undefined> {
    try {
      const hit = (await this.maps.searchNominatim(city, undefined, 'background'))[0];
      return hit?.lat != null && hit?.lng != null ? { lat: hit.lat, lng: hit.lng } : undefined;
    } catch {
      return undefined;
    }
  }

  private async matchOnMap(place: ExtractedTravelPlace, city: string, bias?: { lat: number; lng: number }) {
    const lang = cityLanguage(city);
    try {
      let rows = await this.maps.searchNominatim(`${place.name}, ${city}`, lang, 'background', bias);
      let basis: TravelMapCandidate['match_basis'] = 'name';
      if (!rows.length && place.address) {
        const address = place.address.replace(/\bP\.za\b/giu, 'Piazza');
        rows = await this.maps.searchNominatim(`${address}, ${city}`, lang, 'background', bias);
        basis = 'address';
      }
      place.candidates = rows.filter((row) => row.osm_id && /^(node|way|relation):\d+$/.test(row.osm_id)
        && row.lat !== null && row.lng !== null && Number.isFinite(row.lat) && Number.isFinite(row.lng)
        && Math.abs(row.lat) <= 90 && Math.abs(row.lng) <= 180).slice(0, 5).map((row) => ({
          candidate_id: row.osm_id!, name: row.name, address: row.address, lat: row.lat!, lng: row.lng!,
          match_basis: basis, url: `https://www.openstreetmap.org/${row.osm_id!.replace(':', '/')}`,
        }));
      place.map_status = place.candidates.length ? 'candidates' : 'not_found';
      if (basis === 'address' && place.candidates.length) place.warnings.push('地图仅匹配到地址，尚未确认是这家店');
      if (place.candidates.length > 1) place.warnings.push('有多个地图候选，可能存在同名地点，请核对');
      const normalizedAddress = (address: string) => address.toLocaleLowerCase().replace(/\bp\.za\b/gu, 'piazza').replace(/(\d)\s*\/\s*([a-z])/gu, '$1$2');
      const houseNumber = place.address?.match(/,\s*(\d+(?:\s*\/\s*[a-z])?)/iu)?.[1];
      if (houseNumber && place.candidates.some((candidate) => !new RegExp(`\\b${normalizedAddress(houseNumber)}\\b`).test(normalizedAddress(candidate.address)))) {
        place.warnings.push('部分地图候选的门牌与原帖不一致或缺失，请核对地址');
      }
      const street = place.address && normalizedAddress(place.address).match(/\b(?:via|piazza|corso|viale|largo)\s+[^,\d]+/u)?.[0]?.trim();
      if (street && place.candidates.some((candidate) => !normalizedAddress(candidate.address).includes(street))) {
        place.warnings.push('部分地图候选的街道与原帖不一致，请核对地点');
      }
    } catch {
      place.map_status = 'failed';
      place.warnings.push('地图查询失败，可稍后重新匹配');
    }
  }

  saveImageText(userId: number, sourceId: string, imageId: string, engine: string, text: string) {
    if (!/^[a-f0-9]{24}$/.test(sourceId) || !/^[a-f0-9]{64}$/.test(imageId)) throw new BadRequestException('Invalid image identity');
    const image = this.db.get('SELECT image_id FROM travel_source_images WHERE user_id = ? AND source_id = ? AND image_id = ?', userId, sourceId, imageId);
    if (!image) throw new NotFoundException('Image not saved for your source');
    this.db.run(
      'INSERT INTO travel_source_image_texts (user_id, source_id, image_id, engine, text, read_at) VALUES (?, ?, ?, ?, ?, ?) ' +
        'ON CONFLICT(user_id, source_id, image_id) DO UPDATE SET engine = excluded.engine, text = excluded.text, read_at = excluded.read_at',
      userId, sourceId, imageId, engine, text, new Date().toISOString(),
    );
    return { saved: true };
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
