import { describe, it, expect } from 'vitest';
import { normalizeOff, lookupBarcode, searchOff } from '../src/api/off';
import { normalizeUsda, searchUsda } from '../src/api/usda';
import { mergeResults } from '../src/api/search';

const mockFetch = (body: unknown, status = 200) => (async (url: string) => { (mockFetch as any).last = url; return new Response(JSON.stringify(body), { status }); }) as unknown as typeof fetch;

describe('OFF', () => {
  it('normalizes kcal, kJ fallback, serving', () => {
    const f = normalizeOff({ code: '123', product_name: 'Greek Yogurt', brands: 'Fage, X', serving_quantity: '170', serving_size: '170 g', nutriments: { 'energy-kcal_100g': 97, proteins_100g: 9, carbohydrates_100g: 3.98, fat_100g: 5 } })!;
    expect(f).toMatchObject({ id: 'off:123', brand: 'Fage', servingG: 170, per100g: { kcal: 97, protein: 9, carbs: 4, fat: 5 } });
    expect(normalizeOff({ code: '1', product_name: 'x', nutriments: { 'energy-kj_100g': 418.4 } })!.per100g.kcal).toBe(100);
    expect(normalizeOff({ code: '1', product_name: 'x', nutriments: {} })).toBeNull();
  });
  it('barcode lookup + not found', async () => {
    expect((await lookupBarcode('3017620422003', { fetchImpl: mockFetch({ status: 1, product: { product_name: 'Nutella', nutriments: { 'energy-kcal_100g': 539, fat_100g: 30.9, carbohydrates_100g: 57.5, proteins_100g: 6.3 } } }) }))!.name).toBe('Nutella');
    expect(await lookupBarcode('000', { fetchImpl: mockFetch({ status: 0 }) })).toBeNull();
    expect(await lookupBarcode('000', { fetchImpl: mockFetch({}, 404) })).toBeNull();
  });
  it('search retries once then throws off_unavailable', async () => {
    let n = 0; const flaky = (async () => (++n === 1 ? new Response('<html>503</html>', { status: 503 }) : new Response(JSON.stringify({ products: [{ code: '1', product_name: 'Oats', brands: 'Quaker, Q', nutriments: { 'energy-kcal_100g': 379 } }] })))) as unknown as typeof fetch;
    const r = await searchOff('oats', { fetchImpl: flaky, retryDelayMs: 0 }); expect(n).toBe(2); expect(r[0].brand).toBe('Quaker');
    const down = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    await expect(searchOff('oats', { fetchImpl: down, retryDelayMs: 0 })).rejects.toMatchObject({ code: 'off_unavailable' });
  });
  it('sends no custom headers (no CORS preflight)', async () => {
    let init: RequestInit | undefined; const f = (async (_u: string, i: RequestInit) => { init = i; return new Response('{"products":[]}'); }) as unknown as typeof fetch;
    await searchOff('x', { fetchImpl: f }); expect(init?.headers).toBeUndefined(); expect(init?.method).toBe('GET');
  });
  it('search filters unusable', async () => {
    const r = await searchOff('oats', { fetchImpl: mockFetch({ products: [{ code: '1', product_name: 'Oats', nutriments: { 'energy-kcal_100g': 379 } }, { code: '2' }] }) });
    expect(r).toHaveLength(1);
  });
});

describe('USDA', () => {
  it('normalizes nutrients and title-cases', () => {
    const f = normalizeUsda({ fdcId: 171077, description: 'CHICKEN, BREAST, RAW', dataType: 'SR Legacy', foodNutrients: [{ nutrientId: 1008, value: 120 }, { nutrientId: 1003, value: 22.5 }, { nutrientId: 1004, value: 2.62 }, { nutrientId: 1005, value: 0 }] })!;
    expect(f).toMatchObject({ id: 'usda:171077', name: 'Chicken, Breast, Raw', per100g: { kcal: 120, protein: 22.5, fat: 2.6, carbs: 0 } });
    expect(normalizeUsda({ fdcId: 1, description: 'x', foodNutrients: [{ nutrientId: 2047, value: 50 }] })!.per100g.kcal).toBe(50);
  });
  it('search uses DEMO_KEY by default', async () => {
    const f = mockFetch({ foods: [{ fdcId: 1, description: 'Egg', foodNutrients: [{ nutrientId: 1008, value: 143 }] }] });
    const r = await searchUsda('egg', { fetchImpl: f }); expect(r[0].per100g.kcal).toBe(143);
    expect((mockFetch as any).last).toContain('api_key=DEMO_KEY');
  });
  it('DEMO_KEY failure -> usda_key_needed; own key failure keeps code', async () => {
    await expect(searchUsda('egg', { fetchImpl: mockFetch({}, 429) })).rejects.toMatchObject({ code: 'usda_key_needed' });
    await expect(searchUsda('egg', { apiKey: 'k', fetchImpl: mockFetch({}, 403) })).rejects.toMatchObject({ code: 'bad_key' });
  });
});

describe('mergeResults', () => {
  it('local first, interleaves, dedups', () => {
    const mk = (id: string, name: string) => ({ id, source: 'off', name, per100g: { kcal: 1, protein: 0, carbs: 0, fat: 0 } }) as any;
    const r = mergeResults([mk('c:1', 'Egg')], [mk('u:1', 'egg'), mk('u:2', 'Milk')], [mk('o:1', 'Bread')], 10);
    expect(r.map(x => x.id)).toEqual(['c:1', 'o:1', 'u:2']);
  });
});

import { usdaServing, tidyServingText } from '../src/api/usda';
import { macrosForGrams } from '../src/lib/nutrition';
describe('USDA servings (realistic fixtures)', () => {
  // Live Branded result (fdcId 2187885), 2026-10-12: nutrients are per 100 g.
  const branded = { fdcId: 2187885, description: 'CHICKEN BREAST', dataType: 'Branded', brandOwner: 'Tyson Foods, Inc.', gtinUpc: '023700012345',
    servingSize: 284, servingSizeUnit: 'g', householdServingFullText: '1 CHICKEN BREAST',
    foodNutrients: [{ nutrientId: 1003, value: 20.4 }, { nutrientId: 1004, value: 8.1 }, { nutrientId: 1005, value: 1.06 }, { nutrientId: 1008, value: 165 }] };
  it('branded: per100g kept, serving grams + tidy label, serving kcal = per100*g/100', () => {
    const f = normalizeUsda(branded)!;
    expect(f.per100g).toEqual({ kcal: 165, protein: 20.4, carbs: 1.1, fat: 8.1 });
    expect(f).toMatchObject({ servingG: 284, servingLabel: '1 chicken breast (284 g)', name: 'Chicken Breast' });
    expect(macrosForGrams(f.per100g, f.servingG!).kcal).toBe(469); // 165 * 2.84, a whole 284 g breast
  });
  it('branded unit aliases and redundant household text', () => {
    expect(usdaServing({ fdcId: 1, description: 'x', servingSize: 56, servingSizeUnit: 'GRM', householdServingFullText: '2 ONZ' })).toEqual({ servingG: 56, servingLabel: '2 oz (56 g)' });
    expect(usdaServing({ fdcId: 1, description: 'x', servingSize: 240, servingSizeUnit: 'MLT', householdServingFullText: '240 ml' })).toEqual({ servingG: 240, servingLabel: '240 g' });
    expect(usdaServing({ fdcId: 1, description: 'x', servingSize: 30, servingSizeUnit: 'g' })).toEqual({ servingG: 30, servingLabel: '30 g' });
    expect(usdaServing({ fdcId: 1, description: 'x', servingSize: 1, servingSizeUnit: 'IU' })).toEqual({});
  });
  it('SR Legacy foodMeasures (search) picks best-ranked gram portion', () => {
    const sr = { fdcId: 171077, description: 'Chicken, broilers or fryers, breast, meat only, cooked, roasted', dataType: 'SR Legacy',
      foodNutrients: [{ nutrientId: 1008, value: 165 }, { nutrientId: 1003, value: 31 }, { nutrientId: 1004, value: 3.57 }, { nutrientId: 1005, value: 0 }],
      foodMeasures: [{ disseminationText: 'Quantity not specified', gramWeight: 100, rank: 0 }, { disseminationText: 'cup, chopped or diced', gramWeight: 140, rank: 2 }, { disseminationText: '0.5 breast, bone and skin removed', gramWeight: 86, rank: 1 }] };
    const f = normalizeUsda(sr)!;
    expect(f).toMatchObject({ servingG: 86, servingLabel: '0.5 breast, bone and skin removed (86 g)', per100g: { kcal: 165, protein: 31 } });
    expect(macrosForGrams(f.per100g, 86).kcal).toBe(142);
  });
  it('Foundation foodPortions (detail endpoint)', () => {
    expect(usdaServing({ fdcId: 2, description: 'Eggs', foodPortions: [{ gramWeight: 50, amount: 1, measureUnit: { name: 'undetermined' }, modifier: 'large' }] })).toEqual({ servingG: 50, servingLabel: '1 large (50 g)' });
    expect(usdaServing({ fdcId: 3, description: 'x', foodPortions: [{ gramWeight: 244, amount: 1, measureUnit: { name: 'cup' } }] })).toEqual({ servingG: 244, servingLabel: '1 cup (244 g)' });
  });
  it('tidyServingText', () => { expect(tidyServingText('1 CHICKEN BREAST')).toBe('1 chicken breast'); expect(tidyServingText('1 Slice')).toBe('1 Slice'); });
});
