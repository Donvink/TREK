import apiClient from './client'
import type { TravelManualNote } from '@trek/shared'

/**
 * Guide notes added by hand. Online-only like the rest of the guide prototype.
 * Image uploads wait for the OCR sidecar to read each image, so they get more
 * than the shared 8 s.
 */
const SLOW = { timeout: 120_000 }

export const travelSourcesApi = {
  importManual: (note: TravelManualNote) =>
    apiClient.post<{ source_id: string; created: boolean }>('/travel-sources/manual', note).then((r) => r.data),
  remove: (sourceId: string) => apiClient.delete<{ deleted: true }>(`/travel-sources/${sourceId}`).then((r) => r.data),
  uploadImage: (sourceId: string, imageId: string, contentType: string, data: ArrayBuffer) =>
    apiClient
      .post<{ saved: boolean; text_read: boolean }>(`/travel-sources/${sourceId}/images/${imageId}`, data, {
        ...SLOW,
        headers: { 'Content-Type': contentType },
      })
      .then((r) => r.data),
}
