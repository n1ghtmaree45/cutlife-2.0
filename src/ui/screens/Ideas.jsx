import { useEffect, useRef, useState } from 'preact/hooks';
import { RefreshCw, Plus, Clock, KeyRound, Sparkles, CalendarDays } from 'lucide-preact';
import { Notice, TextField, fmt } from '../components/ui.jsx';
import { getDay, aiSuggest, AiError, addEntry, saveSettings, dayTargetKcal, todayKey } from '../services/index.js';
import { t } from '../../i18n';
import { haptic } from '../../lib/haptics';

const defaultMeal = () => { const h = new Date().getHours(); return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 21 ? 'dinner' : 'snack'; };

export function Ideas({ profile, toast }) {
  const [day, setDay] = useState(null);
  const [prefs, setPrefs] = useState({ preferences: '', allergies: '', pantry: '' });
  const [stage, setStage] = useState('idle'); // idle | working | done | error
  const [res, setRes] = useState([]); const [err, setErr] = useState(null);
  const ac = useRef(null); const saveT = useRef(null);
  const [online, setOnline] = useState(navigator.onLine !== false);
  useEffect(() => { const on = () => setOnline(true), off = () => setOnline(false); addEventListener('online', on); addEventListener('offline', off); return () => { removeEventListener('online', on); removeEventListener('offline', off); ac.current?.abort(); }; }, []);
  useEffect(() => { getDay(todayKey()).then(d => { setDay(d); setPrefs({ preferences: d.settings.preferences || '', allergies: d.settings.allergies || '', pantry: d.settings.pantry || '' }); }); }, []);
  if (!day) return <main class="page" />;

  const eaten = day.entries.reduce((a, e) => ({ kcal: a.kcal + e.kcal, protein: a.protein + e.protein, carbs: a.carbs + e.carbs, fat: a.fat + e.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  const target = { kcal: dayTargetKcal(profile.targets.kcal, day.activity), protein: profile.targets.protein, carbs: profile.targets.carbs, fat: profile.targets.fat };
  const remaining = { kcal: Math.max(0, target.kcal - eaten.kcal), protein: Math.max(0, target.protein - eaten.protein), carbs: Math.max(0, target.carbs - eaten.carbs), fat: Math.max(0, target.fat - eaten.fat) };
  const edit = k => v => { const n = { ...prefs, [k]: v }; setPrefs(n); clearTimeout(saveT.current); saveT.current = setTimeout(() => saveSettings({ [k]: v }), 600); };

  const run = async () => {
    setStage('working'); setErr(null); ac.current?.abort(); ac.current = new AbortController();
    try { const r = await aiSuggest({ remaining, preferences: prefs.preferences.trim() || undefined, allergies: prefs.allergies.trim() || undefined, pantry: prefs.pantry.trim() || undefined }, { signal: ac.current.signal }); setRes(r.suggestions); setStage('done'); }
    catch (e) { if (ac.current.signal.aborted) return; setErr(e instanceof AiError ? { kind: e.kind, msg: e.message } : { kind: 'provider', msg: String(e?.message || e) }); setStage('error'); }
  };
  const log = async s => {
    const grams = Math.round(s.ingredients.reduce((a, i) => a + (i.grams || 0), 0)) || 1;
    await addEntry({ meal: defaultMeal(), name: s.name, grams, kcal: Math.round(s.macros.kcal), protein: Math.round(s.macros.protein * 10) / 10, carbs: Math.round(s.macros.carbs * 10) / 10, fat: Math.round(s.macros.fat * 10) / 10, source: 'ai', confidence: 0.5 });
    haptic(15); toast(t('ideas.logged', { name: s.name })); setDay(await getDay(todayKey()));
  };

  return (
    <main class="page">
      <div class="topbar"><div class="topbar__title">{t('ideas.title')}</div></div>
      <a class="btn btn--secondary btn--block" href="#/plan"><CalendarDays size={18} />{t('plan.open')}</a>
      <section class="card stack stack--sm">
        <span class="eyebrow">{t('ideas.remaining')}</span>
        <div class="nutri-grid">
          <div><b class="num">{fmt(remaining.kcal)}</b><small>kcal</small></div><div><b class="num">{fmt(remaining.protein)}g</b><small>{t('m.protein')}</small></div>
          <div><b class="num">{fmt(remaining.carbs)}g</b><small>{t('m.carbs')}</small></div><div><b class="num">{fmt(remaining.fat)}g</b><small>{t('m.fat')}</small></div>
        </div>
        {remaining.kcal < 150 && <span class="field__hint">{t('ideas.almost')}</span>}
      </section>

      <section class="stack">
        <TextField multiline label={t('ideas.prefs')} value={prefs.preferences} onInput={edit('preferences')} placeholder={t('ideas.prefs_ph')} />
        <TextField multiline label={t('ideas.allergies')} value={prefs.allergies} onInput={edit('allergies')} placeholder={t('ideas.allergies_ph')} />
        <TextField multiline label={t('ideas.pantry')} value={prefs.pantry} onInput={edit('pantry')} placeholder={t('ideas.pantry_ph')} />
      </section>

      {!online && <Notice info>{t('ideas.offline')}</Notice>}
      <button class="btn btn--primary btn--block" disabled={!online || stage === 'working'} onClick={run}><Sparkles size={18} />{stage === 'working' ? t('ideas.working') : res.length ? t('ideas.again') : t('ideas.go')}</button>

      {stage === 'error' && <div class="stack stack--sm">
        <Notice>{err.kind === 'no_key' ? t('photo.no_key') : err.kind === 'rate_limited' ? t('photo.rate_limited') : err.kind === 'invalid_json' ? t('ideas.invalid') : err.kind === 'network' ? t('photo.network') : err.msg}</Notice>
        <div class="row">
          {err.kind !== 'no_key' && <button class="btn btn--secondary btn--sm" onClick={run}><RefreshCw size={16} />{t('common.retry')}</button>}
          {err.kind === 'no_key' && <a class="btn btn--secondary btn--sm" href="#/settings"><KeyRound size={16} />{t('photo.open_settings')}</a>}
        </div>
      </div>}

      {stage === 'done' && res.map(s => (
        <section class="card stack">
          <div class="between"><h2 style={{ fontSize: 'var(--fs-17)' }}>{s.name}</h2>{s.prepMinutes > 0 && <span class="pill"><Clock size={14} />{s.prepMinutes} {t('ideas.min')}</span>}</div>
          {s.description && <p class="muted">{s.description}</p>}
          <div class="nutri-grid">
            <div><b class="num">{fmt(s.macros.kcal)}</b><small>kcal</small></div><div><b class="num">{fmt(s.macros.protein)}g</b><small>{t('m.protein')}</small></div>
            <div><b class="num">{fmt(s.macros.carbs)}g</b><small>{t('m.carbs')}</small></div><div><b class="num">{fmt(s.macros.fat)}g</b><small>{t('m.fat')}</small></div>
          </div>
          {s.ingredients.length > 0 && <ul class="small muted" style={{ margin: 0, paddingLeft: 'var(--s-4)' }}>{s.ingredients.map(i => <li>{i.name}{i.grams ? ` · ${fmt(i.grams)} g` : ''}</li>)}</ul>}
          <button class="btn btn--secondary btn--block" onClick={() => log(s)}><Plus size={16} />{t('ideas.log')}</button>
        </section>))}
      {stage === 'done' && <span class="field__hint">{t('ideas.disclaimer')}</span>}
    </main>
  );
}
