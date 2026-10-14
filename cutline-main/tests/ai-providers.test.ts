import { describe, it, expect, vi } from 'vitest';
import { analyzePhoto, suggestMeals, AiError } from '../src/ai';
import { withBackoff } from '../src/ai/net';
import type { Settings } from '../src/types';

const base: Settings = { id: 'settings', units: 'kg', theme: 'system', provider: 'gemini', fallbackProvider: 'groq', apiKeys: { gemini: 'G', groq: 'Q' } };
const resp = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
const geminiOk = (text: string) => resp({ candidates: [{ content: { parts: [{ text }] } }] });
const groqOk = (text: string) => resp({ choices: [{ message: { content: text } }] });
const PHOTO = '{"foods":[{"name":"Rice","grams_estimate":150,"kcal":195,"protein":4,"carbs":42,"fat":0.4,"confidence":0.6}]}';
const SUGG = (n = 3) => JSON.stringify({ suggestions: Array.from({ length: n }, (_, i) => ({ name: `M${i}`, description: 'd', ingredients: [{ name: 'x', grams: 100 }], macros: { kcal: 400, protein: 40, carbs: 30, fat: 10 } })) });
const noSleep = async () => {};
const jpeg = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });

describe('Gemini photo analysis', () => {
  it('sends the key as a header (never in the URL) and parses fenced JSON', async () => {
    const f = vi.fn().mockResolvedValue(geminiOk('```json\n' + PHOTO + '\n```'));
    const r = await analyzePhoto(base, jpeg, { net: { fetchImpl: f as any } });
    expect(r.foods[0]).toMatchObject({ name: 'Rice', grams_estimate: 150, confidence: 0.6 });
    const [url, init] = f.mock.calls[0]; expect(String(url)).not.toContain('G'); expect(String(url)).not.toContain('key=');
    expect((init as any).headers['x-goog-api-key']).toBe('G');
    const sent = JSON.parse((init as any).body); expect(sent.contents[0].parts.some((p: any) => p.inline_data?.mime_type === 'image/jpeg')).toBe(true);
    expect(sent.generationConfig.responseMimeType).toBe('application/json');
  });
  it('rejects malformed model output as invalid_json (so the UI can offer Retry)', async () => {
    const f = vi.fn().mockResolvedValue(geminiOk('Sure! Here is your meal: rice.'));
    await expect(analyzePhoto({ ...base, fallbackProvider: undefined }, jpeg, { net: { fetchImpl: f as any } })).rejects.toMatchObject({ kind: 'invalid_json' });
    expect(f).toHaveBeenCalledTimes(1); // no silent retries on bad JSON
  });
  it('rejects JSON that is valid but the wrong shape', async () => {
    const f = vi.fn().mockResolvedValue(geminiOk('{"foods":[{"name":"","kcal":1}]}'));
    await expect(analyzePhoto({ ...base, fallbackProvider: undefined }, jpeg, { net: { fetchImpl: f as any } })).rejects.toMatchObject({ kind: 'invalid_json' });
  });
  it('reports a missing key without any network call', async () => {
    const f = vi.fn();
    await expect(analyzePhoto({ ...base, apiKeys: {}, fallbackProvider: undefined }, jpeg, { net: { fetchImpl: f as any } })).rejects.toMatchObject({ kind: 'no_key' });
    expect(f).not.toHaveBeenCalled();
  });
});

describe('429 backoff and fallback', () => {
  it('honours Retry-After, then succeeds on the same provider', async () => {
    const f = vi.fn().mockResolvedValueOnce(resp({}, 429, { 'retry-after': '3' })).mockResolvedValueOnce(geminiOk(SUGG()));
    const naps: number[] = [];
    const r = await suggestMeals(base, { remaining: { kcal: 600, protein: 50, carbs: 50, fat: 20 } }, { net: { fetchImpl: f as any }, sleepImpl: async ms => { naps.push(ms); } });
    expect(r.suggestions).toHaveLength(3); expect(naps).toEqual([3000]); expect(f).toHaveBeenCalledTimes(2);
  });
  it('uses 1s, 2s when there is no Retry-After, max 3 tries, then fails over to the fallback provider', async () => {
    const f = vi.fn((url: any) => Promise.resolve(String(url).includes('groq') ? groqOk(SUGG()) : resp({}, 429)));
    const naps: number[] = [];
    const r = await suggestMeals(base, { remaining: { kcal: 600, protein: 50, carbs: 50, fat: 20 } }, { net: { fetchImpl: f as any }, sleepImpl: async ms => { naps.push(ms); } });
    expect(naps).toEqual([1000, 2000]); expect(r.suggestions[0].name).toBe('M0');
    expect(f.mock.calls.filter(c => String(c[0]).includes('gemini') || String(c[0]).includes('googleapis')).length).toBe(3);
  });
  it('caps an absurd Retry-After at 15 s', async () => {
    const naps: number[] = []; let n = 0;
    await withBackoff(async () => { if (n++ < 1) throw new AiError('rate_limited', 'x', 600); return 1; }, { sleepImpl: async ms => { naps.push(ms); } });
    expect(naps).toEqual([15000]);
  });
  it('does not retry non-429 errors on the same provider', async () => {
    let n = 0; await expect(withBackoff(async () => { n++; throw new AiError('provider', 'boom'); }, { sleepImpl: noSleep })).rejects.toThrow('boom'); expect(n).toBe(1);
  });
  it('falls over when the primary is down (5xx) and when its key is bad', async () => {
    const f = vi.fn((url: any) => Promise.resolve(String(url).includes('groq') ? groqOk(SUGG()) : resp({ error: { message: 'down' } }, 503)));
    expect((await suggestMeals(base, { remaining: { kcal: 1, protein: 1, carbs: 1, fat: 1 } }, { net: { fetchImpl: f as any } })).suggestions).toHaveLength(3);
    const g = vi.fn((url: any) => Promise.resolve(String(url).includes('groq') ? groqOk(SUGG()) : resp({}, 403)));
    expect((await suggestMeals(base, { remaining: { kcal: 1, protein: 1, carbs: 1, fat: 1 } }, { net: { fetchImpl: g as any } })).suggestions).toHaveLength(3);
  });
  it('surfaces the last error when every provider fails', async () => {
    const f = vi.fn().mockResolvedValue(resp({}, 500));
    await expect(suggestMeals(base, { remaining: { kcal: 1, protein: 1, carbs: 1, fat: 1 } }, { net: { fetchImpl: f as any }, sleepImpl: noSleep })).rejects.toMatchObject({ kind: 'provider' });
  });
});

describe('Groq / OpenRouter (OpenAI dialect)', () => {
  it('sends a Bearer key and returns validated suggestions, capped at 3', async () => {
    const f = vi.fn().mockResolvedValue(groqOk(SUGG(5)));
    const r = await suggestMeals({ ...base, provider: 'groq', fallbackProvider: undefined }, { remaining: { kcal: 500, protein: 40, carbs: 40, fat: 15 }, allergies: 'peanuts' }, { net: { fetchImpl: f as any } });
    expect(r.suggestions).toHaveLength(3);
    const [url, init] = f.mock.calls[0]; expect(String(url)).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((init as any).headers.Authorization).toBe('Bearer Q');
    expect(JSON.parse((init as any).body).messages[0].content).toContain('peanuts');
  });
  it('OpenRouter photo uses an image_url data URI and the user-chosen model', async () => {
    const f = vi.fn().mockResolvedValue(groqOk(PHOTO));
    await analyzePhoto({ ...base, provider: 'openrouter', fallbackProvider: undefined, apiKeys: { openrouter: 'R' }, models: { openrouter: 'my/vision:free' } }, jpeg, { net: { fetchImpl: f as any } });
    const body = JSON.parse((f.mock.calls[0][1] as any).body); expect(body.model).toBe('my/vision:free');
    expect(body.messages[1].content[1].image_url.url.startsWith('data:image/jpeg;base64,')).toBe(true); expect(String(f.mock.calls[0][0])).toContain('openrouter.ai');
  });
});
