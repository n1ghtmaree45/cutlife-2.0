import type { Food } from '../types';
import { getJson, num, HttpError } from './http';
import { round } from '../lib/nutrition';

export const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1';
/** api.data.gov shared demo key: very low limits; users should paste their own free key in Settings. */
export const USDA_DEMO_KEY = 'DEMO_KEY';

export interface UsdaNutrient { nutrientId?: number; nutrientNumber?: string; nutrientName?: string; unitName?: string; value?: number; }
export interface UsdaFood {
  fdcId: number; description: string; dataType?: string; brandOwner?: string; brandName?: string; gtinUpc?: string;
  servingSize?: number; servingSizeUnit?: string; householdServingFullText?: string; foodNutrients?: UsdaNutrient[];
  /** Search results for SR Legacy / Survey (FNDDS) / Foundation carry portions here. */
  foodMeasures?: { disseminationText?: string; gramWeight?: number; rank?: number; modifier?: string }[];
  /** Full-detail endpoint (/food/{id}) uses foodPortions instead. */
  foodPortions?: { gramWeight?: number; amount?: number; modifier?: string; portionDescription?: string; measureUnit?: { name?: string } }[];
}

const ID = { kcal: 1008, kcalAtwaterGeneral: 2047, kcalAtwaterSpecific: 2048, kj: 1062, protein: 1003, fat: 1004, carbs: 1005, fiber: 1079 };

/** Normalize a /foods/search result (nutrients are per 100 g for all data types). */
export function normalizeUsda(f: UsdaFood): Food | null {
  const get = (id: number) => num(f.foodNutrients?.find(n => n.nutrientId === id || n.nutrientNumber === String(id))?.value);
  let kcal = get(ID.kcal) ?? get(ID.kcalAtwaterSpecific) ?? get(ID.kcalAtwaterGeneral);
  if (kcal == null) { const kj = get(ID.kj); if (kj != null) kcal = kj / 4.184; }
  const protein = get(ID.protein) ?? 0, carbs = get(ID.carbs) ?? 0, fat = get(ID.fat) ?? 0;
  if (kcal == null) { if (!protein && !carbs && !fat) return null; kcal = protein * 4 + carbs * 4 + fat * 9; }
  const { servingG, servingLabel } = usdaServing(f);
  return {
    id: `usda:${f.fdcId}`, source: 'usda', sourceId: String(f.fdcId),
    name: titleCase(f.description), brand: f.brandName || f.brandOwner || undefined, barcode: f.gtinUpc || undefined,
    per100g: { kcal: round(kcal), protein: round(protein, 1), carbs: round(carbs, 1), fat: round(fat, 1) },
    fiber100g: get(ID.fiber), servingG, servingLabel,
  };
}
const UNIT_ALIASES: Record<string, string> = { onz: 'oz', oz: 'oz', grm: 'g', g: 'g', mlt: 'ml', ml: 'ml', tbsp: 'tbsp', tsp: 'tsp', cup: 'cup', pc: 'piece', pcs: 'pieces' };
/** "1 CHICKEN BREAST" -> "1 chicken breast"; "2 ONZ" -> "2 oz". Leaves mixed-case text alone. */
export function tidyServingText(t: string): string {
  const s = t.trim().replace(/\s+/g, ' '); if (!s) return s;
  const lower = s === s.toUpperCase() ? s.toLowerCase() : s;
  return lower.replace(/\b([A-Za-z]+)\b/g, w => UNIT_ALIASES[w.toLowerCase()] ?? w);
}
const fmtG = (g: number) => `${Math.round(g * 10) / 10} g`;

/**
 * Serving grams + label. All search nutrients are per 100 g; this only picks a default portion.
 * Branded: servingSize in g/ml (ml treated as g), label = "<household text> (<g> g)".
 * Generic (SR Legacy/FNDDS/Foundation): first foodMeasures/foodPortions entry with a gramWeight.
 */
export function usdaServing(f: UsdaFood): { servingG?: number; servingLabel?: string } {
  const unit = f.servingSizeUnit?.toLowerCase();
  if (f.servingSize && f.servingSize > 0 && (unit === 'g' || unit === 'grm' || unit === 'ml' || unit === 'mlt')) {
    const g = f.servingSize; const hh = f.householdServingFullText ? tidyServingText(f.householdServingFullText) : '';
    const redundant = !hh || /^[\d.]+\s*(g|ml)$/i.test(hh);
    return { servingG: g, servingLabel: redundant ? fmtG(g) : `${hh} (${fmtG(g)})` };
  }
  const m = [...(f.foodMeasures ?? [])].filter(x => (x.gramWeight ?? 0) > 0 && !/quantity not specified/i.test(x.disseminationText ?? '')).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))[0];
  if (m) return { servingG: m.gramWeight, servingLabel: `${tidyServingText(m.disseminationText || m.modifier || 'serving')} (${fmtG(m.gramWeight!)})` };
  const p = (f.foodPortions ?? []).find(x => (x.gramWeight ?? 0) > 0);
  if (p) {
    const txt = p.portionDescription && !/quantity not specified/i.test(p.portionDescription) ? p.portionDescription : [p.amount, p.measureUnit?.name !== 'undetermined' ? p.measureUnit?.name : '', p.modifier].filter(Boolean).join(' ');
    return { servingG: p.gramWeight, servingLabel: `${tidyServingText(txt || 'serving')} (${fmtG(p.gramWeight!)})` };
  }
  return {};
}
const titleCase = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s,(])\p{L}/gu, c => c.toUpperCase()) : s);

export async function searchUsda(query: string, o: { apiKey?: string; pageSize?: number; dataTypes?: string[]; signal?: AbortSignal; fetchImpl?: typeof fetch } = {}): Promise<Food[]> {
  const q = query.trim(); if (!q) return [];
  const types = (o.dataTypes ?? ['Foundation', 'SR Legacy', 'Survey (FNDDS)', 'Branded']).map(t => `&dataType=${encodeURIComponent(t)}`).join('');
  const url = `${USDA_BASE}/foods/search?api_key=${encodeURIComponent(o.apiKey || USDA_DEMO_KEY)}&query=${encodeURIComponent(q)}&pageSize=${o.pageSize ?? 20}${types}`;
  let r: { foods?: UsdaFood[] };
  try { r = await getJson<{ foods?: UsdaFood[] }>(url, o); }
  catch (e) {
    if (o.signal?.aborted) throw e;
    const he = e as HttpError;
    // DEMO_KEY is shared and frequently rate-limited: tell the UI to ask for a personal key.
    if (!o.apiKey) throw new HttpError(he.status ?? 0, `USDA demo key failed (${he.message}). Add a free key from https://fdc.nal.usda.gov/api-key-signup in Settings.`, he.retryAfterS, 'usda_key_needed');
    throw he;
  }
  return (r.foods ?? []).map(normalizeUsda).filter((f): f is Food => !!f);
}
