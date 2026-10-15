import type { ActivityLevel, Goal, Macros, Sex, WeightEntry, RecipeIngredient, Food } from '../types';

export const KCAL_PER_KG_FAT = 7700;
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9,
};
export const KCAL_FLOOR: Record<Sex, number> = { male: 1500, female: 1200 };
export const MAX_WEEKLY_LOSS_PCT = 0.0075;
export const LB_PER_KG = 2.2046226218;

export const kgToLb = (kg: number) => kg * LB_PER_KG;
export const lbToKg = (lb: number) => lb / LB_PER_KG;
export const round = (n: number, d = 0) => { const f = 10 ** d; return Math.round(n * f) / f; };

export function ageFromBirthDate(birthDate: string, on: Date = new Date()): number {
  const b = new Date(birthDate + 'T00:00:00');
  let a = on.getFullYear() - b.getFullYear();
  const m = on.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && on.getDate() < b.getDate())) a--;
  return a;
}

/** Mifflin-St Jeor BMR (kcal/day). */
export function bmr(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
}
export const tdee = (bmrKcal: number, activity: ActivityLevel) => bmrKcal * ACTIVITY_FACTORS[activity];

export type TargetWarning = 'rate_capped' | 'floor_applied' | 'deficit_out_of_range' | 'protein_out_of_range';

export interface TargetInput {
  sex: Sex; weightKg: number; heightCm: number; age: number; activity: ActivityLevel;
  goal: Goal; deficitPct?: number; proteinGPerKg?: number; fatPctOfRemaining?: number;
  surplusPct?: number;
}
export interface TargetResult {
  bmr: number; tdee: number; targets: Macros;
  dailyDeficit: number;            // tdee - target kcal (negative = surplus)
  expectedWeeklyKg: number;        // negative = loss
  maxDailyDeficit: number;         // from 0.75%/wk cap
  warnings: TargetWarning[];
}

/**
 * Compute daily calorie/macro targets.
 * lose: deficit = tdee*deficitPct (default 0.20, intended 0.15..0.25), capped so loss <= 0.75% bw/week,
 *       then floored at 1500 (m) / 1200 (f). gain: +surplusPct (default 0.10). maintain: tdee.
 * Protein = proteinGPerKg (default 1.8) * weightKg. Fat = fatPctOfRemaining (default 0.35) of
 * non-protein kcal, but at least 0.6 g/kg. Carbs = remainder (>= 0).
 */
export function computeTargets(i: TargetInput): TargetResult {
  const warnings: TargetWarning[] = [];
  const b = bmr(i.sex, i.weightKg, i.heightCm, i.age);
  const t = tdee(b, i.activity);
  const maxDailyDeficit = (i.weightKg * MAX_WEEKLY_LOSS_PCT * KCAL_PER_KG_FAT) / 7;
  let kcal = t;
  if (i.goal === 'lose') {
    const pct = i.deficitPct ?? 0.2;
    if (pct < 0.15 || pct > 0.25) warnings.push('deficit_out_of_range');
    let deficit = t * pct;
    if (deficit > maxDailyDeficit) { deficit = maxDailyDeficit; warnings.push('rate_capped'); }
    kcal = t - deficit;
  } else if (i.goal === 'gain') {
    kcal = t * (1 + (i.surplusPct ?? 0.1));
  }
  const floor = KCAL_FLOOR[i.sex];
  if (kcal < floor) { kcal = floor; warnings.push('floor_applied'); }
  kcal = Math.round(kcal);

  const ppk = i.proteinGPerKg ?? 1.8;
  if (ppk < 1.6 || ppk > 2.2) warnings.push('protein_out_of_range');
  const protein = Math.round(ppk * i.weightKg);
  const rest = Math.max(0, kcal - protein * 4);
  const fat = Math.round(Math.max((rest * (i.fatPctOfRemaining ?? 0.35)) / 9, 0.6 * i.weightKg));
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  const dailyDeficit = Math.round(t - kcal);
  return {
    bmr: Math.round(b), tdee: Math.round(t), targets: { kcal, protein, carbs, fat },
    dailyDeficit, expectedWeeklyKg: round((-dailyDeficit * 7) / KCAL_PER_KG_FAT, 2),
    maxDailyDeficit: Math.round(maxDailyDeficit), warnings,
  };
}

/** True if a planned weekly loss (kg, positive) exceeds 0.75% of bodyweight. */
export const isRateTooAggressive = (weeklyLossKg: number, weightKg: number) => weeklyLossKg > weightKg * MAX_WEEKLY_LOSS_PCT;

/** Macros for a portion given per-100g values. */
export function macrosForGrams(per100g: Macros, grams: number): Macros {
  const f = grams / 100;
  return { kcal: round(per100g.kcal * f), protein: round(per100g.protein * f, 1), carbs: round(per100g.carbs * f, 1), fat: round(per100g.fat * f, 1) };
}
/** Atwater kcal from macros (useful to sanity-check AI/user input). */
export const kcalFromMacros = (m: Omit<Macros, 'kcal'>) => Math.round(m.protein * 4 + m.carbs * 4 + m.fat * 9);

/** Per-100g macros of a recipe. Uses totalCookedG if given, else sum of raw ingredient grams. */
export function recipePer100g(ings: RecipeIngredient[], foods: Map<string, Food> | Record<string, Food>, totalCookedG?: number): Macros {
  const get = (id: string) => (foods instanceof Map ? foods.get(id) : foods[id]);
  const tot = { kcal: 0, protein: 0, carbs: 0, fat: 0 }; let g = 0;
  for (const ing of ings) {
    const f = get(ing.foodId); if (!f) continue;
    const m = macrosForGrams(f.per100g, ing.grams);
    tot.kcal += m.kcal; tot.protein += m.protein; tot.carbs += m.carbs; tot.fat += m.fat; g += ing.grams;
  }
  const w = totalCookedG ?? g; if (!w) return { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  return macrosForGrams(tot, (100 / w) * 100);
}

export const remaining = (t: Macros, eaten: Macros): Macros => ({ kcal: t.kcal - eaten.kcal, protein: t.protein - eaten.protein, carbs: t.carbs - eaten.carbs, fat: t.fat - eaten.fat });

// ---- Weight trend (used in M2, published now) ----
const dayNum = (iso: string) => Math.round(Date.parse(iso + 'T00:00:00Z') / 86400000);

/** Trailing 7-calendar-day moving average for each weigh-in (averages entries within [d-6, d]). */
export function movingAverage7(entries: WeightEntry[]): { date: string; kg: number; avg: number }[] {
  const s = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  return s.map(e => {
    const d = dayNum(e.date); const win = s.filter(x => { const k = dayNum(x.date); return k <= d && k > d - 7; });
    return { date: e.date, kg: e.kg, avg: round(win.reduce((a, x) => a + x.kg, 0) / win.length, 2) };
  });
}

/** Weekly rate (kg/week, negative = loss) from least-squares slope over the last `days` days. Null if < 2 points or < 7 days span. */
export function weeklyRate(entries: WeightEntry[], days = 14): number | null {
  if (!entries.length) return null;
  const s = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const end = dayNum(s[s.length - 1].date);
  const pts = s.filter(e => dayNum(e.date) > end - days).map(e => [dayNum(e.date), e.kg] as const);
  if (pts.length < 2 || pts[pts.length - 1][0] - pts[0][0] < 7) return null;
  const n = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
  const num = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0), den = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
  return den ? round((num / den) * 7, 3) : null;
}

/** ETA to goal as ISO date, or null if rate is zero / moving away from goal. */
export function etaToGoal(currentKg: number, goalKg: number, weeklyRateKg: number | null, from: Date = new Date()): string | null {
  if (weeklyRateKg == null || weeklyRateKg === 0) return null;
  const diff = goalKg - currentKg; if (diff === 0) return from.toISOString().slice(0, 10);
  if (Math.sign(diff) !== Math.sign(weeklyRateKg)) return null;
  return new Date(from.getTime() + (diff / weeklyRateKg) * 7 * 86400000).toISOString().slice(0, 10);
}

export interface Adjustment { newKcal: number; deltaKcal: number; reason: 'too_slow' | 'too_fast' | 'on_track' | 'insufficient_data'; }
/**
 * Bi-weekly target suggestion: compare observed rate with expected rate; adjust by the
 * implied energy gap, clamped to +/-200 kcal per step and respecting floor and 0.75%/wk cap.
 */
export function suggestAdjustment(p: { currentKcal: number; expectedWeeklyKg: number; observedWeeklyKg: number | null; sex: Sex; weightKg: number; tdee: number }): Adjustment {
  if (p.observedWeeklyKg == null) return { newKcal: p.currentKcal, deltaKcal: 0, reason: 'insufficient_data' };
  const gapKg = p.observedWeeklyKg - p.expectedWeeklyKg; // >0 = losing slower than planned
  if (Math.abs(gapKg) < 0.1) return { newKcal: p.currentKcal, deltaKcal: 0, reason: 'on_track' };
  let delta = Math.max(-200, Math.min(200, -Math.round((gapKg * KCAL_PER_KG_FAT) / 7)));
  let next = p.currentKcal + delta;
  const minByRate = p.tdee - (p.weightKg * MAX_WEEKLY_LOSS_PCT * KCAL_PER_KG_FAT) / 7;
  next = Math.round(Math.max(next, KCAL_FLOOR[p.sex], minByRate));
  delta = next - p.currentKcal;
  return { newKcal: next, deltaKcal: delta, reason: gapKg > 0 ? 'too_slow' : 'too_fast' };
}
