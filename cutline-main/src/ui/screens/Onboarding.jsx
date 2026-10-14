import { useState, useMemo } from 'preact/hooks';
import { ChevronLeft, ArrowRight } from 'lucide-preact';
import { Segmented, NumberField, Option, Notice, fmt } from '../components/ui.jsx';
import { calcTargets, saveProfile, dispWeight, parseWeight, wUnit, round } from '../services/index.js';
import { t, num } from '../../i18n';
import { haptic } from '../../lib/haptics';

const ACTIVITY = () => [
  { v: 1.2, t: t('act.sed'), s: t('act.sed.s') }, { v: 1.375, t: t('act.light'), s: t('act.light.s') },
  { v: 1.55, t: t('act.mod'), s: t('act.mod.s') }, { v: 1.725, t: t('act.very'), s: t('act.very.s') },
];
const PACE = () => [
  { v: 15, t: t('pace.gentle'), s: t('pace.gentle.s') }, { v: 20, t: t('pace.steady'), s: t('pace.steady.s') }, { v: 25, t: t('pace.aggr'), s: t('pace.aggr.s') },
];

export function Onboarding({ onDone, initialStep = 0, existing }) {
  const editing = !!existing;
  const [step, setStep] = useState(editing && initialStep === 0 ? 1 : initialStep);
  const [p, setP] = useState(existing
    ? { sex: existing.sex, age: existing.age, heightCm: existing.heightCm, weightKg: existing.weightKg, goalWeightKg: existing.goalWeightKg, activity: existing.activity, deficitPct: existing.deficitPct, units: existing.units || 'kg' }
    : { sex: 'male', age: 34, heightCm: 178, weightKg: 88, goalWeightKg: 80, activity: 1.375, deficitPct: 20, units: 'kg' });
  const set = k => v => setP({ ...p, [k]: v });
  const setW = k => v => setP({ ...p, [k]: v === '' ? '' : round(parseWeight(v, p.units), 3) });
  const valid = p.age >= 14 && p.heightCm >= 120 && p.weightKg >= 35 && p.goalWeightKg >= 35;
  const tg = useMemo(() => valid ? calcTargets(p) : null, [p]);
  const total = 4;
  const next = () => { haptic(8); setStep(step + 1); };
  const u = wUnit(p.units);

  if (step === 0) return (
    <main class="page page--flow">
      <div class="hero" style={{ paddingTop: 'var(--s-12)' }}>
        <span class="eyebrow">{t('onb.welcome')}</span>
        <h1>{t('onb.h1')}</h1>
        <p>{t('onb.p')}</p>
      </div>
      <div class="card stat-list">
        <div class="stat"><span class="stat__k">{t('onb.takes')}</span><span class="stat__v">{t('onb.takes.v')}</span></div>
        <div class="stat"><span class="stat__k">{t('onb.data')}</span><span class="stat__v">{t('onb.data.v')}</span></div>
        <div class="stat"><span class="stat__k">{t('onb.account')}</span><span class="stat__v">{t('onb.account.v')}</span></div>
      </div>
      <div class="spacer" />
      <button class="btn btn--primary btn--block" onClick={next}>{t('onb.start')} <ArrowRight size={18} /></button>
    </main>
  );

  return (
    <main class="page page--flow">
      <div class="topbar">
        <button class="icon-btn" aria-label={t('common.back')} onClick={() => (editing && step === 1 ? history.back() : setStep(step - 1))} style={{ marginLeft: -10 }}><ChevronLeft size={24} /></button>
        <span class="eyebrow num">{t('onb.step', { n: step, total })}</span>
        <span style={{ width: 44 }} />
      </div>
      <div class="progress-dots">{Array.from({ length: total }, (_, i) => <span class={i < step ? 'on' : ''} />)}</div>

      {step === 1 && <>
        <div class="hero" style={{ paddingTop: 'var(--s-4)' }}><h1>{t('onb.about')}</h1><p>{t('onb.about.p')}</p></div>
        <div class="field"><span class="field__label">{t('onb.sex')}</span>
          <Segmented label={t('onb.sex')} value={p.sex} onChange={set('sex')} options={[{ value: 'male', label: t('onb.male') }, { value: 'female', label: t('onb.female') }]} /></div>
        <div class="field"><span class="field__label">{t('set.units')}</span>
          <Segmented label={t('set.units')} value={p.units} onChange={set('units')} options={[{ value: 'kg', label: 'kg · cm' }, { value: 'lb', label: 'lb · in' }]} /></div>
        <NumberField label={t('onb.age')} value={p.age} unit={t('onb.years')} decimals={0} onInput={set('age')} />
        <div class="row">
          <NumberField label={t('onb.height')} value={p.heightCm} unit="cm" onInput={set('heightCm')} />
          <NumberField label={t('onb.weight')} value={p.weightKg === '' ? '' : round(dispWeight(p.weightKg, p.units), 1)} unit={u} onInput={setW('weightKg')} />
        </div>
      </>}

      {step === 2 && <>
        <div class="hero" style={{ paddingTop: 'var(--s-4)' }}><h1>{t('onb.activity')}</h1><p>{t('onb.activity.p')}</p></div>
        <div class="option-list">{ACTIVITY().map(a => <Option title={a.t} sub={a.s} selected={p.activity === a.v} onClick={() => set('activity')(a.v)} />)}</div>
      </>}

      {step === 3 && <>
        <div class="hero" style={{ paddingTop: 'var(--s-4)' }}><h1>{t('onb.goal')}</h1><p>{t('onb.goal.p')}</p></div>
        <NumberField label={t('onb.goalw')} value={p.goalWeightKg === '' ? '' : round(dispWeight(p.goalWeightKg, p.units), 1)} unit={u} onInput={setW('goalWeightKg')} />
        <div class="field"><span class="field__label">{t('onb.pace')}</span>
          <div class="option-list">{PACE().map(a => <Option title={a.t} sub={a.s} selected={p.deficitPct === a.v} onClick={() => set('deficitPct')(a.v)} />)}</div></div>
        {tg?.warnings.map(w => <Notice>{w}</Notice>)}
      </>}

      {step === 4 && tg && <>
        <div class="hero" style={{ paddingTop: 'var(--s-4)' }}><h1>{t('onb.target')}</h1><p>{t('onb.target.p')}</p></div>
        <div class="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          <div><span class="target-big num">{fmt(tg.kcal)}</span> <span class="eyebrow">{t('onb.kcalday')}</span></div>
          <div class="nutri-grid">
            <div><b class="num">{tg.protein}g</b><small>{t('m.protein')}</small></div>
            <div><b class="num">{tg.carbs}g</b><small>{t('m.carbs')}</small></div>
            <div><b class="num">{tg.fat}g</b><small>{t('m.fat')}</small></div>
            <div><b class="num">{num(p.units === 'lb' ? dispWeight(tg.weeklyLossKg, 'lb') : tg.weeklyLossKg, 2)}</b><small>{u} / {t('common.week')}</small></div>
          </div>
        </div>
        <div class="card stat-list">
          <div class="stat"><span class="stat__k">{t('onb.bmr')}</span><span class="stat__v num">{fmt(tg.bmr)} kcal</span></div>
          <div class="stat"><span class="stat__k">{t('onb.tdee')}</span><span class="stat__v num">{fmt(tg.tdee)} kcal</span></div>
          <div class="stat"><span class="stat__k">{t('onb.deficit')}</span><span class="stat__v num">{fmt(tg.tdee - tg.kcal)} kcal</span></div>
        </div>
        {tg.warnings.map(w => <Notice>{w}</Notice>)}
      </>}

      <div class="spacer" />
      {step < total
        ? <button class="btn btn--primary btn--block" disabled={!valid} onClick={next}>{t('common.continue')}</button>
        : <button class="btn btn--primary btn--block" onClick={async () => { haptic(15); await saveProfile(p); onDone(); }}>{editing ? t('onb.save') : t('onb.begin')}</button>}
    </main>
  );
}
