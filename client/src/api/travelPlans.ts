import apiClient from './client'
import type {
  TravelPlaceExtraction,
  TravelPlaceGuideEvidence,
  TravelPlan,
  TravelPlanDetail,
  TravelPlanFocus,
  TravelPlanInput,
  TravelProfile,
  TravelProfileView,
} from '@trek/shared'

/**
 * Guide-based planning: an online-only prototype surface, outside the offline
 * core on purpose. Generating a plan asks the model and the timetable service,
 * so it needs the network anyway; the trip it produces is an ordinary TREK trip
 * and from then on goes through the usual offline-first path.
 *
 * Extraction and generation wait on a model and on several timetable lookups,
 * far past the shared 8 s timeout.
 */
const SLOW = { timeout: 180_000 }

export const travelPlansApi = {
  list: () => apiClient.get<{ plans: TravelPlan[] }>('/travel-plans').then((r) => r.data.plans),
  create: (input: TravelPlanInput) => apiClient.post<TravelPlanDetail>('/travel-plans', input).then((r) => r.data),
  get: (planId: string) => apiClient.get<TravelPlanDetail>(`/travel-plans/${planId}`).then((r) => r.data),
  setFocus: (planId: string, focus: TravelPlanFocus) =>
    apiClient.patch<TravelPlanDetail>(`/travel-plans/${planId}/focus`, { focus }).then((r) => r.data),
  decide: (planId: string, poolKey: string, decision: 'include' | 'exclude' | null) =>
    apiClient.post<TravelPlanDetail>(`/travel-plans/${planId}/decisions`, { pool_key: poolKey, decision }).then((r) => r.data),
  weatherCheck: (planId: string) => apiClient.post<TravelPlanDetail>(`/travel-plans/${planId}/weather-check`, {}, SLOW).then((r) => r.data),
  weatherApply: (planId: string, dayIndex: number, swaps: { from_key: string; to_key: string }[]) =>
    apiClient.post<TravelPlanDetail>(`/travel-plans/${planId}/weather-apply`, { day_index: dayIndex, swaps }, SLOW).then((r) => r.data),
  generate: (planId: string) => apiClient.post<TravelPlanDetail>(`/travel-plans/${planId}/generate`, {}, SLOW).then((r) => r.data),
  extract: (sourceId: string, city: string, refresh: boolean) =>
    apiClient.post<TravelPlaceExtraction>(`/travel-sources/${sourceId}/places/extract`, { city, refresh_map: refresh }, SLOW).then((r) => r.data),
  /** Null when the place did not come from a guide. */
  evidence: (tripId: number | string, placeId: number | string, signal?: AbortSignal) =>
    apiClient
      .get<TravelPlaceGuideEvidence>(`/travel-plans/evidence/${tripId}/${placeId}`, { signal })
      .then((r) => r.data)
      .catch((err: { response?: { status?: number } }) => {
        if (err.response?.status === 404) return null
        throw err
      }),
}

export const travelProfileApi = {
  get: () => apiClient.get<TravelProfileView>('/travel-profile').then((r) => r.data),
  save: (profile: TravelProfile) => apiClient.put<TravelProfileView>('/travel-profile', profile).then((r) => r.data),
  forget: () => apiClient.delete<TravelProfileView>('/travel-profile').then((r) => r.data),
  accept: (key: string) => apiClient.post<TravelProfileView>(`/travel-profile/suggestions/${encodeURIComponent(key)}/accept`).then((r) => r.data),
  dismiss: (key: string) => apiClient.post<TravelProfileView>(`/travel-profile/suggestions/${encodeURIComponent(key)}/dismiss`).then((r) => r.data),
  deleteSignal: (id: number) => apiClient.delete<TravelProfileView>(`/travel-profile/signals/${id}`).then((r) => r.data),
}
