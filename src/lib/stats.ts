// Pure helpers for the "extras": water, streaks, weekly summary, activity bonus, fasting.
// Dates are local YYYY-MM-DD strings; all date math is done on the strings via UTC day numbers,
// so DST shifts and timezone changes can never double-count or skip a day.
import type { Macros, WeightEntry, ActivityDay } from '../types';

const dayNum = (iso: string) => Math.round(Date.parse(iso + 'T00:00:00Z') / 86400000);
export const addDays = (iso: string, n: number) => new Date((dayNum(iso) + n) * 86400000).toISOString().slice(0, 10);

/* ---- water ---- */
export const WATER_TAP_ML = 250;
export const DEFAULT_WATER_GOAL_ML = 2500;
export const waterTotal = (taps: number[]) => taps.reduce((a, b) => a + b, 0);
export const waterPct = (taps: number[], goalMl: number) => (goalMl > 0 ? Math.min(1, waterTotal(taps) / goalMl) : 0);

/* ---- streak ----
 * A streak is the number of consecutive days with >= 1 log, counting back from today.
 * If today has no log yet, the streak is still alive (it is counted from yesterday),
 * so it only breaks once a whole day has passed with nothing logged. */
export function streak(loggedDates: Iterable<string>, today: string): number {
  const set = new Set(loggedDates);
  let d = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

/* ---- weekly summary ----
 * Window = the 7 days ending on `endDate` (inclusive).
 * avgKcal        = mean daily kcal over days that have at least one log.
 * proteinHitRate = share of logged days with protein >= 90% of the protein target (0..1).
 * weightChangeKg = last weigh-in minus first weigh-in inside the window (null if < 2). */
export interface WeeklySummary { loggedDays: number; avgKcal: number; proteinHitRate: number; weightChangeKg: number | null; }
export function weeklySummary(dayTotals: Record<string, Macros>, weights: WeightEntry[], target: { protein: number }, endDate: string): WeeklySummary {
  const start = addDays(endDate, -6);
  const days = Object.entries(dayTotals).filter(([d, m]) => d >= start && d <= endDate && m.kcal > 0);
  const loggedDays = days.length;
  const avgKcal = loggedDays ? Math.round(days.reduce((a, [, m]) => a + m.kcal, 0) / loggedDays) : 0;
  const hits = days.filter(([, m]) => m.protein >= target.protein * 0.9).length;
  const win = weights.filter(w => w.date >= start && w.date <= endDate).sort((a, b) => a.date.localeCompare(b.date));
  const weightChangeKg = win.length >= 2 ? Math.round((win[win.length - 1].kg - win[0].kg) * 100) / 100 : null;
  return { loggedDays, avgKcal, proteinHitRate: loggedDays ? hits / loggedDays : 0, weightChangeKg };
}

/* ---- activity bonus ----
 * Manual steps or manual kcal. Steps are worth 0.04 kcal each, but only half is credited
 * (the base target already includes an activity multiplier, and step counts are noisy), so
 * 10,000 steps = +200 kcal. A kcal entry is used as-is. Applies to that single day's target only. */
export const STEP_KCAL = 0.04;
export const STEP_CREDIT = 0.5;
export const activityBonus = (a?: Pick<ActivityDay, 'steps' | 'kcal'> | null): number =>
  !a ? 0 : a.kcal != null ? Math.max(0, Math.round(a.kcal)) : a.steps != null ? Math.max(0, Math.round(a.steps * STEP_KCAL * STEP_CREDIT)) : 0;
export const dayTargetKcal = (baseKcal: number, a?: Pick<ActivityDay, 'steps' | 'kcal'> | null) => baseKcal + activityBonus(a);

/* ---- intermittent fasting (timestamp based: survives app kill, reboot and phone sleep) ---- */
export const fastElapsedMs = (startedAt: number, now: number) => Math.max(0, now - startedAt);
export const fastProgress = (startedAt: number, now: number, targetH: number) => Math.min(1, fastElapsedMs(startedAt, now) / (targetH * 3600000));
export function formatHMS(ms: number): string {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`;
}
