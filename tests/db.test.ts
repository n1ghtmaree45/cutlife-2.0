import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import * as DB from '../src/data/db';

beforeEach(async () => { await DB.resetAll(); });

describe('db', () => {
  it('settings defaults + patch', async () => {
    expect((await DB.getSettings()).units).toBe('kg');
    await DB.saveSettings({ units: 'lb', apiKeys: { gemini: 'k' } });
    expect(await DB.getSettings()).toMatchObject({ units: 'lb', provider: 'gemini', apiKeys: { gemini: 'k' } });
  });
  it('logs by date, totals, recent', async () => {
    const m = { kcal: 100, protein: 10, carbs: 5, fat: 2 };
    await DB.addLog({ date: '2026-10-12', meal: 'lunch', name: 'Egg', grams: 50, macros: m, source: 'usda', foodId: 'usda:1', createdAt: 1 });
    await DB.addLog({ date: '2026-10-12', meal: 'dinner', name: 'Egg', grams: 50, macros: m, source: 'usda', foodId: 'usda:1', createdAt: 2 });
    await DB.addLog({ date: '2026-10-11', meal: 'lunch', name: 'Rice', grams: 100, macros: m, source: 'custom', createdAt: 0 });
    expect(await DB.getDayTotals('2026-10-12')).toEqual({ kcal: 200, protein: 20, carbs: 10, fat: 4 });
    expect((await DB.getRecentFoods()).map(r => r.name)).toEqual(['Egg', 'Rice']);
    expect(await DB.getLogsInRange('2026-10-01', '2026-10-31')).toHaveLength(3);
  });
  it('foods, barcode, local search', async () => {
    await DB.saveFood({ id: 'off:1', source: 'off', name: 'Oat Milk', brand: 'Oatly', barcode: '1', per100g: { kcal: 46, protein: 1, carbs: 6.7, fat: 1.5 } });
    expect((await DB.getFoodByBarcode('1'))?.name).toBe('Oat Milk');
    expect(await DB.searchLocalFoods('oatly')).toHaveLength(1);
  });
  it('weights: one per date, sorted', async () => {
    await DB.addWeight('2026-10-02', 80); await DB.addWeight('2026-10-01', 81); await DB.addWeight('2026-10-02', 79.5);
    expect((await DB.listWeights()).map(w => [w.date, w.kg])).toEqual([['2026-10-01', 81], ['2026-10-02', 79.5]]);
  });
  it('export strips keys; import round-trips and preserves existing keys', async () => {
    await DB.saveSettings({ apiKeys: { gemini: 'secret' } }); await DB.addWeight('2026-10-01', 80);
    const b = await DB.exportAll(); expect(b.settings?.apiKeys).toEqual({}); expect(b.weights).toHaveLength(1);
    await DB.addWeight('2026-10-05', 70);
    await DB.importAll(b, 'replace');
    expect(await DB.listWeights()).toHaveLength(1);
    expect((await DB.getSettings()).apiKeys.gemini).toBe('secret');
    await expect(DB.importAll({} as any)).rejects.toThrow();
  });
});
