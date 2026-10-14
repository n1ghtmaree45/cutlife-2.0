import { describe, it, expect } from 'vitest';
import { extractJson, validatePhotoAnalysis, validateMealSuggestions } from '../src/ai/json';
describe('ai json', () => {
  it('strips fences and prose', () => {
    expect(extractJson('```json\n{"foods":[]}\n```')).toEqual({ foods: [] });
    expect(extractJson('Sure! {"a":1} hope that helps')).toEqual({ a: 1 });
  });
  it('validates photo', () => {
    const v = validatePhotoAnalysis({ foods: [{ name: 'Rice', grams_estimate: '150', kcal: 195, protein: 4, carbs: 42, fat: 0.4, confidence: 2 }] });
    expect(v.foods[0]).toMatchObject({ grams_estimate: 150, confidence: 1 });
    expect(() => validatePhotoAnalysis({ foods: [{ name: 'x', kcal: -1 }] })).toThrow();
  });
  it('validates suggestions', () => {
    expect(validateMealSuggestions({ suggestions: [{ name: 'a', macros: { kcal: 1, protein: 1, carbs: 1, fat: 1 } }] }).suggestions).toHaveLength(1);
    expect(() => validateMealSuggestions({})).toThrow();
  });
});
