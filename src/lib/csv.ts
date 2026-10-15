// CSV export. UTF-8 with a BOM so Excel opens Greek text correctly; CRLF line endings; RFC 4180 quoting.
// Dates are ISO (YYYY-MM-DD). Decimals always use a dot, regardless of the UI language.
import type { LogEntry, WeightEntry, Units } from '../types';
import { kgToLb, round } from './nutrition';

export const BOM = '\uFEFF';
export type Cell = string | number | undefined | null;
const esc = (c: Cell) => {
  let s = c == null ? '' : String(c);
  if (/^[=+\-@\t\r]/.test(s) && typeof c === 'string') s = `'${s}`; // neutralise spreadsheet formula injection from food names
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows: Cell[][]) => BOM + rows.map(r => r.map(esc).join(',')).join('\r\n') + '\r\n';

export const logsToCsv = (logs: LogEntry[]) => toCsv([
  ['date', 'meal', 'name', 'grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'source'],
  ...logs.map(l => [l.date, l.meal, l.name, round(l.grams, 1), round(l.macros.kcal), round(l.macros.protein, 1), round(l.macros.carbs, 1), round(l.macros.fat, 1), l.source]),
]);
export const weightsToCsv = (ws: WeightEntry[], units: Units = 'kg') => toCsv([
  ['date', `weight_${units}`],
  ...ws.map(w => [w.date, units === 'lb' ? round(kgToLb(w.kg), 1) : round(w.kg, 2)]),
]);
