import type { ExtractedTravelPlace, TravelPlaceClaim } from '@trek/shared';
import { createHash } from 'node:crypto';

const claim = (text: string, evidence = text): TravelPlaceClaim => ({ text, evidence, status: 'unverified' });

/** Conservative, deterministic first pass. Only names explicitly written in the source qualify. */
export function extractTravelPlaces(content: string): ExtractedTravelPlace[] {
  const blocks = content.replace(/\r\n?/g, '\n').split(/\n[\t ]*\n+/u);
  const places: ExtractedTravelPlace[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    const labelled = [...block.matchAll(/^(?:店名|餐厅名|餐馆名)[：:]\s*(.+)$/gm)];
    const pinned = [...block.matchAll(/^\s*📍\s*(.+)$/gm)];
    const quoted = [...block.matchAll(/(?:餐馆|餐厅|店)(?:的)?名字(?:是|叫)[“「"]([^”」"]{1,100})[”」"]/gu)];
    const matches = labelled.length ? labelled : pinned.length ? pinned : quoted;
    for (const [index, match] of matches.entries()) {
      const name = match[1].trim();
      if (!name || name.length > 200) continue;
      const singlePinned = pinned.length === 1 && labelled.length === 0 && quoted.length === 0;
      const context = singlePinned || (quoted.length === 1 && labelled.length === 0 && pinned.length === 0)
        ? content : matches.length === 1 ? block : block.slice(match.index, matches[index + 1]?.index);
      const address = context.match(/^\s*地址[：:]\s*(.+)$/m)?.[1].trim() ?? null;
      const identity = `${name.normalize('NFKC').toLowerCase()}\0${address ?? ''}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      const lines = context.split('\n').map(line => line.trim()).filter(Boolean);
      const narrative = lines.filter(line => !/^(?:店名|餐厅名|餐馆名|地址)[：:]|^📍|^#/u.test(line));
      const priceLines = narrative.filter(line => /€\s*\d|\d(?:[.,]\d+)?\s*(?:欧|耦)|[一二三四五六七八九十两]+欧/u.test(line));
      const hourLines = narrative.filter(line => /营业时间|开门时间|营业时段|关门|闭店/u.test(line));
      const features = narrative.filter(line => !hourLines.includes(line)).slice(0, 2)
        .map(line => claim(line.slice(0, 180), line.slice(0, 180)));
      const warnings: string[] = [];
      if (!address) warnings.push('原帖未给出明确地址');
      if (matches.length > 1) warnings.push('同段包含多个地点，特色和价格归属需核对');
      if (name.length < 3 && !address) warnings.push('名称过于简短，需补充地址后匹配');
      places.push({
        place_id: createHash('sha256').update(identity).digest('hex').slice(0, 16),
        name, name_status: name.length < 3 && !address ? 'needs_confirmation' : 'source_only',
        address, name_evidence: match[0].trim(),
        kind: /caff[eè]|cafe/iu.test(name) || /咖啡店/u.test(context) ? 'cafe' : 'restaurant',
        features: matches.length > 1 ? [] : features,
        prices: matches.length > 1 ? [] : priceLines.flatMap(line => [...line.matchAll(/€\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*(?:欧(?:元)?|耦)(?:以下|左右|起)?|[一二三四五六七八九十两]+欧(?:元)?(?:以下|左右)?/gu)]
          .map(price => claim(price[0], line.slice(Math.max(0, price.index! - 50), price.index! + price[0].length + 80)))),
        opening_hours: hourLines.map(line => claim(line.slice(0, 300))),
        warnings, map_status: 'needs_details', candidates: [], selected_candidate_id: null, confirmed_at: null,
      });
    }
  }
  return places;
}
