import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { LlmConfigResolver } from '../llm-parse/llm-config.resolver';
import type { ResolvedLlmConfig } from '../llm-parse/llm-config';
import { parseLenientJson } from '../llm-parse/lenient-json';
import { safeFetchLlm } from '../../utils/ssrfGuard';

/**
 * USD per million tokens, input and output. A model missing here is refused: without a
 * price the spend cap cannot hold. Source: Google AI pricing page, checked 2026-10-26.
 */
export const TRAVEL_LLM_PRICES: Record<string, { input: number; output: number }> = {
  'gemini-3.1-flash-lite': { input: 0.25, output: 1.5 },
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
};

/** Total spend this instance may put on guide extraction. The plan's cap is CHF 25; USD 25 stays under it. */
export const TRAVEL_LLM_BUDGET_USD = 25;
const MAX_OUTPUT_TOKENS = 8192;
const RETRY_DELAY_MS = 2000;

export interface TravelLlmImage {
  mimeType: string;
  data: Buffer;
}

export interface TravelLlmResult {
  json: unknown;
  model: string;
  costUsd: number;
}

export function travelLlmCost(model: string, inputTokens: number, outputTokens: number): number {
  const price = TRAVEL_LLM_PRICES[model];
  if (!price) throw new Error(`No price registered for ${model}`);
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

/** Calls the instance's AI Parsing model for travel extraction, and keeps every call inside the spend cap. */
@Injectable()
export class TravelLlmService {
  constructor(private readonly db: DatabaseService, private readonly resolver: LlmConfigResolver) {}

  /** The model this user's extraction would run on, or null when none is usable. */
  config(userId: number): ResolvedLlmConfig | null {
    const config = this.resolver.resolve(userId);
    if (!config || config.provider === 'anthropic' || !config.baseUrl || !TRAVEL_LLM_PRICES[config.model]) return null;
    return config;
  }

  spentUsd(): number {
    return this.db.get<{ total: number | null }>('SELECT SUM(cost_usd) AS total FROM travel_llm_usage')?.total ?? 0;
  }

  async chatJson(userId: number, purpose: string, system: string, user: string, images: TravelLlmImage[] = []): Promise<TravelLlmResult> {
    const config = this.config(userId);
    if (!config) throw new ServiceUnavailableException('No priced OpenAI-compatible model is configured under AI Parsing');
    if (this.spentUsd() >= TRAVEL_LLM_BUDGET_USD) throw new ServiceUnavailableException('Travel extraction budget used up');

    const content: unknown[] = [{ type: 'text', text: user }];
    for (const image of images) {
      content.push({ type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.data.toString('base64')}` } });
    }
    const request = () => safeFetchLlm(`${config.baseUrl!.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        max_tokens: MAX_OUTPUT_TOKENS,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: images.length ? content : user }],
      }),
    });
    let response = await request();
    // Hosted models shed load with 429/503 now and then; one retry after a pause covers it.
    if (response.status === 429 || response.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      response = await request();
    }
    const raw = await response.text();
    const body = (() => { try { return JSON.parse(raw); } catch { return null; } })() as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    } | null;
    if (!response.ok || !body) {
      console.warn(`[travel-llm] ${purpose} failed: HTTP ${response.status} ${raw.slice(0, 300)}`);
      throw new ServiceUnavailableException(`Model request failed (${response.status})`);
    }

    // Recorded before parsing: an unreadable answer is still paid for.
    const inputTokens = body.usage?.prompt_tokens ?? 0;
    const outputTokens = body.usage?.completion_tokens ?? 0;
    const costUsd = travelLlmCost(config.model, inputTokens, outputTokens);
    this.db.run(
      'INSERT INTO travel_llm_usage (user_id, purpose, model, input_tokens, output_tokens, cost_usd, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      userId, purpose, config.model, inputTokens, outputTokens, costUsd, new Date().toISOString(),
    );
    const text = body.choices?.[0]?.message?.content ?? '';
    const json = parseLenientJson(text);
    if (json === null || json === undefined) {
      console.warn(`[travel-llm] ${purpose} answer was not JSON: ${text.slice(0, 300)}`);
      throw new ServiceUnavailableException('Model answer was not JSON');
    }
    return { json, model: config.model, costUsd };
  }
}
