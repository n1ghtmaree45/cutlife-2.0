import type { Lang } from '../types';
import { en } from './en';
import { el } from './el';
import { fmtNum, parseNum, fmtDate } from './format';

export { parseNum };
const dicts: Record<Lang, Record<string, string>> = { en, el };
const detect = (): Lang => {
  try { const s = localStorage.getItem('ct.lang'); if (s === 'en' || s === 'el') return s; } catch { /* storage blocked */ }
  return (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('el')) ? 'el' : 'en';
};
let lang: Lang = detect();
export const getLang = () => lang;
export function setLang(l: Lang) { lang = l; try { localStorage.setItem('ct.lang', l); } catch { /* ignore */ } if (typeof document !== 'undefined') document.documentElement.lang = l; }

/** t('key', {n: 3}) with {n} placeholders. Falls back to English, then to the key itself (never blank). */
export function t(key: string, vars?: Record<string, string | number>): string {
  let s = dicts[lang][key] ?? en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
export const num = (n: number, decimals = 0) => fmtNum(n, lang, decimals);
export const dateLabel = (iso: string, opts?: Intl.DateTimeFormatOptions) => fmtDate(iso, lang, opts);
export const allKeys = () => ({ en: Object.keys(en), el: Object.keys(el) });
