import type { ExtractedTravelPlace, TravelPlaceClaim, TravelPlaceEvidence, TravelPlaceKind, TravelPlaceSentiment } from '@trek/shared';
import { travelPlaceKinds } from '@trek/shared';
import { createHash } from 'node:crypto';

/** One note as the model sees it: the body text plus the OCR text of each image, by position. */
export interface ExtractionNote {
  title: string;
  content: string;
  images: { order: number; image_id: string; text: string }[];
}

export const PLACE_EXTRACTION_SYSTEM = `你是旅行攻略信息抽取器。输入是一篇小红书帖子的正文，以及帖子图片中由 OCR 读出的文字（按图片序号标注）。
只输出 JSON，格式：
{"places":[{"name":"地点名称","address":"地址或 null","kind":"restaurant|cafe|bar|attraction|museum|nature|shop|place","sentiment":"positive|mixed|negative|null","evidence":[{"source":"text 或 image","image":图片序号或 null,"quote":"原文摘录"}],"features":[{"text":"特色或体验","quote":"原文摘录"}],"prices":[{"text":"价格","quote":"原文摘录"}],"opening_hours":[{"text":"营业时间","quote":"原文摘录"}]}]}
规则：
1. 只列出作者实际推荐、去过或明确提到的具体地点（店铺、景点、自然风光点、博物馆等），不要列城市、国家、街区或泛称。菜品、饮品和商品不是地点，应作为所在地点的 features 或 prices。
2. quote 必须逐字摘自正文或对应图片的 OCR 文字，不得改写、翻译或拼接；找不到原文依据的信息不要输出。
3. 名称和地址优先使用原文或图片中出现的完整写法；如果正文只有简称而图片里有完整店名或地址，用图片里的写法，并在 evidence 中引用那张图片。
4. 不要补充你自己知道但帖子里没有的信息，不要猜测地址。
5. sentiment 表示作者对这个地点的整体评价。`;

export function buildExtractionPrompt(note: ExtractionNote): string {
  const images = note.images
    .filter((image) => image.text.trim())
    .map((image) => `【图${image.order}】\n${image.text.trim()}`)
    .join('\n\n');
  return `标题：${note.title}\n\n正文：\n${note.content}\n\n图片文字（OCR）：\n${images || '（无）'}`;
}

/** Comparison form: NFKC, lower case, whitespace and most punctuation removed, so OCR spacing does not matter. */
export function normalizeForMatch(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

/** Words of a name or address: letters runs and numbers, as the note would spell them. */
export function matchTokens(value: string): string[] {
  return value.normalize('NFKC').toLowerCase().split(/[\s\p{P}\p{S}]+/u)
    .filter((token) => token.length >= 2 || /^\p{N}+$/u.test(token) || /\p{Script=Han}/u.test(token));
}

/** Every word occurs in one of the given texts: survives OCR line breaks and stray fragments between lines. */
export function tokensIn(value: string, haystacks: string[]): boolean {
  const tokens = matchTokens(value).map(normalizeForMatch).filter(Boolean);
  return tokens.length > 0 && haystacks.some((haystack) => tokens.every((token) => haystack.includes(token)));
}

const asString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const asArray = (value: unknown) => (Array.isArray(value) ? value : []);

/**
 * Keep only what the note supports. Every quote must occur in the text or in the OCR text
 * of the image it names; a place with no surviving evidence is dropped, and a name or
 * address the note never spells out is not trusted.
 */
export function validateExtraction(raw: unknown, note: ExtractionNote): ExtractedTravelPlace[] {
  const text = normalizeForMatch(`${note.title}\n${note.content}`);
  const imageText = new Map(note.images.map((image) => [image.order, normalizeForMatch(image.text)]));
  const everything = [text, ...imageText.values()].join('\n');
  // Some models answer with the bare array instead of the requested object.
  const places = Array.isArray(raw) ? raw : asArray((raw as { places?: unknown } | null)?.places);
  const result: ExtractedTravelPlace[] = [];
  const seen = new Set<string>();

  // A quote may skip OCR fragments between the lines it cites, but every line it keeps must be there.
  const quoted = (quote: string, haystack: string | undefined) => {
    const lines = quote.split('\n').map(normalizeForMatch).filter(Boolean);
    return !!haystack && lines.join('').length >= 2 && lines.every((line) => haystack.includes(line));
  };
  const checkQuote = (source: unknown, image: unknown, quote: string): TravelPlaceEvidence | null => {
    if (source === 'image') {
      const order = typeof image === 'number' ? image : Number(image);
      const found = note.images.find((item) => item.order === order);
      if (!found || !quoted(quote, imageText.get(order))) return null;
      return { kind: 'image', image_id: found.image_id, image_order: order, quote: quote.slice(0, 300) };
    }
    return quoted(quote, text) ? { kind: 'text', image_id: null, image_order: null, quote: quote.slice(0, 300) } : null;
  };
  const claims = (items: unknown): TravelPlaceClaim[] =>
    asArray(items).flatMap((item) => {
      const claimText = asString((item as { text?: unknown })?.text);
      const quote = asString((item as { quote?: unknown })?.quote);
      if (!claimText || !quote || ![text, ...imageText.values()].some((haystack) => quoted(quote, haystack))) return [];
      return [{ text: claimText.slice(0, 180), evidence: quote.slice(0, 300), status: 'unverified' as const }];
    });

  for (const item of places.slice(0, 20)) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    const name = asString(entry.name).slice(0, 200);
    if (!name) continue;
    const evidence = asArray(entry.evidence).flatMap((ev) => {
      const e = ev as Record<string, unknown>;
      const checked = checkQuote(e?.source, e?.image, asString(e?.quote));
      return checked ? [checked] : [];
    });
    if (!evidence.length) continue;

    const warnings: string[] = [];
    const nameKey = normalizeForMatch(name);
    const nameInNote = nameKey.length > 0 && (everything.includes(nameKey) || tokensIn(name, [everything]));
    if (!nameInNote) warnings.push('名称未在原文或图片文字中逐字出现，需核对');
    let address: string | null = asString(entry.address).slice(0, 300) || null;
    if (address && !tokensIn(address, [text, ...imageText.values()])) {
      warnings.push('模型给出的地址在原文中找不到，已忽略');
      address = null;
    }
    if (!address) warnings.push('原帖未给出明确地址');
    if (evidence.some((ev) => ev.kind === 'image')) warnings.push('部分依据来自图片 OCR，可能有识别错误');

    const identity = `${nameKey}\0${address ? normalizeForMatch(address) : ''}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const kind = (travelPlaceKinds as readonly string[]).includes(asString(entry.kind)) ? (asString(entry.kind) as TravelPlaceKind) : 'place';
    const sentiment = (['positive', 'mixed', 'negative'] as const).includes(asString(entry.sentiment) as TravelPlaceSentiment)
      ? (asString(entry.sentiment) as TravelPlaceSentiment) : null;
    const nameImage = evidence.find((ev) => ev.kind === 'image' && tokensIn(name, [normalizeForMatch(ev.quote)]))
      ?? evidence.find((ev) => ev.kind === 'image');

    result.push({
      place_id: createHash('sha256').update(identity).digest('hex').slice(0, 16),
      name,
      name_status: nameInNote ? 'source_only' : 'needs_confirmation',
      ...(nameImage?.image_id ? { name_image_id: nameImage.image_id } : {}),
      kind,
      address,
      name_evidence: evidence[0].quote,
      evidence,
      sentiment,
      features: claims(entry.features).slice(0, 4),
      prices: claims(entry.prices).slice(0, 4),
      opening_hours: claims(entry.opening_hours).slice(0, 3),
      warnings,
      map_status: 'needs_details',
      candidates: [],
      selected_candidate_id: null,
      confirmed_at: null,
    });
  }
  return result;
}
