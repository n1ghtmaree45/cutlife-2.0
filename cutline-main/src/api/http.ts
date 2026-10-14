export type ApiErrorCode = 'rate_limited' | 'bad_key' | 'unavailable' | 'network' | 'timeout' | 'bad_response' | 'usda_key_needed' | 'off_unavailable';
export class HttpError extends Error {
  constructor(public status: number, msg: string, public retryAfterS?: number, public code: ApiErrorCode = 'bad_response') { super(msg); }
}
const codeFor = (s: number): ApiErrorCode => (s === 429 ? 'rate_limited' : s === 401 || s === 403 ? 'bad_key' : s >= 500 ? 'unavailable' : 'bad_response');

/**
 * Simple CORS GET: no custom request headers at all (avoids preflight), query params only.
 * Throws HttpError with a `code` on non-2xx, network failure, timeout or non-JSON body.
 */
export async function getJson<T>(url: string, opts: { timeoutMs?: number; signal?: AbortSignal; fetchImpl?: typeof fetch } = {}): Promise<T> {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 10000);
  opts.signal?.addEventListener('abort', () => ctl.abort());
  const bare = url.split('?')[0];
  let r: Response;
  try { r = await (opts.fetchImpl ?? fetch)(url, { signal: ctl.signal, method: 'GET', credentials: 'omit' }); }
  catch (e) {
    clearTimeout(t);
    if (opts.signal?.aborted) throw e;
    const timedOut = ctl.signal.aborted;
    throw new HttpError(0, `${timedOut ? 'Timeout' : 'Network/CORS error'} for ${bare}`, undefined, timedOut ? 'timeout' : 'network');
  }
  try {
    if (!r.ok) { const ra = Number(r.headers.get('retry-after')); throw new HttpError(r.status, `HTTP ${r.status} for ${bare}`, Number.isFinite(ra) && ra > 0 ? ra : undefined, codeFor(r.status)); }
    try { return (await r.json()) as T; } catch { throw new HttpError(r.status, `Non-JSON response from ${bare}`, undefined, 'bad_response'); }
  } finally { clearTimeout(t); }
}
export const num = (v: unknown): number | undefined => { const n = typeof v === 'string' ? parseFloat(v) : (v as number); return typeof n === 'number' && Number.isFinite(n) ? n : undefined; };
export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
