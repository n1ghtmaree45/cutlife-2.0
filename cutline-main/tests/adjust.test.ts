import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import * as DB from '../src/data/db';
// @ts-expect-error JS service module
import { weightInsights, applyAdjustment, dismissAdjustment, saveProfile, getProfile, calcTargets } from '../src/ui/services/index.js';
import { addDays } from '../src/lib/stats';

const base = { sex: 'male', age: 34, heightCm: 178, weightKg: 88, goalWeightKg: 80, activity: 1.375, deficitPct: 20, units: 'kg' };
const series = (today: string, startKg: number, perWeekKg: number, days = 21) =>
  Array.from({ length: days + 1 }, (_, i) => ({ date: addDays(today, -(days - i)), kg: Math.round((startKg + (perWeekKg * i) / 7) * 100) / 100, createdAt: i }));
const today = '2026-10-13';
const profileWith = (extra = {}) => { const t = calcTargets(base); return { ...base, targets: { kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat }, updatedAt: Date.parse('2026-09-01'), ...extra }; };

beforeEach(async () => { await DB._resetDbHandle(); indexedDB.deleteDatabase(DB.DB_NAME); await DB.resetAll(); });

describe('bi-weekly target suggestion', () => {
  it('suggests a LOWER target when loss is much slower than planned (and 14+ days passed)', () => {
    const p = profileWith(); const exp = calcTargets(base).weeklyLossKg;
    const r = weightInsights(p, series(today, 88, 0), { lastAdjustAt: '2026-09-20' }, today); // flat weight
    expect(exp).toBeGreaterThan(0.3); expect(r.rate).not.toBeNull(); expect(r.suggest).toBe(true);
    expect(r.adjustment.reason).toBe('too_slow'); expect(r.adjustment.newKcal).toBeLessThan(p.targets.kcal);
    expect(p.targets.kcal - r.adjustment.newKcal).toBeLessThanOrEqual(200);
  });
  it('suggests a HIGHER target when losing too fast', () => {
    const p = profileWith(); const r = weightInsights(p, series(today, 90, -1.4), { lastAdjustAt: '2026-09-20' }, today);
    expect(r.suggest).toBe(true); expect(r.adjustment.reason).toBe('too_fast'); expect(r.adjustment.newKcal).toBeGreaterThan(p.targets.kcal);
  });
  it('stays quiet when on track', () => {
    const p = profileWith(); const exp = calcTargets(base).weeklyLossKg;
    expect(weightInsights(p, series(today, 88, -exp), { lastAdjustAt: '2026-09-20' }, today).suggest).toBe(false);
  });
  it('stays quiet inside the 14-day window, even if off track', () => {
    expect(weightInsights(profileWith(), series(today, 88, 0), { lastAdjustAt: '2026-10-05' }, today).suggest).toBe(false);
    expect(weightInsights(profileWith(), series(today, 88, 0), { lastAdjustAt: '2026-09-29' }, today).suggest).toBe(true); // exactly 14 days
  });
  it('never suggests with too little data', () => {
    const r = weightInsights(profileWith(), [{ date: today, kg: 88, createdAt: 1 }], {}, today); expect(r.rate).toBeNull(); expect(r.suggest).toBe(false);
  });
  it('never drops below the safe floor', () => {
    const p = profileWith({ sex: 'female', targets: { kcal: 1210, protein: 120, carbs: 100, fat: 40 } });
    const r = weightInsights(p, series(today, 88, 0), { lastAdjustAt: '2026-09-01' }, today);
    expect(r.adjustment.newKcal).toBeGreaterThanOrEqual(1200);
  });
});

describe('applying a suggestion', () => {
  it('stores the new kcal, keeps protein, rebalances macros to the new kcal, and restarts the 2-week clock', async () => {
    await saveProfile({ ...base }); const before = await getProfile(); await dismissAdjustment();
    await applyAdjustment(before.targets.kcal - 150);
    const after = await getProfile(); const t = after.targets;
    expect(t.kcal).toBe(before.targets.kcal - 150); expect(t.protein).toBe(before.targets.protein);
    expect(Math.abs(t.protein * 4 + t.carbs * 4 + t.fat * 9 - t.kcal)).toBeLessThanOrEqual(12); // macros add up to the target
    expect(t.carbs).toBeGreaterThanOrEqual(0); expect((await DB.getSettings()).lastAdjustAt).toBeTruthy();
  });
  it('dismissing keeps the target but restarts the clock', async () => {
    await saveProfile({ ...base }); const k = (await getProfile()).targets.kcal;
    await DB.saveSettings({ lastAdjustAt: '2020-01-01' }); await dismissAdjustment();
    expect((await getProfile()).targets.kcal).toBe(k); expect((await DB.getSettings()).lastAdjustAt).not.toBe('2020-01-01');
  });
  it('first save logs the starting weight so the chart can begin', async () => {
    await saveProfile({ ...base }); expect((await DB.listWeights()).map(w => w.kg)).toEqual([88]);
    await saveProfile({ ...base, weightKg: 86 }); expect((await DB.listWeights()).length).toBe(1); // editing the profile does not invent weigh-ins
  });
});
