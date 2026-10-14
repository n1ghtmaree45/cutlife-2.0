import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { en } from '../src/i18n/en';
import { el } from '../src/i18n/el';

const walk = (d: string): string[] => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(jsx?|tsx?)$/.test(p) ? [p] : []; });
const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

describe('i18n', () => {
  it('every English key has a Greek key (and vice versa)', () => {
    expect(Object.keys(en).filter(k => !(k in el))).toEqual([]);
    expect(Object.keys(el).filter(k => !(k in en))).toEqual([]);
  });
  it('Greek strings use the same {placeholders} as English', () => {
    for (const k of Object.keys(en)) expect([k, vars(el[k])]).toEqual([k, vars(en[k])]);
  });
  it('no empty strings', () => { for (const d of [en, el]) for (const [k, v] of Object.entries(d)) expect([k, v.trim().length > 0]).toEqual([k, true]); });
  it('every t("key") used in the source exists in both dictionaries', () => {
    const used = new Set<string>();
    for (const f of walk('src')) for (const m of readFileSync(f, 'utf8').matchAll(/\bt\(\s*['"]([a-zA-Z0-9_.]+)['"]/g)) used.add(m[1]);
    for (const k of ['conf.High', 'conf.Medium', 'conf.Low']) used.add(k); // built dynamically
    used.delete('key');
    expect([...used].filter(k => !(k in en))).toEqual([]);
    expect([...used].filter(k => !(k in el))).toEqual([]);
  });
});
