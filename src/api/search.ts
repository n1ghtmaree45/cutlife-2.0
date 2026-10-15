import type { Food } from '../types';
import { searchOff } from './off';
import { searchUsda } from './usda';
import { searchLocalFoods } from '../data/db';

import type { ApiErrorCode } from './http';
export interface SearchResult { foods: Food[]; errors: { source: 'off' | 'usda' | 'local'; code: ApiErrorCode | 'unknown'; message: string }[]; }

/**
 * Unified search: local custom/saved foods first, then USDA (generic foods) and OFF (branded) interleaved,
 * de-duplicated by id and by name+brand. Never throws; per-source failures are reported in `errors`.
 */
export async function searchFoods(query: string, o: { usdaKey?: string; limit?: number; signal?: AbortSignal; includeLocal?: boolean } = {}): Promise<SearchResult> {
  const errors: SearchResult['errors'] = [];
  const wrap = <T>(src: SearchResult['errors'][number]['source'], p: Promise<T[]>) => p.catch(e => { errors.push({ source: src, code: (e as { code?: ApiErrorCode })?.code ?? 'unknown', message: String((e as Error)?.message ?? e) }); return [] as T[]; });
  const [local, usda, off] = await Promise.all([
    o.includeLocal === false ? Promise.resolve([] as Food[]) : wrap('local', searchLocalFoods(query)),
    wrap('usda', searchUsda(query, { apiKey: o.usdaKey, signal: o.signal })),
    wrap('off', searchOff(query, { signal: o.signal })),
  ]);
  return { foods: mergeResults(local, usda, off, o.limit ?? 40), errors };
}

export function mergeResults(local: Food[], a: Food[], b: Food[], limit: number): Food[] {
  const out: Food[] = []; const seen = new Set<string>();
  const push = (f: Food) => { const k2 = `${f.name.toLowerCase()}|${(f.brand ?? '').toLowerCase()}`; if (seen.has(f.id) || seen.has(k2)) return; seen.add(f.id); seen.add(k2); out.push(f); };
  local.forEach(push);
  for (let i = 0; i < Math.max(a.length, b.length); i++) { if (a[i]) push(a[i]); if (b[i]) push(b[i]); }
  return out.slice(0, limit);
}
