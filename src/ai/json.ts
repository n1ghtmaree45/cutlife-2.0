import type { PhotoAnalysis, MealSuggestions, PlanIdeas, PlanIdea } from './types';
import { SEED_FOODS } from '../data/seedFoods';

/** Strip ```json fences / leading prose and parse the first JSON object. Throws on failure. */
export function extractJson(text: string): unknown {
  let t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s > 0 || (e >= 0 && e < t.length - 1)) t = t.slice(s, e + 1);
  return JSON.parse(t);
}
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function validatePhotoAnalysis(v: unknown): PhotoAnalysis {
  const foods = (v as { foods?: unknown })?.foods;
  if (!Array.isArray(foods)) throw new Error('missing foods[]');
  return {
    foods: foods.map((f: any, i) => {
      if (typeof f?.name !== 'string' || !f.name.trim()) throw new Error(`foods[${i}].name invalid`);
      for (const k of ['grams_estimate', 'kcal', 'protein', 'carbs', 'fat']) if (!isNum(Number(f[k]))) throw new Error(`foods[${i}].${k} invalid`);
      return { name: f.name.trim(), grams_estimate: +f.grams_estimate, kcal: +f.kcal, protein: +f.protein, carbs: +f.carbs, fat: +f.fat, confidence: clamp01(Number(f.confidence ?? 0.5)) };
    }),
  };
}

export function validateMealSuggestions(v: unknown): MealSuggestions {
  const s = (v as { suggestions?: unknown })?.suggestions;
  if (!Array.isArray(s) || s.length < 1) throw new Error('missing suggestions[]');
  return {
    suggestions: s.slice(0, 3).map((m: any, i) => {
      if (typeof m?.name !== 'string') throw new Error(`suggestions[${i}].name invalid`);
      const mc = m.macros ?? {};
      for (const k of ['kcal', 'protein', 'carbs', 'fat']) if (!isNum(Number(mc[k]))) throw new Error(`suggestions[${i}].macros.${k} invalid`);
      return {
        name: m.name, description: String(m.description ?? ''),
        ingredients: Array.isArray(m.ingredients) ? m.ingredients.map((x: any) => ({ name: String(x?.name ?? ''), grams: Number(x?.grams) || 0 })) : [],
        macros: { kcal: +mc.kcal, protein: +mc.protein, carbs: +mc.carbs, fat: +mc.fat },
        prepMinutes: m.prepMinutes != null ? Number(m.prepMinutes) : undefined,
      };
    }),
  };
}

const SLOT_SET = new Set(['breakfast', 'lunch', 'dinner', 'snack']);
/** Keeps only ideas that use known ingredient ids and sane grams; the app, not the model, decides the numbers. */
export function validatePlanIdeas(v: unknown): PlanIdeas {
  const raw = (v as { meals?: unknown })?.meals;
  if (!Array.isArray(raw)) throw new Error('missing meals[]');
  const meals: PlanIdea[] = [];
  for (const m of raw as any[]) {
    if (!SLOT_SET.has(m?.slot) || typeof m?.name !== 'string' || m.name.trim().length < 3 || !Array.isArray(m?.items)) continue;
    const items = m.items.map((x: any) => ({ food: String(x?.food ?? ''), grams: Number(x?.grams) }));
    if (items.length < 2 || items.length > 6) continue;
    if (items.some((x: { food: string; grams: number }) => !SEED_FOODS[x.food] || !Number.isFinite(x.grams) || x.grams < 5 || x.grams > 800)) continue;
    if (new Set(items.map((x: { food: string }) => x.food)).size !== items.length) continue;
    meals.push({ slot: m.slot, name: m.name.trim().slice(0, 80), items });
  }
  if (meals.length < 4) throw new Error(`only ${meals.length} usable meal ideas`);
  return { meals };
}
