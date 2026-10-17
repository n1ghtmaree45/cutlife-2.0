import type { Macros } from '../types';

export type FoodTag = 'meat' | 'fish' | 'dairy' | 'egg' | 'nuts' | 'gluten' | 'soy';
export interface SeedFood { name: { en: string; el: string }; per100g: Macros; tags: FoodTag[] }
const m = (kcal: number, protein: number, carbs: number, fat: number): Macros => ({ kcal, protein, carbs, fat });

/**
 * Built-in foods for the offline meal planner. Values are typical per-100 g figures (cooked weight where the
 * name says "cooked"); real products vary, so plan numbers are estimates, not lab values.
 */
export const SEED_FOODS: Record<string, SeedFood> = {
  oats:          { name: { en: 'Rolled oats (dry)', el: 'Νιφάδες βρώμης (άψητες)' }, per100g: m(389, 16.9, 66.3, 6.9), tags: ['gluten'] },
  greek_yogurt:  { name: { en: 'Greek yogurt 2%', el: 'Γιαούρτι στραγγιστό 2%' }, per100g: m(73, 9.9, 3.9, 1.9), tags: ['dairy'] },
  milk:          { name: { en: 'Semi-skimmed milk', el: 'Γάλα light' }, per100g: m(47, 3.4, 4.9, 1.6), tags: ['dairy'] },
  egg:           { name: { en: 'Eggs', el: 'Αυγά' }, per100g: m(143, 12.6, 0.7, 9.5), tags: ['egg'] },
  bread:         { name: { en: 'Whole-wheat bread', el: 'Ψωμί ολικής' }, per100g: m(247, 13, 41, 3.4), tags: ['gluten'] },
  banana:        { name: { en: 'Banana', el: 'Μπανάνα' }, per100g: m(89, 1.1, 22.8, 0.3), tags: [] },
  apple:         { name: { en: 'Apple', el: 'Μήλο' }, per100g: m(52, 0.3, 13.8, 0.2), tags: [] },
  orange:        { name: { en: 'Orange', el: 'Πορτοκάλι' }, per100g: m(47, 0.9, 11.8, 0.1), tags: [] },
  berries:       { name: { en: 'Berries', el: 'Μούρα' }, per100g: m(57, 0.7, 14, 0.3), tags: [] },
  honey:         { name: { en: 'Honey', el: 'Μέλι' }, per100g: m(304, 0.3, 82.4, 0), tags: [] },
  almonds:       { name: { en: 'Almonds', el: 'Αμύγδαλα' }, per100g: m(579, 21.2, 21.6, 49.9), tags: ['nuts'] },
  walnuts:       { name: { en: 'Walnuts', el: 'Καρύδια' }, per100g: m(654, 15.2, 13.7, 65.2), tags: ['nuts'] },
  peanut_butter: { name: { en: 'Peanut butter', el: 'Φυστικοβούτυρο' }, per100g: m(588, 25, 20, 50), tags: ['nuts'] },
  olive_oil:     { name: { en: 'Olive oil', el: 'Ελαιόλαδο' }, per100g: m(884, 0, 0, 100), tags: [] },
  chicken:       { name: { en: 'Chicken breast (cooked)', el: 'Στήθος κοτόπουλο (μαγειρεμένο)' }, per100g: m(165, 31, 0, 3.6), tags: ['meat'] },
  salmon:        { name: { en: 'Salmon (cooked)', el: 'Σολομός (μαγειρεμένος)' }, per100g: m(206, 22.1, 0, 12.4), tags: ['fish'] },
  tuna:          { name: { en: 'Tuna in water', el: 'Τόνος σε νερό' }, per100g: m(116, 25.5, 0, 0.8), tags: ['fish'] },
  cod:           { name: { en: 'Cod (cooked)', el: 'Μπακαλιάρος (μαγειρεμένος)' }, per100g: m(105, 22.8, 0, 0.9), tags: ['fish'] },
  rice:          { name: { en: 'White rice (cooked)', el: 'Ρύζι (μαγειρεμένο)' }, per100g: m(130, 2.7, 28.2, 0.3), tags: [] },
  pasta:         { name: { en: 'Pasta (cooked)', el: 'Ζυμαρικά (μαγειρεμένα)' }, per100g: m(158, 5.8, 30.9, 0.9), tags: ['gluten'] },
  potato:        { name: { en: 'Potato (boiled)', el: 'Πατάτα (βραστή)' }, per100g: m(87, 1.9, 20.1, 0.1), tags: [] },
  sweet_potato:  { name: { en: 'Sweet potato (baked)', el: 'Γλυκοπατάτα (ψητή)' }, per100g: m(90, 2, 20.7, 0.2), tags: [] },
  lentils:       { name: { en: 'Lentils (cooked)', el: 'Φακές (μαγειρεμένες)' }, per100g: m(116, 9, 20.1, 0.4), tags: [] },
  chickpeas:     { name: { en: 'Chickpeas (cooked)', el: 'Ρεβίθια (μαγειρεμένα)' }, per100g: m(164, 8.9, 27.4, 2.6), tags: [] },
  tofu:          { name: { en: 'Firm tofu', el: 'Τόφου' }, per100g: m(144, 17.3, 2.8, 8.7), tags: ['soy'] },
  broccoli:      { name: { en: 'Broccoli (cooked)', el: 'Μπρόκολο (βραστό)' }, per100g: m(35, 2.4, 7.2, 0.4), tags: [] },
  zucchini:      { name: { en: 'Zucchini', el: 'Κολοκυθάκια' }, per100g: m(17, 1.2, 3.1, 0.3), tags: [] },
  spinach:       { name: { en: 'Spinach', el: 'Σπανάκι' }, per100g: m(23, 2.9, 3.6, 0.4), tags: [] },
  tomato:        { name: { en: 'Tomato', el: 'Ντομάτα' }, per100g: m(18, 0.9, 3.9, 0.2), tags: [] },
  cucumber:      { name: { en: 'Cucumber', el: 'Αγγούρι' }, per100g: m(15, 0.7, 3.6, 0.1), tags: [] },
  lettuce:       { name: { en: 'Lettuce / salad greens', el: 'Μαρούλι / πράσινη σαλάτα' }, per100g: m(15, 1.4, 2.9, 0.2), tags: [] },
  feta:          { name: { en: 'Feta', el: 'Φέτα' }, per100g: m(264, 14.2, 4.1, 21.3), tags: ['dairy'] },
  cottage:       { name: { en: 'Cottage cheese', el: 'Τυρί cottage' }, per100g: m(98, 11.1, 3.4, 4.3), tags: ['dairy'] },
  whey:          { name: { en: 'Whey protein powder', el: 'Πρωτεΐνη ορού γάλακτος' }, per100g: m(380, 80, 7, 5), tags: ['dairy'] },
  avocado:       { name: { en: 'Avocado', el: 'Αβοκάντο' }, per100g: m(160, 2, 8.5, 14.7), tags: [] },
  hummus:        { name: { en: 'Hummus', el: 'Χούμους' }, per100g: m(166, 7.9, 14.3, 9.6), tags: [] },
};
export const SEED_IDS = Object.keys(SEED_FOODS);
