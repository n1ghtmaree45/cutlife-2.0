import type { Food } from '../types';
import { getJson, num, sleep, HttpError } from './http';
import { round } from '../lib/nutrition';

export const OFF_BASE = 'https://world.openfoodfacts.org';
const FIELDS = 'code,product_name,product_name_en,generic_name,brands,nutriments,serving_size,serving_quantity,quantity';

export interface OffProduct {
  code?: string; product_name?: string; product_name_en?: string; generic_name?: string; brands?: string | string[];
  serving_size?: string; serving_quantity?: number | string;
  nutriments?: Record<string, number | string | undefined>;
}

/** Normalize an OFF product to Food (per 100 g). Returns null if no usable energy data. */
export function normalizeOff(p: OffProduct): Food | null {
  const n = p.nutriments ?? {};
  let kcal = num(n['energy-kcal_100g']);
  if (kcal == null) { const kj = num(n['energy-kj_100g']) ?? num(n['energy_100g']); if (kj != null) kcal = kj / 4.184; }
  const protein = num(n['proteins_100g']) ?? 0, carbs = num(n['carbohydrates_100g']) ?? 0, fat = num(n['fat_100g']) ?? 0;
  if (kcal == null) { if (!protein && !carbs && !fat) return null; kcal = protein * 4 + carbs * 4 + fat * 9; }
  const name = (p.product_name || p.product_name_en || p.generic_name || '').trim();
  if (!name || !p.code) return null;
  const servingG = num(p.serving_quantity);
  return {
    id: `off:${p.code}`, source: 'off', sourceId: p.code, barcode: p.code, name,
    brand: (Array.isArray(p.brands) ? p.brands[0] : p.brands?.split(',')[0])?.trim() || undefined,
    per100g: { kcal: round(kcal), protein: round(protein, 1), carbs: round(carbs, 1), fat: round(fat, 1) },
    fiber100g: num(n['fiber_100g']),
    servingG: servingG && servingG > 0 ? servingG : undefined,
    servingLabel: p.serving_size || undefined,
  };
}

/** Barcode lookup. Returns null when the product is unknown or lacks nutrition data. */
export async function lookupBarcode(code: string, o: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {}): Promise<Food | null> {
  const clean = code.replace(/\D/g, ''); if (!clean) return null;
  try {
    const r = await getJson<{ status: number; product?: OffProduct }>(`${OFF_BASE}/api/v2/product/${clean}.json?fields=${FIELDS}`, o);
    return r.status === 1 && r.product ? normalizeOff({ code: clean, ...r.product }) : null;
  } catch (e) { if ((e as { status?: number }).status === 404) return null; throw e; }
}

/**
 * Full-text search via OFF legacy cgi/search.pl (the only OFF full-text endpoint that returns
 * Access-Control-Allow-Origin: * as of 2026-10-12; search.openfoodfacts.org sends no CORS headers,
 * /api/v2/search has no full-text param). OFF intermittently serves a 503 HTML page without CORS
 * headers, which the browser reports as a CORS error, so we retry once, then throw code 'off_unavailable'.
 */
export async function searchOff(query: string, o: { pageSize?: number; signal?: AbortSignal; fetchImpl?: typeof fetch; retryDelayMs?: number } = {}): Promise<Food[]> {
  const q = query.trim(); if (!q) return [];
  const url = `${OFF_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=${o.pageSize ?? 20}&fields=${FIELDS}`;
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await getJson<{ products?: OffProduct[] }>(url, { ...o, timeoutMs: 12000 });
      return (r.products ?? []).map(normalizeOff).filter((f): f is Food => !!f);
    } catch (e) {
      if (o.signal?.aborted) throw e;
      last = e; if (attempt === 0) await sleep(o.retryDelayMs ?? 1200);
    }
  }
  throw new HttpError((last as HttpError)?.status ?? 0, `Open Food Facts search unavailable: ${(last as Error)?.message}`, undefined, 'off_unavailable');
}
