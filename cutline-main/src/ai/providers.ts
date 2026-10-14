import type { AiProvider, PhotoAnalysis, MealSuggestions, SuggestInput } from './types';
import { AiError } from './types';
import { extractJson, validatePhotoAnalysis, validateMealSuggestions } from './json';
import { PHOTO_SYSTEM, suggestPrompt } from './prompts';
import { postJson, blobToBase64, type PostOpts } from './net';
import type { AiProviderId } from '../types';

/** Names change month to month: these are only defaults, every one is editable in Settings (settings.models). */
export const DEFAULT_MODELS: Record<AiProviderId, string> = {
  gemini: 'gemini-3.5-flash',
  groq: 'openai/gpt-oss-120b',            // text only (meal suggestions). Set a vision-capable model in Settings for photos.
  openrouter: 'google/gemma-3-27b-it:free', // multimodal :free model; unverified, change it if OpenRouter retires it
};
export const PROVIDER_LABEL: Record<AiProviderId, string> = { gemini: 'Google Gemini', groq: 'Groq', openrouter: 'OpenRouter' };

function parse<T>(text: unknown, validate: (v: unknown) => T): T {
  if (typeof text !== 'string' || !text.trim()) throw new AiError('invalid_json', 'The model returned an empty answer.');
  try { return validate(extractJson(text)); }
  catch (e) { throw new AiError('invalid_json', `The model's answer was not valid JSON for this task (${(e as Error).message}).`); }
}

export interface ProviderCfg { apiKey?: string; model?: string; net?: PostOpts; }

export function geminiProvider(c: ProviderCfg): AiProvider {
  const model = c.model || DEFAULT_MODELS.gemini;
  const call = async (parts: unknown[], system: string | undefined, signal?: AbortSignal) => {
    if (!c.apiKey) throw new AiError('no_key', 'Add your Gemini API key in Settings.');
    const data = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      { ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } },
      { 'x-goog-api-key': c.apiKey }, { ...c.net, signal });
    return data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
  };
  return {
    id: 'gemini',
    async analyzePhoto(blob, o): Promise<PhotoAnalysis> {
      const b64 = await blobToBase64(blob);
      return parse(await call([{ text: o?.hint ? `Hint from the user: ${o.hint}` : 'Analyze this meal.' }, { inline_data: { mime_type: 'image/jpeg', data: b64 } }], PHOTO_SYSTEM, o?.signal), validatePhotoAnalysis);
    },
    async suggestMeals(i: SuggestInput, o): Promise<MealSuggestions> {
      return parse(await call([{ text: suggestPrompt(i) }], undefined, o?.signal), validateMealSuggestions);
    },
  };
}

/** Groq and OpenRouter both speak the OpenAI chat-completions dialect. */
export function openAiCompatProvider(id: 'groq' | 'openrouter', c: ProviderCfg): AiProvider {
  const url = id === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
  const model = c.model || DEFAULT_MODELS[id];
  const call = async (messages: unknown[], signal?: AbortSignal) => {
    if (!c.apiKey) throw new AiError('no_key', `Add your ${PROVIDER_LABEL[id]} API key in Settings.`);
    const data = await postJson(url, { model, messages, temperature: 0.2, response_format: { type: 'json_object' }, stream: false }, { Authorization: `Bearer ${c.apiKey}` }, { ...c.net, signal });
    return data?.choices?.[0]?.message?.content ?? '';
  };
  return {
    id,
    async analyzePhoto(blob, o): Promise<PhotoAnalysis> {
      const b64 = await blobToBase64(blob);
      return parse(await call([{ role: 'system', content: PHOTO_SYSTEM },
        { role: 'user', content: [{ type: 'text', text: o?.hint ? `Hint from the user: ${o.hint}` : 'Analyze this meal.' }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } }] }], o?.signal), validatePhotoAnalysis);
    },
    async suggestMeals(i, o): Promise<MealSuggestions> {
      return parse(await call([{ role: 'user', content: suggestPrompt(i) }], o?.signal), validateMealSuggestions);
    },
  };
}

export function makeProvider(id: AiProviderId, c: ProviderCfg): AiProvider { return id === 'gemini' ? geminiProvider(c) : openAiCompatProvider(id, c); }
