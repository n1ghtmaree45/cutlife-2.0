import { describe, it, expect } from 'vitest';
import { addDays, streak, waterTotal, waterPct, weeklySummary, activityBonus, dayTargetKcal, fastElapsedMs, fastProgress, formatHMS } from '../src/lib/stats';
import { toCsv, logsToCsv, weightsToCsv, BOM } from '../src/lib/csv';
import { fmtNum, parseNum } from '../src/i18n/format';

const m = (kcal: number, protein: number) => ({ kcal, protein, carbs: 0, fat: 0 });

describe('water', () => {
  it('sums taps and caps progress at 100%', () => {
    expect(waterTotal([250, 250, 500])).toBe(1000);
    expect(waterPct([250, 250], 2500)).toBeCloseTo(0.2);
    expect(waterPct([1000, 1000, 1000], 2500)).toBe(1);
    expect(waterPct([], 0)).toBe(0);
  });
});

describe('streak', () => {
  it('counts consecutive days ending today', () => expect(streak(['2026-10-10', '2026-10-11', '2026-10-12'], '2026-10-12')).toBe(3));
  it('stays alive when today is not logged yet', () => expect(streak(['2026-10-10', '2026-10-11'], '2026-10-12')).toBe(2));
  it('breaks after a fully missed day', () => expect(streak(['2026-10-09', '2026-10-10'], '2026-10-12')).toBe(0));
  it('a gap ends the run', () => expect(streak(['2026-10-12', '2026-10-10', '2026-10-09'], '2026-10-12')).toBe(1));
  it('ignores duplicates (several logs on one day)', () => expect(streak(['2026-10-12', '2026-10-12', '2026-10-11'], '2026-10-12')).toBe(2));
  it('is DST-safe: spring-forward and fall-back weekends are single days', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29'); expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-10-25', -1)).toBe('2026-10-24'); expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
    expect(streak(['2026-03-28', '2026-03-29', '2026-03-30'], '2026-03-30')).toBe(3);
    expect(streak(['2026-10-24', '2026-10-25', '2026-10-26'], '2026-10-26')).toBe(3);
  });
  it('crosses month and year boundaries', () => expect(streak(['2026-12-31', '2027-01-01'], '2027-01-01')).toBe(2));
});

describe('weekly summary', () => {
  const totals = { '2026-10-06': m(2000, 150), '2026-10-07': m(1800, 100), '2026-10-08': m(2200, 140), '2026-10-12': m(1600, 160), '2026-09-30': m(9999, 999) };
  const weights = [{ date: '2026-10-05', kg: 90, createdAt: 0 }, { date: '2026-10-06', kg: 88, createdAt: 0 }, { date: '2026-10-12', kg: 87.4, createdAt: 0 }];
  it('matches a hand calculation (window = 7 days ending 12 Oct)', () => {
    // in window: 06,07,08,12 -> kcal avg (2000+1800+2200+1600)/4 = 1900. protein >= 0.9*150 = 135: days 06 (150), 08 (140), 12 (160) -> 3/4
    const s = weeklySummary(totals, weights, { protein: 150 }, '2026-10-12');
    expect(s.loggedDays).toBe(4); expect(s.avgKcal).toBe(1900); expect(s.proteinHitRate).toBeCloseTo(0.75);
    expect(s.weightChangeKg).toBeCloseTo(-0.6); // 87.4 - 88 (05 Oct is outside the window)
  });
  it('handles an empty week and a single weigh-in', () => {
    expect(weeklySummary({}, [], { protein: 150 }, '2026-10-12')).toEqual({ loggedDays: 0, avgKcal: 0, proteinHitRate: 0, weightChangeKg: null });
    expect(weeklySummary({}, [{ date: '2026-10-12', kg: 80, createdAt: 0 }], { protein: 1 }, '2026-10-12').weightChangeKg).toBeNull();
  });
});

describe('activity bonus', () => {
  it('steps: 0.04 kcal each at 50% credit (10,000 steps = +200)', () => { expect(activityBonus({ steps: 10000 })).toBe(200); expect(activityBonus({ steps: 0 })).toBe(0); });
  it('manual kcal wins over steps and is never negative', () => { expect(activityBonus({ kcal: 150, steps: 10000 })).toBe(150); expect(activityBonus({ kcal: -50 })).toBe(0); });
  it('only changes the day it is applied to', () => {
    expect(dayTargetKcal(1800, { steps: 5000 })).toBe(1900); expect(dayTargetKcal(1800, null)).toBe(1800); expect(dayTargetKcal(1800, undefined)).toBe(1800);
  });
});

describe('fasting timer', () => {
  it('is timestamp-based: elapsed depends only on now - start', () => {
    const start = 1_000_000; expect(fastElapsedMs(start, start + 16 * 3600000)).toBe(16 * 3600000);
    expect(fastElapsedMs(start, start - 5)).toBe(0); // clock skew never goes negative
    expect(fastProgress(start, start + 8 * 3600000, 16)).toBeCloseTo(0.5); expect(fastProgress(start, start + 99 * 3600000, 16)).toBe(1);
  });
  it('formats h:mm:ss', () => { expect(formatHMS(0)).toBe('0:00:00'); expect(formatHMS(3723000)).toBe('1:02:03'); expect(formatHMS(100 * 3600000)).toBe('100:00:00'); });
});

describe('csv', () => {
  it('starts with a BOM, uses CRLF, and escapes commas, quotes and newlines', () => {
    const c = toCsv([['a', 'b,c', 'say "hi"', 'x\ny']]);
    expect(c.startsWith(BOM)).toBe(true); expect(c).toBe(BOM + 'a,"b,c","say ""hi""","x\ny"\r\n');
  });
  it('keeps Greek text intact', () => expect(toCsv([['Γιαούρτι, 2%']])).toContain('"Γιαούρτι, 2%"'));
  it('neutralises spreadsheet formula injection from food names', () => expect(toCsv([['=HYPERLINK("x")', '+1', '-2', '@x']])).toBe(BOM + `"'=HYPERLINK(""x"")",'+1,'-2,'@x\r\n`));
  it('does not mangle negative numbers', () => expect(toCsv([[-2.5]])).toBe(BOM + '-2.5\r\n'));
  it('logs and weights export with dot decimals and ISO dates', () => {
    const l = logsToCsv([{ id: '1', date: '2026-10-12', meal: 'lunch', name: 'Φέτα', grams: 30, macros: { kcal: 79.2, protein: 4.2, carbs: 1.2, fat: 6.3 }, source: 'usda', createdAt: 0 }]);
    expect(l.split('\r\n')[0]).toContain('date,meal,name,grams,kcal,protein_g,carbs_g,fat_g,source'); expect(l).toContain('2026-10-12,lunch,Φέτα,30,79,4.2,1.2,6.3,usda');
    expect(weightsToCsv([{ date: '2026-10-12', kg: 80, createdAt: 0 }], 'lb')).toContain('2026-10-12,176.4');
    expect(weightsToCsv([{ date: '2026-10-12', kg: 80.25, createdAt: 0 }])).toContain('weight_kg');
  });
});

describe('number formatting & parsing (el / en)', () => {
  it('formats with the right separators', () => {
    expect(fmtNum(1234.5, 'el', 1)).toBe('1.234,5'); expect(fmtNum(1234.5, 'en', 1)).toBe('1,234.5');
    expect(fmtNum(1234567, 'el')).toBe('1.234.567'); expect(fmtNum(999, 'el')).toBe('999'); expect(fmtNum(0.04, 'el', 1)).toBe('0,0'); expect(fmtNum(-0.04, 'en', 1)).toBe('0.0');
    expect(fmtNum(-72.5, 'el', 1)).toBe('-72,5'); expect(fmtNum(NaN, 'en')).toBe('–');
  });
  it('parses a decimal comma and a decimal point', () => {
    expect(parseNum('72,5')).toBe(72.5); expect(parseNum('72.5')).toBe(72.5); expect(parseNum(' 0,125 ')).toBe(0.125); expect(parseNum('-1,5')).toBe(-1.5);
  });
  it('parses grouped numbers in both locales', () => { expect(parseNum('1.234,5')).toBe(1234.5); expect(parseNum('1,234.5')).toBe(1234.5); expect(parseNum('1,234')).toBe(1234); });
  it('rejects junk', () => { for (const s of ['', 'abc', '1.2.3', '--1', '12kg']) expect(parseNum(s)).toBeNaN(); });
});
