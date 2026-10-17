import { describe, it, expect } from 'vitest';
import { generatePlan, BUILTIN_TEMPLATES, templateAllowed, excludedTags, PlanError, itemsMacros, SLOTS } from '../src/lib/mealplan';
import { SEED_FOODS } from '../src/data/seedFoods';

const T = (kcal: number, protein: number, carbs: number, fat: number) => ({ kcal, protein, carbs, fat });
const profiles = [T(1500, 130, 120, 50), T(1800, 150, 160, 60), T(2200, 160, 230, 70), T(2800, 180, 320, 85), T(1300, 95, 130, 45)];

describe('meal planner', () => {
  it('every template references known foods and belongs to a slot', () => {
    for (const t of BUILTIN_TEMPLATES) { expect(SLOTS).toContain(t.slot); for (const i of t.items) expect(SEED_FOODS[i.food], `${t.id}:${i.food}`).toBeTruthy(); }
  });

  for (const target of profiles) it(`hits ${target.kcal} kcal within 3% every day, with honest per-meal numbers`, () => {
    const plan = generatePlan(target, { seed: 42 });
    expect(plan.days).toHaveLength(7);
    for (const d of plan.days) {
      expect(Math.abs(d.kcalDiffPct)).toBeLessThanOrEqual(3);
      expect(d.meals.map(m => m.slot)).toEqual(SLOTS);
      // totals are recomputed from grams, never trusted from a template
      const recomputed = itemsMacros(d.meals.flatMap(m => m.items));
      expect(Math.abs(recomputed.kcal - d.totals.kcal)).toBeLessThanOrEqual(4);
      for (const m of d.meals) for (const i of m.items) { expect(i.grams).toBeGreaterThanOrEqual(5); expect(i.grams).toBeLessThanOrEqual(900); }
    }
  });

  it('gets protein close to target on typical targets and warns when it cannot', () => {
    const plan = generatePlan(T(1800, 150, 160, 60), { seed: 7 });
    const avg = plan.days.reduce((a, d) => a + d.totals.protein, 0) / 7;
    expect(avg).toBeGreaterThan(150 * 0.8);
    for (const d of plan.days) if (d.totals.protein < 150 * 0.85) expect(d.warnings).toContain('protein_low');
  });

  it('varies the menu across the week', () => {
    const plan = generatePlan(T(2000, 150, 200, 65), { seed: 3 });
    const dinners = new Set(plan.days.map(d => d.meals[2]!.templateId));
    expect(dinners.size).toBeGreaterThanOrEqual(4);
  });

  it('is reproducible for the same seed', () => {
    const a = generatePlan(T(2000, 150, 200, 65), { seed: 5, now: 1 }); const b = generatePlan(T(2000, 150, 200, 65), { seed: 5, now: 1 });
    expect(a).toEqual(b);
  });

  it('never serves an excluded food', () => {
    const r = { vegetarian: true, noDairy: true, noNuts: true, noGluten: true, noEgg: true };
    const ex = excludedTags(r);
    const plan = generatePlan(T(2000, 120, 250, 60), { seed: 9, restrictions: r });
    for (const d of plan.days) for (const m of d.meals) for (const i of m.items) expect(SEED_FOODS[i.food]!.tags.some(g => ex.has(g)), `${m.templateId}:${i.food}`).toBe(false);
  });

  it('fails clearly when restrictions leave a meal slot empty', () => {
    const onlyBreakfast = BUILTIN_TEMPLATES.filter(t => t.slot === 'breakfast');
    expect(() => generatePlan(T(2000, 120, 250, 60), { templates: onlyBreakfast })).toThrow(PlanError);
    // the strictest vegan / gluten-free / nut-free setup must still produce a full week
    expect(generatePlan(T(2000, 120, 250, 60), { seed: 1, restrictions: { vegetarian: true, noDairy: true, noEgg: true, noNuts: true, noGluten: true } }).days).toHaveLength(7);
  });

  it('template filter agrees with tags', () => {
    const fishy = BUILTIN_TEMPLATES.find(t => t.id === 'd-cod')!;
    expect(templateAllowed(fishy, excludedTags({ noFish: true }))).toBe(false);
    expect(templateAllowed(fishy, excludedTags({ noDairy: true }))).toBe(true);
  });
});

import { validatePlanIdeas } from '../src/ai/json';

describe('AI menu ideas', () => {
  const good = (slot: string, n: number) => ({ slot, name: `${slot} idea ${n}`, items: [{ food: 'chicken', grams: 120 }, { food: 'rice', grams: 150 }] });
  const ideas = { meals: [good('breakfast', 1), good('lunch', 1), good('dinner', 1), good('snack', 1)] };

  it('keeps valid ideas and drops invented foods, silly grams, bad slots and duplicates', () => {
    const v = validatePlanIdeas({ meals: [...ideas.meals,
      { slot: 'lunch', name: 'Dragon stew', items: [{ food: 'dragon_meat', grams: 100 }, { food: 'rice', grams: 100 }] },
      { slot: 'lunch', name: 'Huge rice', items: [{ food: 'rice', grams: 5000 }, { food: 'chicken', grams: 100 }] },
      { slot: 'brunch', name: 'Brunch thing', items: [{ food: 'egg', grams: 100 }, { food: 'bread', grams: 50 }] },
      { slot: 'dinner', name: 'Rice rice', items: [{ food: 'rice', grams: 100 }, { food: 'rice', grams: 100 }] }] });
    expect(v.meals).toHaveLength(4);
  });
  it('rejects a useless answer', () => { expect(() => validatePlanIdeas({ meals: [] })).toThrow(); expect(() => validatePlanIdeas({})).toThrow(); });

  it('AI meals go through the same calorie maths and the same restriction filter', () => {
    const extra = validatePlanIdeas(ideas).meals.map((m, i) => ({ id: `ai-${i}`, slot: m.slot, name: { en: m.name, el: m.name }, ai: true, items: m.items.map(x => ({ food: x.food, g: x.grams })) }));
    const plan = generatePlan(T(2000, 150, 200, 65), { seed: 2, extraTemplates: extra });
    expect(plan.usedAi).toBe(true);
    for (const d of plan.days) expect(Math.abs(d.kcalDiffPct)).toBeLessThanOrEqual(3);
    const veg = generatePlan(T(2000, 120, 250, 60), { seed: 2, extraTemplates: extra, restrictions: { vegetarian: true } });
    for (const d of veg.days) for (const m of d.meals) expect(m.ai).toBe(false); // chicken-based AI meals are filtered out
  });
});
