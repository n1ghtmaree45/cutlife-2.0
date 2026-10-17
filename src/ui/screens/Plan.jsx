import { useEffect, useRef, useState } from 'preact/hooks';
import { RefreshCw, Plus, Sparkles, KeyRound, Shuffle, ArrowLeft } from 'lucide-preact';
import { Notice, Toggle, Segmented, fmt } from '../components/ui.jsx';
import { getSettings, aiPlanMeals, AiError, addEntry, todayKey } from '../services/index.js';
import { generatePlan, excludedTags, templateAllowed, PlanError, SLOTS, BUILTIN_TEMPLATES } from '../../lib/mealplan';
import { SEED_FOODS, SEED_IDS } from '../../data/seedFoods';
import { t, getLang } from '../../i18n';
import { haptic } from '../../lib/haptics';

const PLAN_KEY = 'ct.plan.v1', OPT_KEY = 'ct.plan.opts';
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };
const slotLabel = s => t(`plan.slot.${s}`);

export function Plan({ profile, toast }) {
  const [opts, setOpts] = useState(() => load(OPT_KEY, {}));
  const [plan, setPlan] = useState(() => load(PLAN_KEY, null));
  const [di, setDi] = useState(0);
  const [stage, setStage] = useState('idle'); // idle | working | error
  const [err, setErr] = useState(null);
  const [online, setOnline] = useState(navigator.onLine !== false);
  const ac = useRef(null);
  useEffect(() => { const on = () => setOnline(true), off = () => setOnline(false); addEventListener('online', on); addEventListener('offline', off); return () => { removeEventListener('online', on); removeEventListener('offline', off); ac.current?.abort(); }; }, []);

  const lang = getLang();
  const nm = o => o[lang] || o.en;
  const targets = profile.targets;
  const stale = plan && Math.abs(plan.targets.kcal - targets.kcal) > targets.kcal * 0.02;
  const setOpt = k => v => { const n = { ...opts, [k]: v }; setOpts(n); save(OPT_KEY, n); };
  const done = p => { setPlan(p); save(PLAN_KEY, p); setDi(0); setStage('idle'); setErr(null); haptic(15); };
  const fail = e => { if (ac.current?.signal.aborted) return; setErr(e instanceof PlanError ? { kind: e.kind } : e instanceof AiError ? { kind: e.kind, msg: e.message } : { kind: 'provider', msg: String(e?.message || e) }); setStage('error'); };

  const makeOffline = () => { try { done(generatePlan(targets, { restrictions: opts })); } catch (e) { fail(e); } };
  const makeAi = async () => {
    setStage('working'); setErr(null); ac.current?.abort(); ac.current = new AbortController();
    try {
      const ex = excludedTags(opts); const s = await getSettings();
      const foods = SEED_IDS.filter(id => !SEED_FOODS[id].tags.some(g => ex.has(g))).map(id => ({ id, name: SEED_FOODS[id].name.en }));
      const ideas = await aiPlanMeals({ foods, preferences: s.preferences?.trim() || undefined, allergies: s.allergies?.trim() || undefined, lang }, { signal: ac.current.signal });
      const extra = ideas.meals.map((m, i) => ({ id: `ai-${i}`, slot: m.slot, name: { en: m.name, el: m.name }, ai: true, items: m.items.map(x => ({ food: x.food, g: x.grams })) }));
      done(generatePlan(targets, { restrictions: opts, extraTemplates: extra }));
    } catch (e) { fail(e); }
  };

  const log = async m => {
    const grams = Math.round(m.items.reduce((a, i) => a + i.grams, 0));
    await addEntry({ meal: m.slot, name: nm(m.name), grams, kcal: Math.round(m.macros.kcal), protein: m.macros.protein, carbs: m.macros.carbs, fat: m.macros.fat, source: m.ai ? 'ai' : 'quick', date: todayKey() });
    haptic(15); toast(t('ideas.logged', { name: nm(m.name) }));
  };

  const day = plan?.days[di];
  const dayLabel = i => { const d = new Date(plan.createdAt); d.setDate(d.getDate() + i); return d.toLocaleDateString(lang === 'el' ? 'el-GR' : 'en-GB', { weekday: 'short' }); };
  const diff = day ? day.kcalDiffPct : 0;

  return (
    <main class="page">
      <div class="topbar"><a class="btn btn--ghost btn--sm" href="#/ideas" aria-label={t('common.back')}><ArrowLeft size={18} /></a><div class="topbar__title">{t('plan.title')}</div></div>

      <section class="card stack stack--sm">
        <span class="eyebrow">{t('plan.target')}</span>
        <div class="nutri-grid">
          <div><b class="num">{fmt(targets.kcal)}</b><small>kcal</small></div><div><b class="num">{fmt(targets.protein)}g</b><small>{t('m.protein')}</small></div>
          <div><b class="num">{fmt(targets.carbs)}g</b><small>{t('m.carbs')}</small></div><div><b class="num">{fmt(targets.fat)}g</b><small>{t('m.fat')}</small></div>
        </div>
      </section>

      <section class="card stack stack--sm">
        <span class="eyebrow">{t('plan.restrict')}</span>
        <Toggle label={t('plan.r.veg')} checked={!!opts.vegetarian} onChange={setOpt('vegetarian')} />
        <Toggle label={t('plan.r.fish')} checked={!!opts.noFish} onChange={setOpt('noFish')} disabled={!!opts.vegetarian} />
        <Toggle label={t('plan.r.dairy')} checked={!!opts.noDairy} onChange={setOpt('noDairy')} />
        <Toggle label={t('plan.r.egg')} checked={!!opts.noEgg} onChange={setOpt('noEgg')} />
        <Toggle label={t('plan.r.nuts')} checked={!!opts.noNuts} onChange={setOpt('noNuts')} />
        <Toggle label={t('plan.r.gluten')} checked={!!opts.noGluten} onChange={setOpt('noGluten')} />
        <Toggle label={t('plan.r.soy')} checked={!!opts.noSoy} onChange={setOpt('noSoy')} />
        <span class="field__hint">{t('plan.allergy_note')}</span>
      </section>

      <div class="stack stack--sm">
        <button class="btn btn--primary btn--block" disabled={stage === 'working'} onClick={makeOffline}><Shuffle size={18} />{plan ? t('plan.again') : t('plan.go')}</button>
        <button class="btn btn--secondary btn--block" disabled={!online || stage === 'working'} onClick={makeAi}><Sparkles size={18} />{stage === 'working' ? t('ideas.working') : t('plan.go_ai')}</button>
        {!online && <span class="field__hint">{t('plan.ai_offline')}</span>}
      </div>

      {stage === 'error' && <div class="stack stack--sm">
        <Notice>{err.kind === 'no_options' ? t('plan.err_none') : err.kind === 'infeasible' ? t('plan.err_infeasible') : err.kind === 'no_key' ? t('photo.no_key') : err.kind === 'rate_limited' ? t('photo.rate_limited') : err.kind === 'invalid_json' ? t('ideas.invalid') : err.kind === 'network' ? t('photo.network') : err.msg}</Notice>
        {err.kind === 'no_key' && <a class="btn btn--secondary btn--sm" href="#/settings"><KeyRound size={16} />{t('photo.open_settings')}</a>}
      </div>}

      {stale && <Notice info>{t('plan.stale')}</Notice>}

      {plan && day && <>
        <Segmented label={t('plan.title')} value={di} onChange={setDi} options={plan.days.map((_, i) => ({ value: i, label: dayLabel(i) }))} />
        <section class="card stack stack--sm">
          <div class="between"><span class="eyebrow">{t('plan.day_total')}</span><span class="pill">{diff > 0 ? '+' : ''}{String(diff).replace('.', lang === 'el' ? ',' : '.')}% kcal</span></div>
          <div class="nutri-grid">
            <div><b class="num">{fmt(day.totals.kcal)}</b><small>kcal</small></div><div><b class="num">{fmt(day.totals.protein)}g</b><small>{t('m.protein')}</small></div>
            <div><b class="num">{fmt(day.totals.carbs)}g</b><small>{t('m.carbs')}</small></div><div><b class="num">{fmt(day.totals.fat)}g</b><small>{t('m.fat')}</small></div>
          </div>
          {day.warnings.includes('protein_low') && <span class="field__hint">{t('plan.warn_protein')}</span>}
          {day.warnings.includes('kcal_off') && <span class="field__hint">{t('plan.warn_kcal')}</span>}
        </section>
        {day.meals.map(m => (
          <section class="card stack">
            <div class="between"><span class="eyebrow">{slotLabel(m.slot)}</span>{m.ai && <span class="pill"><Sparkles size={14} />AI</span>}</div>
            <h2 style={{ fontSize: 'var(--fs-17)' }}>{nm(m.name)}</h2>
            <ul class="small muted" style={{ margin: 0, paddingLeft: 'var(--s-4)' }}>{m.items.map(i => <li>{nm(SEED_FOODS[i.food]?.name || { en: i.food })} · {fmt(i.grams)} g</li>)}</ul>
            <div class="nutri-grid">
              <div><b class="num">{fmt(m.macros.kcal)}</b><small>kcal</small></div><div><b class="num">{fmt(m.macros.protein)}g</b><small>{t('m.protein')}</small></div>
              <div><b class="num">{fmt(m.macros.carbs)}g</b><small>{t('m.carbs')}</small></div><div><b class="num">{fmt(m.macros.fat)}g</b><small>{t('m.fat')}</small></div>
            </div>
            <button class="btn btn--secondary btn--block" onClick={() => log(m)}><Plus size={16} />{t('ideas.log')}</button>
          </section>))}
        <span class="field__hint">{t('plan.disclaimer')}</span>
      </>}
    </main>
  );
}
