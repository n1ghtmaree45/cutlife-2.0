import type { Settings, AiProviderId } from '../types';
import { AiError, type AiProvider, type PhotoAnalysis, type MealSuggestions, type SuggestInput } from './types';
import { makeProvider } from './providers';
import { withBackoff, type PostOpts } from './net';

export * from './types';
export { DEFAULT_MODELS, PROVIDER_LABEL } from './providers';

/** Primary provider first (3 tries on 429 with backoff), then the fallback provider if one is configured. */
export function providerChain(s: Settings, net?: PostOpts): AiProvider[] {
  const ids = [s.provider, s.fallbackProvider].filter((x, i, a): x is AiProviderId => !!x && a.indexOf(x) === i);
  return ids.map(id => makeProvider(id, { apiKey: s.apiKeys?.[id], model: s.models?.[id], net }));
}

async function run<T>(chain: AiProvider[], op: (p: AiProvider) => Promise<T>, signal?: AbortSignal, sleepImpl?: (ms: number) => Promise<void>): Promise<T> {
  let lastErr: unknown;
  for (const p of chain) {
    try { return await withBackoff(() => op(p), { signal, sleepImpl }); }
    catch (e) {
      if (signal?.aborted) throw e;
      lastErr = e;
      if (e instanceof AiError && e.kind === 'no_key' && chain.length > 1) continue; // try the next provider
      if (e instanceof AiError && (e.kind === 'rate_limited' || e.kind === 'network' || e.kind === 'provider')) continue;
      throw e; // invalid_json: surface it so the UI can offer Retry
    }
  }
  throw lastErr instanceof Error ? lastErr : new AiError('provider', 'No AI provider is configured.');
}

export const analyzePhoto = (s: Settings, blob: Blob, o: { signal?: AbortSignal; hint?: string; net?: PostOpts; sleepImpl?: (ms: number) => Promise<void> } = {}): Promise<PhotoAnalysis> =>
  run(providerChain(s, o.net), p => p.analyzePhoto(blob, { signal: o.signal, hint: o.hint }), o.signal, o.sleepImpl);
export const suggestMeals = (s: Settings, i: SuggestInput, o: { signal?: AbortSignal; net?: PostOpts; sleepImpl?: (ms: number) => Promise<void> } = {}): Promise<MealSuggestions> =>
  run(providerChain(s, o.net), p => p.suggestMeals(i, { signal: o.signal }), o.signal, o.sleepImpl);

/** Resize to max 1024 px on the longest side, JPEG q=0.7. Runs in the browser only. The image is never stored. */
export async function resizeImage(file: Blob, max = 1024, quality = 0.7): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d')!.drawImage(bmp, 0, 0, w, h); bmp.close?.();
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Could not encode image'))), 'image/jpeg', quality));
}
