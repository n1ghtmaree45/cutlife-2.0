// Locale-aware number formatting/parsing that does not depend on the ICU build of the device.
import type { Lang } from '../types';

export function fmtNum(n: number, lang: Lang, decimals = 0): string {
  if (!Number.isFinite(n)) return '–';
  const neg = n < 0; const fixed = Math.abs(n).toFixed(decimals);
  const [i, f] = fixed.split('.');
  const group = lang === 'el' ? '.' : ',', dec = lang === 'el' ? ',' : '.';
  const int = i.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  return (neg && Number(fixed) !== 0 ? '-' : '') + int + (f ? dec + f : '');
}

/** Parses what a person types: accepts "72,5" and "72.5"; also "1.234,5" (el) and "1,234.5" (en). NaN if not a number. */
export function parseNum(input: string): number {
  let s = input.trim().replace(/\s/g, '');
  if (!s) return NaN;
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const decSep = lastComma > lastDot ? ',' : '.';
    s = decSep === ',' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    s = /^-?[1-9]\d{0,2}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.'); // "1,234" is a thousands group, "72,5" a decimal
  }
  return /^-?\d*\.?\d+$|^-?\d+\.$/.test(s) ? Number(s) : NaN;
}

export const fmtDate = (iso: string, lang: Lang, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) =>
  new Date(iso + 'T12:00:00').toLocaleDateString(lang === 'el' ? 'el-GR' : 'en-GB', opts);
