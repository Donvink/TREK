import { describe, expect, it } from 'vitest';
import {
  buildExtractionPrompt,
  matchTokens,
  normalizeForMatch,
  tokensIn,
  validateExtraction,
  type ExtractionNote,
} from '../../../src/nest/travel-sources/llm-extract-places';

const cardImage = 'a'.repeat(64);
const menuImage = 'b'.repeat(64);
const note: ExtractionNote = {
  title: '都灵 中餐厅',
  content: '我非常喜欢他家的酱香饼。\n餐馆的名字是“家”，老板也很亲切。',
  images: [
    { order: 10, image_id: cardImage, text: 'House Jia\nCUCINA TRADIZIONALE CINESE\nVia\nVia Giuseppe Luigi Passalacqua 4/A\n101\n10122 Torino' },
    { order: 3, image_id: menuImage, text: '10. 酱香饼 € 5,90' },
  ],
};

describe('model place extraction is held to the note', () => {
  it('accepts a place whose name and address come from an image, quoting lines the OCR split', () => {
    const [place] = validateExtraction({
      places: [{
        name: 'House Jia',
        address: 'Via Giuseppe Luigi Passalacqua 4/A, 10122 Torino',
        kind: 'restaurant',
        sentiment: 'positive',
        evidence: [
          { source: 'text', image: null, quote: '餐馆的名字是“家”' },
          { source: 'image', image: 10, quote: 'House Jia\nVia Giuseppe Luigi Passalacqua 4/A\n10122 Torino' },
        ],
        prices: [{ text: '酱香饼 €5.90', quote: '10. 酱香饼 € 5,90' }],
      }],
    }, note);
    expect(place.name).toBe('House Jia');
    expect(place.address).toBe('Via Giuseppe Luigi Passalacqua 4/A, 10122 Torino');
    expect(place.name_status).toBe('source_only');
    expect(place.name_image_id).toBe(cardImage);
    expect(place.evidence?.map((ev) => ev.kind)).toEqual(['text', 'image']);
    expect(place.prices[0].text).toBe('酱香饼 €5.90');
    expect(place.warnings.join()).toContain('OCR');
  });

  it('drops invented quotes, invented addresses and places left with no evidence', () => {
    const places = validateExtraction({
      places: [
        { name: 'Ghost Bar', kind: 'bar', evidence: [{ source: 'text', quote: '这家酒吧很棒' }] },
        { name: 'House Jia', address: 'Via Roma 1, Torino', kind: 'restaurant', evidence: [{ source: 'image', image: 10, quote: 'House Jia' }] },
        { name: 'House Jia', kind: 'restaurant', evidence: [{ source: 'image', image: 3, quote: 'House Jia' }] },
      ],
    }, note);
    expect(places).toHaveLength(1);
    expect(places[0].address).toBeNull();
    expect(places[0].warnings.join()).toContain('地址在原文中找不到');
  });

  it('does not trust a name the note never spells out', () => {
    const [place] = validateExtraction({ places: [{ name: 'Jade Garden', kind: 'restaurant', evidence: [{ source: 'text', quote: '老板也很亲切' }] }] }, note);
    expect(place.name_status).toBe('needs_confirmation');
  });

  it('reads a bare array answer, unknown kinds and sentiments, and duplicates', () => {
    const places = validateExtraction([
      { name: 'House Jia', kind: 'spaceship', sentiment: 'ecstatic', evidence: [{ source: 'image', image: 10, quote: 'House Jia' }] },
      { name: 'house  jia', kind: 'restaurant', evidence: [{ source: 'image', image: 10, quote: 'House Jia' }] },
    ], note);
    expect(places).toHaveLength(1);
    expect(places[0].kind).toBe('place');
    expect(places[0].sentiment).toBeNull();
  });

  it('survives answers that are not objects at all', () => {
    expect(validateExtraction(null, note)).toEqual([]);
    expect(validateExtraction('places', note)).toEqual([]);
    expect(validateExtraction({ places: [{ name: '' }, 3, null] }, note)).toEqual([]);
  });

  it('builds a prompt that labels each image by position and skips empty OCR', () => {
    const prompt = buildExtractionPrompt({ ...note, images: [...note.images, { order: 5, image_id: 'c'.repeat(64), text: '  ' }] });
    expect(prompt).toContain('【图10】');
    expect(prompt).not.toContain('【图5】');
    expect(buildExtractionPrompt({ ...note, images: [] })).toContain('（无）');
  });

  it('normalises for comparison and splits words the way a note spells them', () => {
    expect(normalizeForMatch('Via  Giuseppe,\nLuigi')).toBe('viagiuseppeluigi');
    expect(matchTokens('Piazza della Repubblica, 9 都灵')).toEqual(['piazza', 'della', 'repubblica', '9', '都灵']);
    expect(tokensIn('House Jia', [normalizeForMatch('house\njia cucina')])).toBe(true);
    expect(tokensIn('', ['anything'])).toBe(false);
  });
});
