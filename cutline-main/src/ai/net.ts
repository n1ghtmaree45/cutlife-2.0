import { AiError } from './types';
import { sleep } from '../api/http';

export interface PostOpts { signal?: AbortSignal; fetchImpl?: typeof fetch; timeoutMs?: number; }

/** POST JSON. Maps HTTP/network failures to AiError. Never retries by itself (see withBackoff). */
export async function postJson(url: string, body: unknown, headers: Record<string, string>, o: PostOpts = {}): Promise<any> {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), o.timeoutMs ?? 45000);
  o.signal?.addEventListener('abort', () => ctl.abort());
  let r: Response;
  try {
    r = await (o.fetchImpl ?? fetch)(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctl.signal });
  } catch (e) {
    if (o.signal?.aborted) throw e;
    throw new AiError('network', ctl.signal.aborted ? 'The AI provider took too long to answer.' : 'Could not reach the AI provider. Check your connection.');
  } finally { clearTimeout(t); }
  if (r.status === 429) {
    const ra = Number(r.headers.get('retry-after'));
    throw new AiError('rate_limited', 'The AI provider is rate-limiting you (free tier).', Number.isFinite(ra) && ra > 0 ? ra : undefined);
  }
  if (r.status === 401 || r.status === 403) throw new AiError('no_key', 'The AI provider rejected your API key. Check it in Settings.');
  if (!r.ok) {
    let detail = ''; try { detail = (await r.json())?.error?.message ?? ''; } catch { /* ignore */ }
    throw new AiError('provider', `AI provider error ${r.status}${detail ? `: ${String(detail).slice(0, 160)}` : ''}`);
  }
  try { return await r.json(); } catch { throw new AiError('invalid_json', 'The AI provider sent an unreadable response.'); }
}

/** 429 backoff: honour Retry-After (capped at 15 s), otherwise 1 s, 2 s, 4 s. Max 3 tries on rate limits only. */
export async function withBackoff<T>(fn: () => Promise<T>, o: { signal?: AbortSignal; sleepImpl?: (ms: number) => Promise<void> } = {}): Promise<T> {
  const nap = o.sleepImpl ?? sleep; let last: unknown;
  for (let i = 0; i < 3; i++) {
    try { return await fn(); }
    catch (e) {
      last = e;
      if (!(e instanceof AiError) || e.kind !== 'rate_limited' || o.signal?.aborted) throw e;
      if (i < 2) await nap(Math.min(15, e.retryAfterS ?? 2 ** i) * 1000);
    }
  }
  throw last;
}
export { blobToBase64 } from '../lib/blob';
