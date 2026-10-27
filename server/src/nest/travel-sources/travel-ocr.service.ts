import { Injectable } from '@nestjs/common';
import { readEnv } from '../../app-config';
import { safeFetchAdminConfigured } from '../../utils/ssrfGuard';

const OCR_TIMEOUT_MS = 60_000;
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_TEXT = 4000;

/**
 * Reads text out of a guide image through the OCR sidecar (deploy/ocr). The sidecar
 * address is operator configuration (TREK_OCR_URL), so it may sit on the private
 * compose network; link-local and metadata addresses are still refused.
 */
@Injectable()
export class TravelOcrService {
  enabled(): boolean {
    return !!readEnv().integrations.ocrUrl;
  }

  /** Recognised lines joined by newlines, or null when the sidecar is off or could not read the image. */
  async read(image: Buffer, contentType: string): Promise<string | null> {
    const base = readEnv().integrations.ocrUrl;
    if (!base) return null;
    try {
      const response = await safeFetchAdminConfigured(`${base}/ocr`, {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body: image,
        signal: AbortSignal.timeout(OCR_TIMEOUT_MS),
      }, 0);
      const raw = await response.text();
      if (!response.ok || raw.length > MAX_RESPONSE_BYTES) {
        console.warn(`[travel-ocr] sidecar answered ${response.status} (${raw.length} bytes)`);
        return null;
      }
      const lines = (JSON.parse(raw) as { lines?: unknown }).lines;
      if (!Array.isArray(lines)) return null;
      return lines.filter((line): line is string => typeof line === 'string').join('\n').slice(0, MAX_TEXT);
    } catch (err) {
      console.warn(`[travel-ocr] sidecar unavailable: ${(err as Error).message}`);
      return null;
    }
  }
}
