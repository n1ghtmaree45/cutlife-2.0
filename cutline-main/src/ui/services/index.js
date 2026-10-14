/**
 * UI service boundary: the only module screens import data/logic from.
 * Adapts the Backend modules (src/data, src/lib, src/api, src/ai) to the flat shapes the UI uses.
 * If backend signatures change, fix it here only.
 */
import * as db from '../../data/db';
import { computeTargets, ACTIVITY_FACTORS, ageFromBirthDate, kgToLb, lbToKg, round, macrosForGrams, recipePer100g, etaToGoal, weeklyRate, movingAverage7, suggestAdjustment, KCAL_PER_KG_FAT } from '../../lib/nutrition';
import { searchFoods as apiSearch } from '../../api/search';
import { lookupBarcode } from '../../api/off';
import * as ai from '../../ai';
import { logsToCsv, weightsToCsv } from '../../lib/csv';
import { addDays, streak, weeklySummary, activityBonus, dayTargetKcal, waterTotal, DEFAULT_WATER_GOAL_ML } from '../../lib/stats';
import { setLang, getLang, t, num } from '../../i18n';
import { setHapticsEnabled } from '../../lib/haptics';
import { FOODS } from './stubFoods.js';

export { activityBonus, dayTargetKcal, waterTotal, DEFAULT_WATER_GOAL_ML, addDays, kgToLb, lbToKg, round, movingAverage7 };
export const todayKey = () => db.todayISO();
export const uid = db.uid;

/* ---------- settings ---------- */
export const getSettings = () => db.getSettings();
/** Saves and applies side effects (language, haptics, theme mirror) so every screen sees the change. */
export async function saveSettings(patch) {
  const s = await db.saveSettings(patch);
  if (patch.lang) setLang(patch.lang);
  if ('haptics' in patch) setHapticsEnabled(s.haptics !== false);
  if (patch.theme) { try { localStorage.setItem('ct.theme', patch.theme); } catch { /* ignore */ } }
  return s;
}
export async function applyStoredSettings() {
  const s = await db.getSettings();
  if (s.lang) setLang(s.lang); else if (getLang()) { /* device language already detected */ }
  setHapticsEnabled(s.haptics !== false);
  return s;
}
export function getTheme() { try { return localStorage.getItem('ct.theme') || 'system'; } catch { return 'system'; } }
export function setTheme(th) { try { localStorage.setItem('ct.theme', th); } catch { /* ignore */ } db.saveSettings({ theme: th }).catch(() => {}); }
export async function getUsdaKey() { return (await db.getSettings()).apiKeys?.usda || ''; }
export async function saveKey(id, key) {
  const cur = await db.getSettings(); const apiKeys = { ...cur.apiKeys };
  if (key.trim()) apiKeys[id] = key.trim(); else delete apiKeys[id];
  return db.saveSettings({ apiKeys });
}
export const clearKeys = () => db.saveSettings({ apiKeys: {} });

/* ---------- units ---------- */
export const dispWeight = (kg, units) => (units === 'lb' ? kgToLb(kg) : kg);
export const parseWeight = (v, units) => (units === 'lb' ? lbToKg(v) : v);
export const dispLen = (cm, units) => (units === 'lb' ? cm / 2.54 : cm);
export const parseLen = (v, units) => (units === 'lb' ? v * 2.54 : v);
export const wUnit = units => (units === 'lb' ? 'lb' : 'kg');
export const lUnit = units => (units === 'lb' ? 'in' : 'cm');

/* ---------- profile ---------- */
// UI profile: {sex, age, heightCm, weightKg, goalWeightKg, activity (factor), deficitPct (15..25), units, targets}
const factorToKey = f => Object.entries(ACTIVITY_FACTORS).reduce((best, [k, v]) => Math.abs(v - f) < Math.abs(ACTIVITY_FACTORS[best] - f) ? k : best, 'sedentary');
const birthDateForAge = age => { const d = new Date(); d.setFullYear(d.getFullYear() - age); d.setDate(d.getDate() - 1); return db.todayISO(d); };
const toInput = p => ({ sex: p.sex, weightKg: p.weightKg, heightCm: p.heightCm, age: p.age, activity: factorToKey(p.activity), goal: 'lose', deficitPct: p.deficitPct / 100, proteinGPerKg: 2.0 });

export async function getProfile() {
  const p = await db.getProfile(); if (!p) return null;
  const [s, ws] = await Promise.all([db.getSettings(), db.listWeights()]);
  return { sex: p.sex, age: ageFromBirthDate(p.birthDate), heightCm: p.heightCm, weightKg: ws.length ? ws[ws.length - 1].kg : p.weightKg, startWeightKg: p.weightKg,
    goalWeightKg: p.goalWeightKg, activity: ACTIVITY_FACTORS[p.activity], deficitPct: Math.round(p.deficitPct * 100), units: s.units || 'kg', targets: p.targets, updatedAt: p.updatedAt };
}
export async function saveProfile(u) {
  const r = computeTargets(toInput(u));
  await db.saveProfile({ id: 'me', sex: u.sex, birthDate: birthDateForAge(u.age), heightCm: u.heightCm, weightKg: u.weightKg, goalWeightKg: u.goalWeightKg,
    activity: factorToKey(u.activity), goal: 'lose', deficitPct: u.deficitPct / 100, proteinGPerKg: 2.0, targets: r.targets, updatedAt: Date.now() });
  if (u.units) await db.saveSettings({ units: u.units });
  if (!(await db.listWeights()).length) await db.addWeight(todayKey(), u.weightKg); // the chart starts at the first weigh-in
  await db.saveSettings({ lastAdjustAt: todayKey() });
}

const WARN = (w, r, u) => ({
  rate_capped: t('warn.rate_capped', { pct: u.deficitPct, rate: Math.abs(r.expectedWeeklyKg).toFixed(2) }),
  floor_applied: t('warn.floor', { kcal: num(u.sex === 'male' ? 1500 : 1200) }),
  deficit_out_of_range: t('warn.deficit_range'),
  protein_out_of_range: t('warn.protein_range'),
}[w]);
/** -> {bmr, tdee, kcal, protein, carbs, fat, weeklyLossKg, warnings: string[]} */
export function calcTargets(u) {
  const r = computeTargets(toInput(u));
  return { bmr: r.bmr, tdee: r.tdee, ...r.targets, weeklyLossKg: -r.expectedWeeklyKg, warnings: r.warnings.map(w => WARN(w, r, u)).filter(Boolean) };
}

/* ---------- day log ---------- */
const flat = e => ({ id: e.id, date: e.date, meal: e.meal, name: e.name, grams: e.grams, foodId: e.foodId, source: e.source, confidence: e.confidence, createdAt: e.createdAt, ...e.macros });
export async function getEntries(date = todayKey()) { return (await db.getLogsByDate(date)).map(flat); }
export async function getRecentFoods(limit = 8) { return (await db.getRecentFoods(limit)).map(flat); }
/** entry: {meal, name, grams, kcal, protein, carbs, fat, source, foodId?, date?, confidence?} */
export async function addEntry({ meal, name, grams, kcal, protein, carbs, fat, source, foodId, date, confidence }) {
  return flat(await db.addLog({ date: date || todayKey(), meal, name, grams, foodId, confidence, source: source || 'quick', macros: { kcal, protein, carbs, fat } }));
}
export async function updateEntryGrams(id, date, grams) {
  const cur = (await db.getLogsByDate(date)).find(e => e.id === id); if (!cur || !(cur.grams > 0)) return;
  const k = grams / cur.grams; const m = cur.macros;
  await db.updateLog({ ...cur, grams, macros: { kcal: Math.round(m.kcal * k), protein: round(m.protein * k, 1), carbs: round(m.carbs * k, 1), fat: round(m.fat * k, 1) } });
}
export const deleteEntry = id => db.deleteLog(id);
export async function copyEntries(entries, toDate, meal) {
  const logs = (await Promise.all(entries.map(e => db.getLogsByDate(e.date)))).flat();
  const wanted = new Set(entries.map(e => e.id)); return db.copyLogs(logs.filter(l => wanted.has(l.id)), toDate, meal);
}

/** Everything the dashboard needs for one day. */
export async function getDay(date) {
  const [entries, taps, activity, s] = await Promise.all([getEntries(date), db.getWater(date), db.getActivity(date), db.getSettings()]);
  return { entries, taps, activity, waterGoal: s.waterGoalMl || DEFAULT_WATER_GOAL_ML, settings: s };
}
export const addWater = (date, ml) => db.addWaterTap(date, ml);
export const undoWater = date => db.undoWaterTap(date);
export const setActivityDay = (date, a) => db.setActivity(date, a);
export const clearActivityDay = date => db.deleteActivity(date);

/** Streak + weekly summary (used by the dashboard when viewing today). */
export async function getInsights(profile, today = todayKey()) {
  const [used, logs, weights] = await Promise.all([db.usedDates(addDays(today, -400), today), db.getLogsInRange(addDays(today, -6), today), db.listWeights()]);
  const totals = {};
  for (const l of logs) { const m = totals[l.date] ||= { kcal: 0, protein: 0, carbs: 0, fat: 0 }; for (const k of ['kcal', 'protein', 'carbs', 'fat']) m[k] += l.macros[k]; }
  return { streak: streak(used, today), week: weeklySummary(totals, weights, { protein: profile.targets.protein }, today) };
}

/* ---------- templates and copy ---------- */
export const listTemplates = () => db.listTemplates();
export const deleteTemplate = id => db.deleteTemplate(id);
export async function saveTemplate(name, meal, entries) {
  return db.saveTemplate({ id: uid(), name: name.trim(), meal, createdAt: Date.now(),
    items: entries.map(e => ({ name: e.name, grams: e.grams, source: e.source, foodId: e.foodId, macros: { kcal: e.kcal, protein: e.protein, carbs: e.carbs, fat: e.fat } })) });
}
export async function applyTemplate(tpl, date, meal) {
  for (const it of tpl.items) await db.addLog({ date, meal: meal || tpl.meal, name: it.name, grams: it.grams, foodId: it.foodId, source: it.source, macros: { ...it.macros } });
}

/* ---------- foods ---------- */
const SRC_LABEL = () => ({ off: 'Open Food Facts', usda: 'USDA', custom: t('src.custom'), recipe: t('src.recipe'), ai: 'AI', quick: t('src.quick'), builtin: t('src.builtin') });
export const sourceLabel = s => SRC_LABEL()[s] || s;
const uiFood = f => ({ id: f.id, name: f.brand ? `${f.name}, ${f.brand}` : f.name, ...f.per100g, serving: f.servingG || 100, servingLabel: f.servingLabel || `${f.servingG || 100} g`, source: f.source, raw: f });

export async function searchFoods(q, { signal } = {}) {
  const s = q.trim(); if (!s) return { foods: [], errors: [], fallback: false };
  const settings = await db.getSettings().catch(() => ({ apiKeys: {} }));
  const r = await apiSearch(s, { usdaKey: settings.apiKeys?.usda, signal, limit: 30 });
  const foods = r.foods.filter(f => f.per100g && Number.isFinite(f.per100g.kcal)).map(uiFood);
  if (foods.length) return { foods, errors: r.errors, fallback: false };
  const builtin = FOODS.filter(f => f.name.toLowerCase().includes(s.toLowerCase()));
  return { foods: builtin, errors: r.errors, fallback: r.errors.length > 0 && builtin.length > 0 };
}
export async function cacheFood(raw) { if (raw) await db.saveFood(raw).catch(() => {}); }

/** Local cache first (works offline), then Open Food Facts. -> {food: uiFood|null, from: 'local'|'off'|null, error?: 'offline'|'network'} */
export async function scanLookup(code, { signal } = {}) {
  const local = await db.getFoodByBarcode(code); if (local) return { food: uiFood(local), from: 'local' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { food: null, from: null, error: 'offline' };
  try { const f = await lookupBarcode(code, { signal }); return f ? { food: uiFood(f), from: 'off' } : { food: null, from: null }; }
  catch (e) { if (signal?.aborted) throw e; return { food: null, from: null, error: 'network' }; }
}

/** Custom foods and recipes (per 100 g). */
export async function listMyFoods() { return (await db.listFoods()).filter(f => f.source === 'custom' || f.source === 'recipe').sort((a, b) => a.name.localeCompare(b.name)).map(uiFood); }
export async function saveCustomFood({ id, name, brand, barcode, kcal, protein, carbs, fat, servingG }) {
  return uiFood(await db.saveFood({ id: id || `custom:${uid()}`, source: 'custom', name: name.trim(), brand: brand?.trim() || undefined, barcode: barcode?.trim() || undefined,
    per100g: { kcal, protein, carbs, fat }, servingG: servingG > 0 ? servingG : undefined, servingLabel: servingG > 0 ? `${servingG} g` : undefined }));
}
export async function deleteMyFood(id) { await db.deleteFood(id); if (id.startsWith('recipe:')) await db.deleteRecipe(id.slice(7)); }
/** ingredients: [{food: rawFood, grams}] */
export async function saveRecipe({ id, name, ingredients, servings, totalCookedG }) {
  const rid = id || uid(); const foods = {};
  for (const i of ingredients) { await db.saveFood(i.food); foods[i.food.id] = i.food; }
  const rec = { id: rid, name: name.trim(), ingredients: ingredients.map(i => ({ foodId: i.food.id, grams: i.grams })), servings: servings || 1, totalCookedG: totalCookedG > 0 ? totalCookedG : undefined, createdAt: Date.now() };
  await db.saveRecipe(rec);
  const per100g = recipePer100g(rec.ingredients, foods, rec.totalCookedG);
  const totalG = rec.totalCookedG ?? rec.ingredients.reduce((a, i) => a + i.grams, 0);
  const servingG = Math.round(totalG / rec.servings);
  return uiFood(await db.saveFood({ id: `recipe:${rid}`, source: 'recipe', name: rec.name, per100g, servingG, servingLabel: `1 ${t('recipe.serving')} · ${servingG} g` }));
}
export async function getRecipe(id) {
  const rec = (await db.listRecipes()).find(r => r.id === id); if (!rec) return null;
  const ingredients = []; for (const i of rec.ingredients) { const food = await db.getFood(i.foodId); if (food) ingredients.push({ food, grams: i.grams }); }
  return { ...rec, ingredients };
}

/* ---------- weight ---------- */
export const listWeights = () => db.listWeights();
export const saveWeight = (date, kg) => db.addWeight(date, kg);
export const removeWeight = date => db.deleteWeight(date);
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

/** Trend, ETA and the bi-weekly target suggestion. */
export function weightInsights(profile, weights, settings, today = todayKey()) {
  const latest = weights.length ? weights[weights.length - 1].kg : profile.weightKg;
  const rate = weeklyRate(weights, 14);
  const eta = etaToGoal(latest, profile.goalWeightKg, rate);
  const r = computeTargets({ ...toInput(profile), weightKg: latest });
  const expectedWeeklyKg = -((r.tdee - profile.targets.kcal) * 7) / KCAL_PER_KG_FAT;
  const adj = suggestAdjustment({ currentKcal: profile.targets.kcal, expectedWeeklyKg, observedWeeklyKg: rate, sex: profile.sex, weightKg: latest, tdee: r.tdee });
  const since = settings.lastAdjustAt || (profile.updatedAt ? db.todayISO(new Date(profile.updatedAt)) : null);
  const due = !since || daysBetween(since, today) >= 14;
  return { latest, rate, eta, expectedWeeklyKg, adjustment: adj, suggest: due && (adj.reason === 'too_slow' || adj.reason === 'too_fast') && adj.deltaKcal !== 0 };
}
/** Applies a suggested kcal target: protein stays, fat keeps its share (min 0.6 g/kg), carbs take the rest. */
export async function applyAdjustment(newKcal) {
  const p = await db.getProfile(); const ws = await db.listWeights(); const kg = ws.length ? ws[ws.length - 1].kg : p.weightKg;
  const protein = p.targets.protein, nonProtein = newKcal - protein * 4;
  const fat = Math.max(Math.round(0.6 * kg), Math.round((0.35 * nonProtein) / 9)); const carbs = Math.max(0, Math.round((newKcal - protein * 4 - fat * 9) / 4));
  await db.saveProfile({ ...p, targets: { kcal: newKcal, protein, carbs, fat } });
  await db.saveSettings({ lastAdjustAt: todayKey() });
}
export const dismissAdjustment = () => db.saveSettings({ lastAdjustAt: todayKey() });

/* ---------- body: measurements and local-only photos ---------- */
export const listMeasurements = () => db.listMeasurements();
export const addMeasurement = m => db.addMeasurement(m);
export const deleteMeasurement = id => db.deleteMeasurement(id);
export const listPhotos = () => db.listPhotos();
export const deletePhoto = id => db.deletePhoto(id);
/** Photos are stored as blobs in IndexedDB on this device only. Surfaces quota errors as {ok:false, quota:true}. */
export async function addPhoto(date, blob) {
  try { await db.addPhoto(date, blob); return { ok: true }; }
  catch (e) { return { ok: false, quota: e?.name === 'QuotaExceededError' || /quota/i.test(String(e?.message)) }; }
}
export async function storageEstimate() {
  try { const e = await navigator.storage?.estimate?.(); return e ? { usage: e.usage || 0, quota: e.quota || 0 } : null; } catch { return null; }
}

/* ---------- AI ---------- */
export const aiAnalyze = async (blob, { hint, signal } = {}) => ai.analyzePhoto(await db.getSettings(), blob, { hint, signal });
export const aiSuggest = async (input, { signal } = {}) => ai.suggestMeals(await db.getSettings(), input, { signal });
export { resizeImage, confidenceLabel, AiError, DEFAULT_MODELS, PROVIDER_LABEL } from '../../ai';

/* ---------- backup ---------- */
const stamp = () => db.todayISO();
export async function exportJsonFile({ photos = false } = {}) {
  const bundle = await db.exportAll(false, photos);
  await db.saveSettings({ lastBackupAt: Date.now() });
  return { blob: new Blob([JSON.stringify(bundle)], { type: 'application/json' }), name: `cutline-backup-${stamp()}.json` };
}
export async function exportCsvFile(kind) {
  const s = await db.getSettings();
  const text = kind === 'logs' ? logsToCsv(await db.listLogs()) : weightsToCsv(await db.listWeights(), s.units);
  return { blob: new Blob([text], { type: 'text/csv;charset=utf-8' }), name: `cutline-${kind}-${stamp()}.csv` };
}
/** Throws a readable Error (and leaves data untouched) for a bad file. */
export async function importFile(file) {
  let b; try { b = JSON.parse(await file.text()); } catch { throw new Error(t('err.import_json')); }
  await db.importAll(b, 'replace');
  await db.saveSettings({ lastBackupAt: Date.now() });
}
export const resetEverything = async () => { await db.resetAll(); try { localStorage.removeItem('ct.theme'); localStorage.removeItem('ct.reminders.fired'); } catch { /* ignore */ } };
export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
}
export const backupDue = s => !s.lastBackupAt || Date.now() - s.lastBackupAt > 7 * 86400000;
export const hasAnyData = async () => (await db.listLogs()).length > 0 || (await db.listWeights()).length > 1;

export { recipePer100g, macrosForGrams } from '../../lib/nutrition';
