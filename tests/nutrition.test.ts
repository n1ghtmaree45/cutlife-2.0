import { describe, it, expect } from 'vitest';
import * as N from '../src/lib/nutrition';

describe('BMR/TDEE', () => {
  it('Mifflin-St Jeor male/female', () => {
    expect(N.bmr('male', 80, 180, 30)).toBeCloseTo(1780, 5);
    expect(N.bmr('female', 60, 165, 30)).toBeCloseTo(1320.25, 5);
  });
  it('tdee factors', () => { expect(N.tdee(1780, 'moderate')).toBeCloseTo(2759, 0); });
  it('age', () => { expect(N.ageFromBirthDate('1990-06-15', new Date('2026-06-14T12:00:00'))).toBe(35); expect(N.ageFromBirthDate('1990-06-15', new Date('2026-06-15T12:00:00'))).toBe(36); });
});

describe('computeTargets', () => {
  it('20% deficit within cap', () => {
    const r = N.computeTargets({ sex: 'male', weightKg: 80, heightCm: 180, age: 30, activity: 'moderate', goal: 'lose', deficitPct: 0.2 });
    expect(r.tdee).toBe(2759); expect(r.targets.kcal).toBe(2207); expect(r.warnings).toEqual([]);
    expect(r.targets.protein).toBe(144);
    const k = r.targets.protein * 4 + r.targets.carbs * 4 + r.targets.fat * 9;
    expect(Math.abs(k - r.targets.kcal)).toBeLessThanOrEqual(4);
    expect(r.expectedWeeklyKg).toBeLessThan(0);
    expect(-r.expectedWeeklyKg).toBeLessThanOrEqual(80 * 0.0075 + 1e-9);
  });
  it('caps rate at 0.75% bw/week', () => {
    const r = N.computeTargets({ sex: 'male', weightKg: 70, heightCm: 180, age: 25, activity: 'very_active', goal: 'lose', deficitPct: 0.25 });
    expect(r.warnings).toContain('rate_capped'); expect(r.dailyDeficit).toBe(r.maxDailyDeficit);
  });
  it('applies female floor', () => {
    const r = N.computeTargets({ sex: 'female', weightKg: 50, heightCm: 155, age: 60, activity: 'sedentary', goal: 'lose', deficitPct: 0.25 });
    expect(r.targets.kcal).toBe(1200); expect(r.warnings).toContain('floor_applied');
  });
  it('male floor + out-of-range warnings', () => {
    const r = N.computeTargets({ sex: 'male', weightKg: 55, heightCm: 160, age: 70, activity: 'sedentary', goal: 'lose', deficitPct: 0.4, proteinGPerKg: 3 });
    expect(r.targets.kcal).toBeGreaterThanOrEqual(1500);
    expect(r.warnings).toEqual(expect.arrayContaining(['deficit_out_of_range', 'protein_out_of_range']));
  });
  it('maintain/gain', () => {
    const base = { sex: 'male' as const, weightKg: 80, heightCm: 180, age: 30, activity: 'moderate' as const };
    expect(N.computeTargets({ ...base, goal: 'maintain' }).targets.kcal).toBe(2759);
    expect(N.computeTargets({ ...base, goal: 'gain' }).targets.kcal).toBe(3035);
  });
  it('aggressive rate check', () => { expect(N.isRateTooAggressive(1, 80)).toBe(true); expect(N.isRateTooAggressive(0.5, 80)).toBe(false); });
});

describe('portions & recipes', () => {
  it('macrosForGrams', () => { expect(N.macrosForGrams({ kcal: 165, protein: 31, carbs: 0, fat: 3.6 }, 150)).toEqual({ kcal: 248, protein: 46.5, carbs: 0, fat: 5.4 }); });
  it('recipePer100g raw and cooked', () => {
    const foods = { a: { id: 'a', source: 'custom', name: 'rice', per100g: { kcal: 360, protein: 7, carbs: 80, fat: 1 } }, b: { id: 'b', source: 'custom', name: 'oil', per100g: { kcal: 900, protein: 0, carbs: 0, fat: 100 } } } as any;
    const ings = [{ foodId: 'a', grams: 100 }, { foodId: 'b', grams: 10 }];
    expect(N.recipePer100g(ings, foods).kcal).toBe(409);
    expect(N.recipePer100g(ings, foods, 300).kcal).toBe(150);
  });
  it('units', () => { expect(N.lbToKg(N.kgToLb(80))).toBeCloseTo(80, 9); });
  it('kcalFromMacros', () => { expect(N.kcalFromMacros({ protein: 10, carbs: 10, fat: 10 })).toBe(170); });
});

describe('weight trend', () => {
  const series = Array.from({ length: 15 }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, kg: 90 - i * 0.1, createdAt: 0 }));
  it('moving average', () => {
    const ma = N.movingAverage7(series);
    expect(ma[0].avg).toBe(90); expect(ma[6].avg).toBeCloseTo(89.7, 5);
  });
  it('weekly rate & eta', () => {
    const r = N.weeklyRate(series)!; expect(r).toBeCloseTo(-0.7, 5);
    expect(N.etaToGoal(88.6, 85.1, r, new Date('2026-01-15T00:00:00Z'))).toBe('2026-02-19');
    expect(N.etaToGoal(88, 90, r)).toBeNull();
    expect(N.weeklyRate(series.slice(0, 3))).toBeNull();
  });
  it('suggestAdjustment', () => {
    const p = { currentKcal: 2200, expectedWeeklyKg: -0.5, sex: 'male' as const, weightKg: 80, tdee: 2750 };
    expect(N.suggestAdjustment({ ...p, observedWeeklyKg: null }).reason).toBe('insufficient_data');
    expect(N.suggestAdjustment({ ...p, observedWeeklyKg: -0.45 }).reason).toBe('on_track');
    const slow = N.suggestAdjustment({ ...p, observedWeeklyKg: 0 }); expect(slow).toMatchObject({ reason: 'too_slow', deltaKcal: -110 }); // clamped by 0.75%/wk cap (2750-660=2090)
    const fast = N.suggestAdjustment({ ...p, observedWeeklyKg: -1.2 }); expect(fast).toMatchObject({ reason: 'too_fast', deltaKcal: 200 });
  });
});

describe('aggressive cut', () => {
  const adult = { sex: 'male' as const, weightKg: 100, heightCm: 180, age: 30, activity: 'moderate' as const, goal: 'lose' as const };
  it('uses a 30% deficit for an eligible adult, within 1%/week, never below BMR', () => {
    const r = N.computeTargets({ ...adult, deficitPct: 0.3, proteinGPerKg: 2.2 });
    expect(r.dailyDeficit).toBeCloseTo(r.tdee * 0.3, -1);
    expect(Math.abs(r.expectedWeeklyKg)).toBeLessThanOrEqual(1.0 + 0.01);
    expect(r.targets.kcal).toBeGreaterThanOrEqual(r.bmr);
    expect(r.targets.protein).toBe(220);
    expect(r.warnings).not.toContain('aggressive_not_allowed');
  });
  it('is refused for minors and for people with BMI below 25 (falls back to 25%)', () => {
    for (const x of [{ age: 17 }, { weightKg: 68 }]) {
      const r = N.computeTargets({ ...adult, ...x, deficitPct: 0.3 });
      const base = N.computeTargets({ ...adult, ...x, deficitPct: 0.25 });
      expect(r.warnings).toContain('aggressive_not_allowed');
      expect(r.targets.kcal).toBe(base.targets.kcal);
    }
  });
  it('holds the target at BMR when 30% would go lower, but is never gentler than the 25% pace', () => {
    for (const x of [{ activity: 'sedentary' as const }, { activity: 'light' as const, weightKg: 92 }]) {
      const ag = N.computeTargets({ ...adult, ...x, deficitPct: 0.3 });
      const std = N.computeTargets({ ...adult, ...x, deficitPct: 0.25 });
      expect(ag.targets.kcal).toBeLessThanOrEqual(std.targets.kcal);
      if (std.targets.kcal >= std.bmr) expect(ag.targets.kcal).toBeGreaterThanOrEqual(ag.bmr);
    }
  });
  it('eligibility helper', () => {
    expect(N.aggressiveEligible(18, 100, 180)).toBe(true); expect(N.aggressiveEligible(17, 100, 180)).toBe(false);
    expect(N.aggressiveEligible(30, 70, 180)).toBe(false);
  });
});

describe('kcal fine-tune', () => {
  const adult = { sex: 'male' as const, weightKg: 100, heightCm: 180, age: 30, activity: 'moderate' as const, goal: 'lose' as const, deficitPct: 0.2 };
  it('takes 100 or 200 kcal off the target for adults', () => {
    const base = N.computeTargets(adult).targets.kcal;
    expect(N.computeTargets({ ...adult, kcalAdjust: -100 }).targets.kcal).toBe(base - 100);
    expect(N.computeTargets({ ...adult, kcalAdjust: -200 }).targets.kcal).toBe(base - 200);
  });
  it('clamps silly values to 200 and ignores positive ones', () => {
    const base = N.computeTargets(adult).targets.kcal;
    expect(N.computeTargets({ ...adult, kcalAdjust: -900 }).targets.kcal).toBe(base - 200);
    expect(N.computeTargets({ ...adult, kcalAdjust: 300 }).targets.kcal).toBe(base);
  });
  it('is ignored for minors, with a warning', () => {
    const base = N.computeTargets({ ...adult, age: 16 }).targets.kcal;
    const r = N.computeTargets({ ...adult, age: 16, kcalAdjust: -200 });
    expect(r.targets.kcal).toBe(base); expect(r.warnings).toContain('adjust_not_allowed');
  });
  it('never goes under the safe floor', () => {
    const r = N.computeTargets({ sex: 'female', weightKg: 50, heightCm: 155, age: 60, activity: 'sedentary', goal: 'lose', deficitPct: 0.25, kcalAdjust: -200 });
    expect(r.targets.kcal).toBe(1200);
  });
  it('stays inside the weekly-loss cap', () => {
    const r = N.computeTargets({ ...adult, deficitPct: 0.25, kcalAdjust: -200 });
    expect(Math.abs(r.expectedWeeklyKg)).toBeLessThanOrEqual(0.75 + 0.01);
  });
});
