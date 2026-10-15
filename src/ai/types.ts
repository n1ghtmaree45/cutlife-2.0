// AI layer contract (implementation lands in M3/M4). Published now so UI can code against it.
import type { AiProviderId, Macros } from '../types';

export interface PhotoFood { name: string; grams_estimate: number; kcal: number; protein: number; carbs: number; fat: number; confidence: number; }
export interface PhotoAnalysis { foods: PhotoFood[]; }

export interface MealSuggestion { name: string; description: string; ingredients: { name: string; grams: number }[]; macros: Macros; prepMinutes?: number; }
export interface MealSuggestions { suggestions: MealSuggestion[]; } // exactly 3

export interface SuggestInput { remaining: Macros; preferences?: string; allergies?: string; pantry?: string; }

export interface AiProvider {
  id: AiProviderId;
  /** jpegBlob: already resized to max 1024px, quality ~0.7 (see resizeImage in M3). Never persisted. */
  analyzePhoto(jpegBlob: Blob, opts?: { signal?: AbortSignal; hint?: string }): Promise<PhotoAnalysis>;
  suggestMeals(input: SuggestInput, opts?: { signal?: AbortSignal }): Promise<MealSuggestions>;
}

export class AiError extends Error {
  constructor(public kind: 'no_key' | 'rate_limited' | 'invalid_json' | 'network' | 'provider', msg: string, public retryAfterS?: number) { super(msg); }
}

/** Honest label for UI: estimates are +/-20-30% at best. */
export function confidenceLabel(c: number): 'High' | 'Medium' | 'Low' { return c >= 0.75 ? 'High' : c >= 0.5 ? 'Medium' : 'Low'; }
