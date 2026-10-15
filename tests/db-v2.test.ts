import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { openDB } from 'idb';
import * as DB from '../src/data/db';

beforeEach(async () => { await DB._resetDbHandle(); indexedDB.deleteDatabase(DB.DB_NAME); await DB.resetAll(); });

describe('v1 -> v2 migration', () => {
  it('keeps every existing record and adds the new stores', async () => {
    await DB._resetDbHandle();
    await new Promise<void>((res, rej) => { const r = indexedDB.deleteDatabase(DB.DB_NAME); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });
    // Build a genuine v1 database exactly as the shipped M1 app did.
    const v1 = await openDB(DB.DB_NAME, 1, { upgrade(db) {
      db.createObjectStore('profile', { keyPath: 'id' }); db.createObjectStore('settings', { keyPath: 'id' });
      const f = db.createObjectStore('foods', { keyPath: 'id' }); f.createIndex('byBarcode', 'barcode'); f.createIndex('byName', 'name');
      db.createObjectStore('recipes', { keyPath: 'id' });
      const l = db.createObjectStore('logs', { keyPath: 'id' }); l.createIndex('byDate', 'date'); l.createIndex('byCreated', 'createdAt');
      db.createObjectStore('weights', { keyPath: 'date' });
    } });
    await v1.put('profile', { id: 'me', sex: 'male', heightCm: 178 });
    await v1.put('logs', { id: 'a', date: '2026-10-12', meal: 'lunch', name: 'Egg', grams: 50, macros: { kcal: 70, protein: 6, carbs: 0, fat: 5 }, source: 'quick', createdAt: 1 });
    await v1.put('weights', { date: '2026-10-12', kg: 88, createdAt: 1 });
    await v1.put('settings', { id: 'settings', units: 'kg', theme: 'dark', provider: 'gemini', apiKeys: { usda: 'KEY' } });
    v1.close();

    expect((await DB.getProfile())?.heightCm).toBe(178);
    expect(await DB.getLogsByDate('2026-10-12')).toHaveLength(1);
    expect((await DB.listWeights())[0].kg).toBe(88);
    expect((await DB.getSettings()).apiKeys.usda).toBe('KEY');
    expect((await DB.getSettings()).theme).toBe('dark');
    // new stores work straight away
    await DB.addWaterTap('2026-10-12', 250); expect(await DB.getWater('2026-10-12')).toEqual([250]);
  });
});

describe('extras CRUD', () => {
  it('water: add, undo, empty day', async () => {
    expect(await DB.getWater('2026-10-12')).toEqual([]);
    await DB.addWaterTap('2026-10-12', 250); await DB.addWaterTap('2026-10-12', 500);
    expect(await DB.undoWaterTap('2026-10-12')).toEqual([250]); expect(await DB.undoWaterTap('2026-10-12')).toEqual([]);
    expect(await DB.undoWaterTap('2026-10-12')).toEqual([]); // undo on empty is a no-op
  });
  it('activity bonus is stored per day and removable', async () => {
    await DB.setActivity('2026-10-12', { steps: 8000 }); expect((await DB.getActivity('2026-10-12'))?.steps).toBe(8000);
    expect(await DB.getActivity('2026-10-13')).toBeUndefined();
    await DB.deleteActivity('2026-10-12'); expect(await DB.getActivity('2026-10-12')).toBeUndefined();
  });
  it('measurements are listed by date', async () => {
    await DB.addMeasurement({ date: '2026-10-12', waistCm: 90 }); await DB.addMeasurement({ date: '2026-10-05', waistCm: 92 });
    expect((await DB.listMeasurements()).map(m => m.waistCm)).toEqual([92, 90]);
  });
  it('photos: stored as blobs, deleting removes the blob', async () => {
    const p = await DB.addPhoto('2026-10-12', new Blob(['x'], { type: 'image/jpeg' })); expect(await DB.listPhotos()).toHaveLength(1);
    await DB.deletePhoto(p.id); expect(await DB.listPhotos()).toHaveLength(0);
  });
  it('copyLogs creates brand-new rows with no shared references', async () => {
    const a = await DB.addLog({ date: '2026-10-11', meal: 'lunch', name: 'Rice', grams: 150, macros: { kcal: 200, protein: 4, carbs: 40, fat: 1 }, source: 'quick' });
    const [c] = await DB.copyLogs([a], '2026-10-12', 'dinner');
    expect(c.id).not.toBe(a.id); expect(c.date).toBe('2026-10-12'); expect(c.meal).toBe('dinner'); expect(c.macros).toEqual(a.macros); expect(c.macros).not.toBe(a.macros);
    c.macros.kcal = 1; expect((await DB.getLogsByDate('2026-10-11'))[0].macros.kcal).toBe(200);
  });
  it('templates CRUD', async () => {
    await DB.saveTemplate({ id: 't1', name: 'Breakfast', meal: 'breakfast', items: [], createdAt: 1 }); expect(await DB.listTemplates()).toHaveLength(1);
    await DB.deleteTemplate('t1'); expect(await DB.listTemplates()).toHaveLength(0);
  });
});

describe('export / import', () => {
  it('full round-trip returns identical data (including extras)', async () => {
    await DB.saveProfile({ id: 'me', sex: 'male', birthDate: '1990-01-01', heightCm: 178, weightKg: 88, goalWeightKg: 80, activity: 'light', goal: 'lose', deficitPct: 0.2, proteinGPerKg: 2, targets: { kcal: 2000, protein: 170, carbs: 200, fat: 60 }, updatedAt: 1 });
    await DB.addLog({ date: '2026-10-12', meal: 'lunch', name: 'Egg', grams: 50, macros: { kcal: 70, protein: 6, carbs: 0, fat: 5 }, source: 'quick', id: 'l1', createdAt: 5 });
    await DB.addWeight('2026-10-12', 88); await DB.addWaterTap('2026-10-12', 250); await DB.setActivity('2026-10-12', { steps: 9000 });
    await DB.addMeasurement({ date: '2026-10-12', waistCm: 90 }); await DB.saveTemplate({ id: 't', name: 'T', meal: 'lunch', items: [], createdAt: 2 });
    const before = await DB.exportAll(); delete (before as any).exportedAt;
    await DB.resetAll(); await DB.importAll(JSON.parse(JSON.stringify(await (async () => ({ ...before, exportedAt: 'x' }))())));
    const after = await DB.exportAll(); delete (after as any).exportedAt;
    expect(after).toEqual(before);
  });
  it('photos are excluded by default and round-trip when opted in', async () => {
    await DB.addPhoto('2026-10-12', new Blob(['abc'], { type: 'image/jpeg' }));
    expect((await DB.exportAll()).photos).toBeUndefined();
    const withPhotos = await DB.exportAll(false, true); expect(withPhotos.photos).toHaveLength(1);
    await DB.resetAll(); expect(await DB.listPhotos()).toHaveLength(0);
    await DB.importAll(withPhotos); const [p] = await DB.listPhotos(); expect(p.blob.size).toBe(3);
  });
  it('a v1 backup (no extras) still imports', async () => {
    await DB.importAll({ app: 'calorie-app', version: 1, exportedAt: 'x', foods: [], recipes: [], logs: [], weights: [{ date: '2026-10-01', kg: 80, createdAt: 1 }] });
    expect(await DB.listWeights()).toHaveLength(1);
  });
  it('rejects bad files and leaves existing data untouched', async () => {
    await DB.addWeight('2026-10-01', 80);
    const bad: any[] = [null, {}, { app: 'other' }, { app: 'calorie-app', logs: [] }, { app: 'calorie-app', version: 99, logs: [] },
      { app: 'calorie-app', version: 2, logs: 'nope' }, { app: 'calorie-app', version: 2, logs: [{ id: 1 }] }, { app: 'calorie-app', version: 2, logs: [], weights: [{ date: 'x' }] }, { app: 'calorie-app', version: 0, logs: [] }];
    for (const b of bad) await expect(DB.importAll(b)).rejects.toThrow();
    expect(await DB.listWeights()).toHaveLength(1);
  });
  it('a failure mid-import rolls everything back', async () => {
    await DB.addWeight('2026-10-01', 80);
    const b: any = { app: 'calorie-app', version: 2, exportedAt: 'x', foods: [], recipes: [], weights: [{ date: '2026-10-09', kg: 70, createdAt: 1 }], logs: [{ id: 'ok', date: '2026-10-09' }], measurements: [{ date: 'no-id-key' }] };
    await expect(DB.importAll(b)).rejects.toThrow();
    expect((await DB.listWeights()).map(w => w.date)).toEqual(['2026-10-01']); expect(await DB.listLogs()).toHaveLength(0);
  });
});
