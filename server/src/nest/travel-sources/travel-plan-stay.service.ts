import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { TravelLegCheck, TravelPlanDetail, TravelPlaceGuideEvidence } from '@trek/shared';
import { AccommodationsService } from '../accommodations/accommodations.service';
import { DatabaseService } from '../database/database.service';
import { MapsService } from '../maps/maps.service';
import { PlacesService } from '../places/places.service';
import { cityLanguage } from './travel-places.service';
import { TravelPlansService } from './travel-plans.service';
import { hotelLegRequests } from './travel-stays';

/**
 * Once the traveller has booked, the hotel becomes the anchor of its nights: a TREK stay
 * across those days, and the morning and evening journeys checked from and to it.
 */
@Injectable()
export class TravelPlanStayService {
  constructor(
    private readonly db: DatabaseService,
    private readonly plans: TravelPlansService,
    private readonly maps: MapsService,
    private readonly places: PlacesService,
    private readonly accommodations: AccommodationsService,
  ) {}

  async setHotel(userId: number, planId: string, stayIndex: number, query: string): Promise<TravelPlanDetail> {
    const plan = this.plans.load(userId, planId);
    const stay = plan.stays?.[stayIndex];
    if (!plan.trip_id || !stay) throw new BadRequestException('No such stay');
    if (stay.hotel) throw new ConflictException('A hotel is already set for this stay; change it in the trip');
    const tripId = plan.trip_id;

    const hit = (await this.maps.searchNominatim(`${query}, ${stay.city}`, cityLanguage(stay.city), 'background', { lat: stay.area.lat, lng: stay.area.lng }))
      .find((row) => row.lat != null && row.lng != null);
    if (!hit) throw new NotFoundException('Hotel not found on the map; try its full name or address');

    const tripDays = this.db.all<{ id: number }>('SELECT id FROM days WHERE trip_id = ? ORDER BY day_number ASC', tripId);
    const startDay = tripDays[stay.day_indexes[0]];
    // The last night's morning is the check-out day.
    const endDay = tripDays[stay.day_indexes[0] + stay.nights] ?? tripDays[stay.day_indexes.at(-1)!];
    if (!startDay || !endDay) throw new ConflictException('The trip no longer has these days');

    const name = query.trim();
    const placeId = this.db.transaction(() => {
      const place = this.places.create(String(tripId), {
        name, lat: hit.lat!, lng: hit.lng!, address: hit.address || undefined, osm_id: hit.osm_id || undefined,
        notes: `住宿，${stay.check_in} 入住，${stay.check_out} 退房。`,
      }) as { id: number };
      this.accommodations.create(tripId, { place_id: place.id, start_day_id: startDay.id, end_day_id: endDay.id });
      return place.id;
    });
    stay.hotel = { name, address: hit.address || null, lat: hit.lat!, lng: hit.lng!, place_id: placeId };

    const { pool } = this.plans.pool(userId, plan);
    const byKey = new Map(pool.map((place) => [place.pool_key, place]));
    const hotelLegs = await this.plans.checkLegs(hotelLegRequests(stay, plan.days, byKey), userId, new Date().toISOString());
    plan.legs = [...plan.legs, ...hotelLegs].sort((a, b) => a.day_index - b.day_index || (a.from_name === name ? -1 : b.from_name === name ? 1 : 0));
    this.refreshEvidence(tripId, plan.place_ids ?? {}, byKey, plan.legs);
    this.plans.save(userId, plan);
    this.plans.signal(userId, planId, 'hotel_set', { city: stay.city, nights: stay.nights });
    return this.plans.detail(userId, planId);
  }

  /** Each guide place shows the journeys that start or end at it, the hotel ones included. */
  private refreshEvidence(tripId: number, placeIds: Record<string, number>, byKey: Map<string, { name: string }>, legs: TravelLegCheck[]) {
    for (const [key, placeId] of Object.entries(placeIds)) {
      const row = this.db.get<{ payload: string }>('SELECT payload FROM travel_place_evidence WHERE trip_id = ? AND place_id = ?', tripId, placeId);
      const name = byKey.get(key)?.name;
      if (!row || !name) continue;
      const evidence = JSON.parse(row.payload) as TravelPlaceGuideEvidence;
      evidence.legs = legs.filter((leg) => leg.from_name === name || leg.to_name === name);
      this.db.run('UPDATE travel_place_evidence SET payload = ? WHERE trip_id = ? AND place_id = ?', JSON.stringify(evidence), tripId, placeId);
    }
  }
}
