import type { TravelPlaceGuideEvidence } from '@trek/shared'
import { useEffect, useState } from 'react'
import { travelPlansApi } from '../../api/travelPlans'

/**
 * The guide evidence behind one trip place, or null for a place that did not come
 * from a guide. Online-only: offline the block simply stays hidden.
 */
export function usePlaceGuideEvidence(tripId: number | string | null | undefined, placeId: number | string | null | undefined) {
  const [evidence, setEvidence] = useState<TravelPlaceGuideEvidence | null>(null)
  useEffect(() => {
    setEvidence(null)
    if (tripId == null || placeId == null || Number(placeId) < 0) return
    const controller = new AbortController()
    travelPlansApi
      .evidence(tripId, placeId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setEvidence(data)
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) console.warn('[travel-guide] evidence unavailable:', (err as Error).message)
      })
    return () => controller.abort()
  }, [tripId, placeId])
  return evidence
}
