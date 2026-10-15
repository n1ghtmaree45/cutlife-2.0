import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { blobToDataUrl, dataUrlToBlob } from '../lib/blob';
import type { Food, LogEntry, Profile, Recipe, Settings, WeightEntry, ExportBundle, Macros, WaterDay, ActivityDay, Measurement, ProgressPhoto, MealTemplate } from '../types';

export const DB_NAME = 'calorie-app';
export const DB_VERSION = 2;
const STORES = ['profile', 'settings', 'foods', 'recipes', 'logs', 'weights', 'water', 'activity', 'measurements', 'photos', 'templates'] as const;

interface Schema extends DBSchema {
  profile: { key: 'me'; value: Profile };
  settings: { key: 'settings'; value: Settings };
  foods: { key: string; value: Food; indexes: { byBarcode: string; byName: string } };
  recipes: { key: string; value: Recipe };
  logs: { key: string; value: LogEntry; indexes: { byDate: string; byCreated: number } };
  weights: { key: string; value: WeightEntry };
  water: { key: string; value: WaterDay };
  activity: { key: string; value: ActivityDay };
  measurements: { key: string; value: Measurement; indexes: { byDate: string } };
  photos: { key: string; value: ProgressPhoto; indexes: { byDate: string } };
  templates: { key: string; value: MealTemplate };
}

let dbp: Promise<IDBPDatabase<Schema>> | null = null;
export function getDb(): Promise<IDBPDatabase<Schema>> {
  dbp ??= openDB<Schema>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('profile', { keyPath: 'id' });
        db.createObjectStore('settings', { keyPath: 'id' });
        const foods = db.createObjectStore('foods', { keyPath: 'id' });
        foods.createIndex('byBarcode', 'barcode');
        foods.createIndex('byName', 'name');
        db.createObjectStore('recipes', { keyPath: 'id' });
        const logs = db.createObjectStore('logs', { keyPath: 'id' });
        logs.createIndex('byDate', 'date');
        logs.createIndex('byCreated', 'createdAt');
        db.createObjectStore('weights', { keyPath: 'date' });
      }
      if (oldVersion < 2) { // extras: additive only, existing stores are untouched
        db.createObjectStore('water', { keyPath: 'date' });
        db.createObjectStore('activity', { keyPath: 'date' });
        db.createObjectStore('measurements', { keyPath: 'id' }).createIndex('byDate', 'date');
        db.createObjectStore('photos', { keyPath: 'id' }).createIndex('byDate', 'date');
        db.createObjectStore('templates', { keyPath: 'id' });
      }
    },
  });
  return dbp;
}
/** For tests: close and forget the cached connection. */
export async function _resetDbHandle() { if (dbp) (await dbp).close(); dbp = null; }

export const uid = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));
export const todayISO = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10);
};

export const DEFAULT_SETTINGS: Settings = { id: 'settings', units: 'kg', theme: 'system', provider: 'gemini', fallbackProvider: 'groq', apiKeys: {} };

// Profile
export const getProfile = async () => (await getDb()).get('profile', 'me');
export const saveProfile = async (p: Profile) => { await (await getDb()).put('profile', { ...p, id: 'me', updatedAt: Date.now() }); };

// Settings
export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...((await (await getDb()).get('settings', 'settings')) ?? {}) };
}
export async function saveSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch, id: 'settings' as const };
  await (await getDb()).put('settings', next); return next;
}

// Foods
export const saveFood = async (f: Food) => { const v = { createdAt: Date.now(), ...f }; await (await getDb()).put('foods', v); return v; };
export const getFood = async (id: string) => (await getDb()).get('foods', id);
export const getFoodByBarcode = async (code: string) => (await getDb()).getFromIndex('foods', 'byBarcode', code);
export const deleteFood = async (id: string) => (await getDb()).delete('foods', id);
export async function listFoods(source?: Food['source']): Promise<Food[]> {
  const all = await (await getDb()).getAll('foods'); return source ? all.filter(f => f.source === source) : all;
}
export async function searchLocalFoods(q: string, limit = 20): Promise<Food[]> {
  const t = q.trim().toLowerCase(); if (!t) return [];
  return (await listFoods()).filter(f => `${f.name} ${f.brand ?? ''}`.toLowerCase().includes(t)).slice(0, limit);
}

// Recipes
export const saveRecipe = async (r: Recipe) => { await (await getDb()).put('recipes', r); return r; };
export const listRecipes = async () => (await getDb()).getAll('recipes');
export const deleteRecipe = async (id: string) => (await getDb()).delete('recipes', id);

// Logs
export async function addLog(e: Omit<LogEntry, 'id' | 'createdAt'> & Partial<Pick<LogEntry, 'id' | 'createdAt'>>): Promise<LogEntry> {
  const v: LogEntry = { id: uid(), createdAt: Date.now(), ...e }; await (await getDb()).put('logs', v); return v;
}
export const updateLog = async (e: LogEntry) => { await (await getDb()).put('logs', e); return e; };
export const deleteLog = async (id: string) => (await getDb()).delete('logs', id);
export async function getLogsByDate(date: string): Promise<LogEntry[]> {
  return (await (await getDb()).getAllFromIndex('logs', 'byDate', date)).sort((a, b) => a.createdAt - b.createdAt);
}
export async function getLogsInRange(from: string, to: string): Promise<LogEntry[]> {
  return (await getDb()).getAllFromIndex('logs', 'byDate', IDBKeyRange.bound(from, to));
}
export function sumMacros(items: { macros: Macros }[]): Macros {
  return items.reduce((s, i) => ({ kcal: s.kcal + i.macros.kcal, protein: s.protein + i.macros.protein, carbs: s.carbs + i.macros.carbs, fat: s.fat + i.macros.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
}
export async function getDayTotals(date: string): Promise<Macros> { return sumMacros(await getLogsByDate(date)); }
/** Distinct recently logged foods (by name+foodId), newest first, for quick-add. */
export async function getRecentFoods(limit = 10): Promise<LogEntry[]> {
  const db = await getDb(); const out: LogEntry[] = []; const seen = new Set<string>();
  let cur = await db.transaction('logs').store.index('byCreated').openCursor(null, 'prev');
  while (cur && out.length < limit) {
    const k = cur.value.foodId ?? cur.value.name.toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(cur.value); }
    cur = await cur.continue();
  }
  return out;
}

// Weights (one per date; re-weighing overwrites)
export const addWeight = async (date: string, kg: number) => { const v = { date, kg, createdAt: Date.now() }; await (await getDb()).put('weights', v); return v; };
export const deleteWeight = async (date: string) => (await getDb()).delete('weights', date);
export const listWeights = async () => (await getDb()).getAll('weights'); // sorted by date (key order)

// Water (ml taps per day)
export async function getWater(date: string): Promise<number[]> { return (await (await getDb()).get('water', date))?.taps ?? []; }
export async function addWaterTap(date: string, ml: number): Promise<number[]> {
  const taps = [...(await getWater(date)), ml]; await (await getDb()).put('water', { date, taps }); return taps;
}
export async function undoWaterTap(date: string): Promise<number[]> {
  const taps = (await getWater(date)).slice(0, -1); const db = await getDb();
  if (taps.length) await db.put('water', { date, taps }); else await db.delete('water', date); return taps;
}

// Activity bonus (manual steps or kcal)
export const getActivity = async (date: string) => (await getDb()).get('activity', date);
export async function setActivity(date: string, a: { steps?: number; kcal?: number }) { const v = { date, ...a }; await (await getDb()).put('activity', v); return v; }
export const deleteActivity = async (date: string) => (await getDb()).delete('activity', date);

// Body measurements
export async function addMeasurement(m: Omit<Measurement, 'id' | 'createdAt'>): Promise<Measurement> { const v = { id: uid(), createdAt: Date.now(), ...m }; await (await getDb()).put('measurements', v); return v; }
export const deleteMeasurement = async (id: string) => (await getDb()).delete('measurements', id);
export async function listMeasurements(): Promise<Measurement[]> { return (await (await getDb()).getAll('measurements')).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt); }

// Progress photos: blobs live only in IndexedDB on this device
export async function addPhoto(date: string, blob: Blob): Promise<ProgressPhoto> { const v = { id: uid(), date, blob, createdAt: Date.now() }; await (await getDb()).put('photos', v); return v; }
export const deletePhoto = async (id: string) => (await getDb()).delete('photos', id);
export async function listPhotos(): Promise<ProgressPhoto[]> { return (await (await getDb()).getAll('photos')).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt); }

// Meal templates
export const saveTemplate = async (t: MealTemplate) => { await (await getDb()).put('templates', t); return t; };
export const listTemplates = async () => (await (await getDb()).getAll('templates')).sort((a, b) => b.createdAt - a.createdAt);
export const deleteTemplate = async (id: string) => (await getDb()).delete('templates', id);

/** Copy entries onto `toDate` as brand-new rows (new ids/createdAt, no shared references). */
export async function copyLogs(entries: LogEntry[], toDate: string, meal?: LogEntry['meal']): Promise<LogEntry[]> {
  const out: LogEntry[] = []; let n = Date.now();
  for (const e of entries) {
    const { id: _id, createdAt: _c, ...rest } = structuredClone(e);
    out.push(await addLog({ ...rest, date: toDate, meal: meal ?? e.meal, createdAt: n++ }));
  }
  return out;
}
export async function listLogs(): Promise<LogEntry[]> { return (await (await getDb()).getAll('logs')).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt); }
export async function usedDates(from: string, to: string): Promise<Set<string>> {
  return new Set((await getLogsInRange(from, to)).map(l => l.date));
}

// Export / import / reset
/** includePhotos is opt-in: progress photos can be large, so they are excluded from the default backup. */
export async function exportAll(includeKeys = false, includePhotos = false): Promise<ExportBundle> {
  const db = await getDb(); const settings = await db.get('settings', 'settings');
  const photos = includePhotos ? await Promise.all((await db.getAll('photos')).map(async p => ({ id: p.id, date: p.date, createdAt: p.createdAt, dataUrl: await blobToDataUrl(p.blob) }))) : undefined;
  return {
    app: 'calorie-app', version: DB_VERSION, exportedAt: new Date().toISOString(),
    profile: await db.get('profile', 'me'),
    settings: settings && !includeKeys ? { ...settings, apiKeys: {} } : settings,
    foods: await db.getAll('foods'), recipes: await db.getAll('recipes'),
    logs: await db.getAll('logs'), weights: await db.getAll('weights'),
    water: await db.getAll('water'), activity: await db.getAll('activity'),
    measurements: await db.getAll('measurements'), templates: await db.getAll('templates'),
    ...(photos ? { photos } : {}),
  };
}

/** Throws (before touching any data) when the file is not a valid, compatible export. */
export function validateBundle(b: any): asserts b is ExportBundle {
  if (!b || b.app !== 'calorie-app') throw new Error('Not a Cutline backup file');
  if (typeof b.version !== 'number' || !Number.isInteger(b.version) || b.version < 1) throw new Error('Backup has no valid schemaVersion');
  if (b.version > DB_VERSION) throw new Error(`Backup is from a newer app version (v${b.version}). Update Cutline first.`);
  for (const k of ['logs', 'foods', 'recipes', 'weights'] as const) if (b[k] !== undefined && !Array.isArray(b[k])) throw new Error(`Backup field "${k}" is malformed`);
  if (!Array.isArray(b.logs)) throw new Error('Backup is missing logs');
  if (b.weights?.some((w: any) => typeof w?.date !== 'string' || typeof w?.kg !== 'number')) throw new Error('Backup contains invalid weights');
  if (b.logs.some((l: any) => typeof l?.id !== 'string' || typeof l?.date !== 'string')) throw new Error('Backup contains invalid log entries');
}

export async function importAll(b: ExportBundle, mode: 'replace' | 'merge' = 'replace'): Promise<void> {
  validateBundle(b);
  const photos = (b.photos ?? []).map(p => ({ id: p.id, date: p.date, createdAt: p.createdAt, blob: dataUrlToBlob(p.dataUrl) }));
  const db = await getDb();
  const tx = db.transaction(STORES, 'readwrite');
  try {
    if (mode === 'replace') for (const s of ['foods', 'recipes', 'logs', 'weights', 'water', 'activity', 'measurements', 'templates'] as const) await tx.objectStore(s).clear();
    if (mode === 'replace' && photos.length) await tx.objectStore('photos').clear();
    if (b.profile) await tx.objectStore('profile').put(b.profile);
    if (b.settings) {
      const cur = await tx.objectStore('settings').get('settings');
      const keys = Object.keys(b.settings.apiKeys ?? {}).length ? b.settings.apiKeys : cur?.apiKeys ?? {};
      await tx.objectStore('settings').put({ ...DEFAULT_SETTINGS, ...b.settings, apiKeys: keys, id: 'settings' });
    }
    for (const f of b.foods ?? []) await tx.objectStore('foods').put(f);
    for (const r of b.recipes ?? []) await tx.objectStore('recipes').put(r);
    for (const l of b.logs) await tx.objectStore('logs').put(l);
    for (const w of b.weights ?? []) await tx.objectStore('weights').put(w);
    for (const w of b.water ?? []) await tx.objectStore('water').put(w);
    for (const a of b.activity ?? []) await tx.objectStore('activity').put(a);
    for (const m of b.measurements ?? []) await tx.objectStore('measurements').put(m);
    for (const t of b.templates ?? []) await tx.objectStore('templates').put(t);
    for (const p of photos) await tx.objectStore('photos').put(p);
  } catch (e) { tx.done.catch(() => {}); try { tx.abort(); } catch { /* already aborted */ } throw e; }
  await tx.done;
}
export async function resetAll(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(STORES, 'readwrite');
  await Promise.all(STORES.map(n => tx.objectStore(n).clear())); await tx.done;
}
