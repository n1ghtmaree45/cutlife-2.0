import type { Macros } from '../types';
import { SEED_FOODS, type FoodTag } from '../data/seedFoods';

export type Slot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export const SLOTS: Slot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
export const SLOT_SHARE: Record<Slot, number> = { breakfast: 0.25, lunch: 0.35, dinner: 0.3, snack: 0.1 };
/** Items at or below this many grams (oil, honey, nut butter) keep their size when a meal is scaled. */
export const FIXED_MAX_G = 15;

export interface TemplateItem { food: string; g: number }
export interface Template { id: string; slot: Slot; name: { en: string; el: string }; items: TemplateItem[]; ai?: boolean }
export interface PlanItem { food: string; grams: number }
export interface PlanMeal { slot: Slot; templateId: string; name: { en: string; el: string }; ai: boolean; items: PlanItem[]; macros: Macros }
export type DayWarning = 'kcal_off' | 'protein_low';
export interface PlanDay { meals: PlanMeal[]; totals: Macros; kcalDiffPct: number; warnings: DayWarning[] }
export interface Plan { days: PlanDay[]; targets: Macros; createdAt: number; usedAi: boolean }
export class PlanError extends Error { constructor(public kind: 'no_options' | 'infeasible', public slot?: Slot) { super(kind); } }

const T = (id: string, slot: Slot, en: string, el: string, items: [string, number][]): Template =>
  ({ id, slot, name: { en, el }, items: items.map(([food, g]) => ({ food, g })) });

export const BUILTIN_TEMPLATES: Template[] = [
  T('b-oats', 'breakfast', 'Oats with yogurt, banana and almonds', 'Βρώμη με γιαούρτι, μπανάνα και αμύγδαλα', [['oats', 50], ['greek_yogurt', 150], ['banana', 100], ['almonds', 15]]),
  T('b-eggs', 'breakfast', 'Scrambled eggs on toast with tomato', 'Αυγά scrambled σε τοστ με ντομάτα', [['egg', 150], ['bread', 80], ['tomato', 100], ['olive_oil', 10]]),
  T('b-yogurt', 'breakfast', 'Greek yogurt with berries and walnuts', 'Γιαούρτι με μούρα και καρύδια', [['greek_yogurt', 250], ['berries', 100], ['honey', 10], ['walnuts', 20]]),
  T('b-pb-oats', 'breakfast', 'Peanut-butter oat porridge', 'Χυλός βρώμης με φυστικοβούτυρο', [['oats', 60], ['milk', 200], ['banana', 100], ['peanut_butter', 15]]),
  T('b-omelette', 'breakfast', 'Spinach and feta omelette with bread', 'Ομελέτα με σπανάκι και φέτα, με ψωμί', [['egg', 150], ['spinach', 60], ['feta', 30], ['bread', 60]]),
  T('b-hash', 'breakfast', 'Potato hash with avocado', 'Πατάτες τηγανητές με αβοκάντο', [['potato', 200], ['avocado', 100], ['tomato', 100]]),
  T('b-tofu', 'breakfast', 'Tofu scramble with potato and tomato', 'Scrambled τόφου με πατάτα και ντομάτα', [['tofu', 150], ['potato', 150], ['tomato', 100], ['olive_oil', 10]]),
  T('b-cottage', 'breakfast', 'Cottage cheese toast with apple', 'Τοστ με τυρί cottage και μήλο', [['cottage', 150], ['bread', 60], ['apple', 150]]),
  T('l-chicken-rice', 'lunch', 'Chicken, rice and broccoli', 'Κοτόπουλο με ρύζι και μπρόκολο', [['chicken', 150], ['rice', 200], ['broccoli', 150], ['olive_oil', 10]]),
  T('l-tuna-pasta', 'lunch', 'Tuna pasta salad', 'Μακαρονοσαλάτα με τόνο', [['pasta', 200], ['tuna', 120], ['tomato', 100], ['cucumber', 100], ['olive_oil', 10]]),
  T('l-lentils', 'lunch', 'Lentil bowl with feta and tomato', 'Φακές με φέτα και ντομάτα', [['lentils', 250], ['feta', 30], ['tomato', 100], ['olive_oil', 10]]),
  T('l-chickpea-salad', 'lunch', 'Chickpea and feta salad', 'Σαλάτα ρεβίθια με φέτα', [['chickpeas', 200], ['cucumber', 100], ['tomato', 100], ['feta', 40], ['olive_oil', 10]]),
  T('l-salmon', 'lunch', 'Salmon with potatoes and broccoli', 'Σολομός με πατάτες και μπρόκολο', [['salmon', 130], ['potato', 250], ['broccoli', 150]]),
  T('l-lentil-rice', 'lunch', 'Lentils with rice and zucchini', 'Φακές με ρύζι και κολοκυθάκια', [['lentils', 200], ['rice', 150], ['zucchini', 100], ['tomato', 100], ['olive_oil', 10]]),
  T('l-tofu', 'lunch', 'Tofu stir-fry with rice', 'Τόφου stir-fry με ρύζι', [['tofu', 200], ['rice', 200], ['zucchini', 150], ['broccoli', 100], ['olive_oil', 10]]),
  T('l-chicken-salad', 'lunch', 'Chicken salad with bread', 'Σαλάτα με κοτόπουλο και ψωμί', [['chicken', 150], ['lettuce', 100], ['tomato', 100], ['cucumber', 100], ['bread', 80], ['olive_oil', 10]]),
  T('d-cod', 'dinner', 'Baked cod with sweet potato and zucchini', 'Μπακαλιάρος με γλυκοπατάτα και κολοκυθάκια', [['cod', 200], ['sweet_potato', 250], ['zucchini', 150], ['olive_oil', 10]]),
  T('d-chicken-pasta', 'dinner', 'Chicken pasta with spinach', 'Κοτόπουλο με ζυμαρικά και σπανάκι', [['chicken', 150], ['pasta', 200], ['spinach', 80], ['tomato', 100], ['olive_oil', 10]]),
  T('d-egg-bowl', 'dinner', 'Egg and potato veggie bowl', 'Μπολ με αυγά, πατάτες και λαχανικά', [['egg', 150], ['potato', 250], ['broccoli', 150], ['olive_oil', 10]]),
  T('d-lentil-soup', 'dinner', 'Lentil soup with bread', 'Φακόσουπα με ψωμί', [['lentils', 250], ['tomato', 100], ['bread', 60], ['olive_oil', 10]]),
  T('d-salmon-rice', 'dinner', 'Salmon with rice and spinach', 'Σολομός με ρύζι και σπανάκι', [['salmon', 130], ['rice', 180], ['spinach', 100]]),
  T('d-tofu-curry', 'dinner', 'Tofu and chickpea rice bowl', 'Μπολ με τόφου, ρεβίθια και ρύζι', [['tofu', 200], ['chickpeas', 150], ['rice', 150], ['spinach', 80], ['olive_oil', 10]]),
  T('d-chickpea-potato', 'dinner', 'Chickpeas with sweet potato and spinach', 'Ρεβίθια με γλυκοπατάτα και σπανάκι', [['chickpeas', 200], ['sweet_potato', 250], ['spinach', 100], ['olive_oil', 10]]),
  T('d-tuna-potato', 'dinner', 'Tuna and potato salad', 'Πατατοσαλάτα με τόνο', [['tuna', 150], ['potato', 250], ['lettuce', 100], ['tomato', 100], ['olive_oil', 10]]),
  T('s-yogurt', 'snack', 'Greek yogurt with honey', 'Γιαούρτι με μέλι', [['greek_yogurt', 170], ['honey', 10]]),
  T('s-cottage', 'snack', 'Cottage cheese with apple', 'Τυρί cottage με μήλο', [['cottage', 150], ['apple', 150]]),
  T('s-shake', 'snack', 'Whey shake with banana', 'Shake πρωτεΐνης με μπανάνα', [['whey', 30], ['milk', 250], ['banana', 100]]),
  T('s-nuts', 'snack', 'Almonds and an orange', 'Αμύγδαλα και πορτοκάλι', [['almonds', 25], ['orange', 150]]),
  T('s-hummus', 'snack', 'Hummus with cucumber', 'Χούμους με αγγούρι', [['hummus', 80], ['cucumber', 150]]),
  T('s-eggs', 'snack', 'Boiled eggs and tomato', 'Βραστά αυγά με ντομάτα', [['egg', 100], ['tomato', 100]]),
];

export interface Restrictions { vegetarian?: boolean; noFish?: boolean; noDairy?: boolean; noEgg?: boolean; noNuts?: boolean; noGluten?: boolean; noSoy?: boolean }
export function excludedTags(r: Restrictions): Set<FoodTag> {
  const s = new Set<FoodTag>();
  if (r.vegetarian) { s.add('meat'); s.add('fish'); }
  if (r.noFish) s.add('fish'); if (r.noDairy) s.add('dairy'); if (r.noEgg) s.add('egg');
  if (r.noNuts) s.add('nuts'); if (r.noGluten) s.add('gluten'); if (r.noSoy) s.add('soy');
  return s;
}
export const templateAllowed = (t: Template, ex: Set<FoodTag>) => t.items.every(i => { const f = SEED_FOODS[i.food]; return !!f && !f.tags.some(g => ex.has(g)); });

const r1 = (n: number) => Math.round(n * 10) / 10;
export function itemMacros(food: string, grams: number): Macros {
  const f = SEED_FOODS[food]; if (!f) return { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const k = grams / 100; const p = f.per100g;
  return { kcal: p.kcal * k, protein: p.protein * k, carbs: p.carbs * k, fat: p.fat * k };
}
export function sumMacros(list: Macros[]): Macros {
  const t = list.reduce((a, m) => ({ kcal: a.kcal + m.kcal, protein: a.protein + m.protein, carbs: a.carbs + m.carbs, fat: a.fat + m.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  return { kcal: Math.round(t.kcal), protein: r1(t.protein), carbs: r1(t.carbs), fat: r1(t.fat) };
}
export const itemsMacros = (items: PlanItem[]) => sumMacros(items.map(i => itemMacros(i.food, i.grams)));

const round5 = (g: number) => Math.max(5, Math.round(g / 5) * 5);
const SCALE_MIN = 0.45, SCALE_MAX = 2.2;

/** Scales the non-fixed items so the meal reaches targetKcal. Null when that would need an unrealistic portion. */
export function scaleTemplate(t: Template, targetKcal: number): PlanItem[] | null {
  let fixedK = 0, scalK = 0;
  for (const i of t.items) { const k = itemMacros(i.food, i.g).kcal; if (i.g <= FIXED_MAX_G) fixedK += k; else scalK += k; }
  if (scalK <= 0) return null;
  const s = (targetKcal - fixedK) / scalK;
  if (!(s >= SCALE_MIN && s <= SCALE_MAX)) return null;
  return t.items.map(i => ({ food: i.food, grams: i.g <= FIXED_MAX_G ? i.g : round5(i.g * s) }));
}

export const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function buildMeal(t: Template, items: PlanItem[]): PlanMeal { return { slot: t.slot, templateId: t.id, name: t.name, ai: !!t.ai, items, macros: itemsMacros(items) }; }

function planDay(target: Macros, bySlot: Record<Slot, Template[]>, rng: () => number, usage: Map<string, number>): PlanDay {
  let best: { picks: Template[]; score: number } | null = null;
  for (let n = 0; n < 300; n++) {
    const picks = SLOTS.map(s => bySlot[s][Math.floor(rng() * bySlot[s].length)]!);
    const metas = picks.map((t, i) => scaleTemplate(t, target.kcal * SLOT_SHARE[SLOTS[i]!]));
    if (metas.some(x => !x)) continue;
    const tot = sumMacros(metas.map(x => itemsMacros(x!)));
    const dev = (a: number, b: number) => Math.abs(a - b) / Math.max(1, b);
    const score = dev(tot.protein, target.protein) + 0.5 * dev(tot.fat, target.fat) + 0.3 * dev(tot.carbs, target.carbs) + 0.1 * picks.reduce((a, t) => a + (usage.get(t.id) ?? 0), 0);
    if (!best || score < best.score) best = { picks, score };
  }
  if (!best) throw new PlanError('infeasible');

  // Second pass: spread the rounding error over the meals so the day lands on the calorie target.
  let slotKcal = best.picks.map((_, i) => target.kcal * SLOT_SHARE[SLOTS[i]!]);
  let meals = best.picks.map((t, i) => buildMeal(t, scaleTemplate(t, slotKcal[i]!)!));
  for (let pass = 0; pass < 2; pass++) {
    const diff = target.kcal - sumMacros(meals.map(m => m.macros)).kcal;
    if (Math.abs(diff) <= target.kcal * 0.01) break;
    slotKcal = slotKcal.map((k, i) => k + diff * SLOT_SHARE[SLOTS[i]!]);
    meals = best.picks.map((t, i) => { const it = scaleTemplate(t, slotKcal[i]!); return it ? buildMeal(t, it) : meals[i]!; });
  }
  const totals = sumMacros(meals.map(m => m.macros));
  const kcalDiffPct = Math.round(((totals.kcal - target.kcal) / target.kcal) * 1000) / 10;
  const warnings: DayWarning[] = [];
  if (Math.abs(kcalDiffPct) > 3) warnings.push('kcal_off');
  if (totals.protein < target.protein * 0.85) warnings.push('protein_low');
  for (const t of best.picks) usage.set(t.id, (usage.get(t.id) ?? 0) + 1);
  return { meals, totals, kcalDiffPct, warnings };
}

export interface GenerateOpts { restrictions?: Restrictions; templates?: Template[]; extraTemplates?: Template[]; seed?: number; days?: number; now?: number }
/** Builds a week of menus whose calories and macros are computed from the food table, not guessed. */
export function generatePlan(targets: Macros, o: GenerateOpts = {}): Plan {
  const ex = excludedTags(o.restrictions ?? {});
  const all = [...(o.templates ?? BUILTIN_TEMPLATES), ...(o.extraTemplates ?? [])].filter(t => templateAllowed(t, ex));
  const bySlot = Object.fromEntries(SLOTS.map(s => [s, all.filter(t => t.slot === s)])) as Record<Slot, Template[]>;
  for (const s of SLOTS) if (!bySlot[s].length) throw new PlanError('no_options', s);
  const rng = mulberry32(o.seed ?? Date.now()); const usage = new Map<string, number>();
  const days = Array.from({ length: o.days ?? 7 }, () => planDay(targets, bySlot, rng, usage));
  return { days, targets, createdAt: o.now ?? Date.now(), usedAi: !!o.extraTemplates?.length };
}
