import { useEffect, useRef, useState } from 'preact/hooks';
import { Trash2, Camera, Image as ImageIcon, Lock, TrendingDown, TrendingUp, Check } from 'lucide-preact';
import { Segmented, NumberField, LineChart, Sheet, Notice, Banner, fmt } from '../components/ui.jsx';
import { listWeights, saveWeight, removeWeight, getSettings, weightInsights, applyAdjustment, dismissAdjustment, movingAverage7, todayKey, dispWeight, parseWeight, wUnit, lUnit, dispLen, parseLen, round,
  listMeasurements, addMeasurement, deleteMeasurement, listPhotos, addPhoto, deletePhoto, storageEstimate, resizeImage } from '../services/index.js';
import { t, num, dateLabel } from '../../i18n';
import { haptic } from '../../lib/haptics';

export function Weight({ profile, reloadProfile, toast, focusAdd }) {
  const [tab, setTab] = useState('weight');
  const [weights, setWeights] = useState(null);
  const [settings, setSettings] = useState(null);
  const load = async () => { const [w, s] = await Promise.all([listWeights(), getSettings()]); setWeights(w); setSettings(s); };
  useEffect(() => { load(); }, []);
  if (!weights) return <main class="page" />;
  const units = settings.units || 'kg';
  return (
    <main class="page">
      <div class="topbar"><div class="topbar__title">{t('weight.title')}</div></div>
      <Segmented label={t('weight.title')} value={tab} onChange={setTab} options={[{ value: 'weight', label: t('weight.tab') }, { value: 'body', label: t('body.tab') }]} />
      {tab === 'weight' ? <WeightTab {...{ profile, weights, settings, units, toast, reload: load, reloadProfile, focusAdd }} /> : <BodyTab units={units} toast={toast} />}
    </main>
  );
}

function WeightTab({ profile, weights, settings, units, toast, reload, reloadProfile, focusAdd }) {
  const today = todayKey();
  const latest = weights.length ? weights[weights.length - 1].kg : profile.weightKg;
  const [date, setDate] = useState(today);
  const existing = weights.find(w => w.date === date);
  const [val, setVal] = useState(round(dispWeight(existing?.kg ?? latest, units), 1));
  const inputWrap = useRef(null);
  useEffect(() => { setVal(round(dispWeight((weights.find(w => w.date === date) ?? { kg: latest }).kg, units), 1)); }, [date]);
  useEffect(() => { if (focusAdd) inputWrap.current?.querySelector('input')?.focus(); }, []);
  const kg = val === '' ? NaN : parseWeight(val, units);
  const ok = Number.isFinite(kg) && kg >= 20 && kg <= 400 && date <= today;
  const ins = weightInsights(profile, weights, settings);
  const ma = movingAverage7(weights);
  const shown = weights.slice(-120).map(w => ({ date: w.date, y: round(dispWeight(w.kg, units), 2) }));
  const maShown = ma.slice(-120).map(m => ({ date: m.date, y: round(dispWeight(m.avg, units), 2) }));
  const first = weights[0]?.kg ?? latest, change = latest - first;
  const sgn = n => (n > 0 ? '+' : '');
  const save = async () => { await saveWeight(date, round(kg, 2)); haptic(15); toast(t('weight.saved')); await reload(); await reloadProfile(); };
  const adj = ins.adjustment;

  return (
    <div class="stack">
      <section class="card stack">
        <div ref={inputWrap}><NumberField label={existing ? t('weight.update_for', { d: dateLabel(date, { day: 'numeric', month: 'short' }) }) : t('weight.weigh_in')} value={val} unit={wUnit(units)} onInput={setVal} /></div>
        <label class="field"><span class="field__label">{t('weight.date')}</span><span class="input-wrap"><input type="date" max={today} value={date} onInput={e => e.currentTarget.value && setDate(e.currentTarget.value)} /></span></label>
        <button class="btn btn--primary btn--block" disabled={!ok} onClick={save}><Check size={18} />{existing ? t('weight.update') : t('weight.save')}</button>
      </section>

      {ins.suggest && <section class="card stack">
        <div class="hstack">{adj.reason === 'too_slow' ? <TrendingUp size={20} style={{ color: 'var(--warn)' }} /> : <TrendingDown size={20} style={{ color: 'var(--warn)' }} />}<h2 style={{ fontSize: 'var(--fs-17)' }}>{t('adj.title')}</h2></div>
        <p class="muted">{adj.reason === 'too_slow' ? t('adj.slow', { rate: num(Math.abs(dispWeight(ins.rate, units)), 2), exp: num(Math.abs(dispWeight(ins.expectedWeeklyKg, units)), 2), u: wUnit(units) }) : t('adj.fast', { rate: num(Math.abs(dispWeight(ins.rate, units)), 2), exp: num(Math.abs(dispWeight(ins.expectedWeeklyKg, units)), 2), u: wUnit(units) })}</p>
        <div class="stat"><span class="stat__k">{t('adj.new_target')}</span><span class="stat__v num">{fmt(profile.targets.kcal)} → {fmt(adj.newKcal)} kcal ({sgn(adj.deltaKcal)}{fmt(adj.deltaKcal)})</span></div>
        <div class="row">
          <button class="btn btn--secondary btn--sm" onClick={async () => { await dismissAdjustment(); await reload(); toast(t('adj.kept')); }}>{t('adj.keep')}</button>
          <button class="btn btn--primary btn--sm" onClick={async () => { await applyAdjustment(adj.newKcal); haptic(15); await reload(); await reloadProfile(); toast(t('adj.applied')); }}>{t('adj.apply')}</button>
        </div>
        <span class="field__hint">{t('adj.note')}</span>
      </section>}

      <section class="card stack">
        {weights.length >= 2 ? <>
          <LineChart label={t('weight.chart')} goal={round(dispWeight(profile.goalWeightKg, units), 2)} series={[{ kind: 'dots', points: shown }, { kind: 'line', points: maShown }]} />
          <div class="legend"><span><i style={{ background: 'var(--text-3)' }} />{t('weight.raw')}</span><span><i style={{ background: 'var(--accent)' }} />{t('weight.avg7')}</span><span>- - {t('weight.goal')}</span></div>
        </> : <p class="muted">{t('weight.need_more')}</p>}
        <div class="kpis">
          <div class="kpi"><b class="num">{num(dispWeight(latest, units), 1)}</b><small>{t('weight.current')} · {wUnit(units)}</small></div>
          <div class="kpi"><b class="num">{weights.length > 1 ? `${sgn(change)}${num(dispWeight(change, units), 1)}` : '–'}</b><small>{t('weight.change')} · {wUnit(units)}</small></div>
          <div class="kpi"><b class="num">{ins.rate == null ? '–' : `${sgn(ins.rate)}${num(dispWeight(ins.rate, units), 2)}`}</b><small>{wUnit(units)} / {t('common.week')}</small></div>
        </div>
        <div class="stat"><span class="stat__k">{t('weight.to_goal')}</span><span class="stat__v num">{num(Math.abs(dispWeight(latest - profile.goalWeightKg, units)), 1)} {wUnit(units)}</span></div>
        <div class="stat"><span class="stat__k">{t('weight.eta')}</span><span class="stat__v num">{ins.eta ? dateLabel(ins.eta, { day: 'numeric', month: 'short', year: 'numeric' }) : '–'}</span></div>
        {ins.rate == null && weights.length >= 1 && <span class="field__hint">{t('weight.rate_hint')}</span>}
      </section>

      {weights.length > 0 && <>
        <h2 class="h-section">{t('weight.history')}</h2>
        <div class="card card--flush"><ul class="list">{[...weights].reverse().slice(0, 30).map(w => (
          <li class="list-item"><div class="list-item__body"><div class="list-item__title num">{num(dispWeight(w.kg, units), 1)} {wUnit(units)}</div><div class="list-item__sub">{dateLabel(w.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</div></div>
            <button class="icon-btn" aria-label={t('common.delete')} onClick={async () => { await removeWeight(w.date); haptic(15); await reload(); await reloadProfile(); }}><Trash2 size={18} /></button></li>))}</ul></div>
      </>}
    </div>
  );
}

const FIELDS = [['waistCm', 'body.waist'], ['chestCm', 'body.chest'], ['hipsCm', 'body.hips'], ['armCm', 'body.arm'], ['thighCm', 'body.thigh']];

function BodyTab({ units, toast }) {
  const [ms, setMs] = useState([]); const [photos, setPhotos] = useState([]); const [urls, setUrls] = useState({});
  const [vals, setVals] = useState({}); const [date, setDate] = useState(todayKey());
  const [view, setView] = useState(null); const [est, setEst] = useState(null); const [quota, setQuota] = useState(false);
  const cam = useRef(null); const gal = useRef(null);
  const load = async () => {
    const [m, p, e] = await Promise.all([listMeasurements(), listPhotos(), storageEstimate()]);
    setMs(m); setPhotos(p); setEst(e);
    setUrls(prev => { Object.values(prev).forEach(URL.revokeObjectURL); return Object.fromEntries(p.map(x => [x.id, URL.createObjectURL(x.blob)])); });
  };
  useEffect(() => { load(); return () => setUrls(prev => { Object.values(prev).forEach(URL.revokeObjectURL); return {}; }); }, []);
  const u = lUnit(units);
  const any = FIELDS.some(([k]) => vals[k] !== undefined && vals[k] !== '' && vals[k] > 0);
  const save = async () => {
    const m = { date }; for (const [k] of FIELDS) if (vals[k] !== undefined && vals[k] !== '' && vals[k] > 0) m[k] = round(parseLen(vals[k], units), 1);
    await addMeasurement(m); haptic(15); setVals({}); toast(t('body.saved')); load();
  };
  const onPhoto = async e => {
    const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (!f) return;
    let blob; try { blob = await resizeImage(f, 1600, 0.8); } catch { toast(t('photo.bad_image')); return; }
    const r = await addPhoto(todayKey(), blob);
    if (!r.ok) { setQuota(true); return; } setQuota(false); haptic(15); toast(t('body.photo_saved')); load();
  };
  const waist = ms.filter(m => m.waistCm != null).map(m => ({ date: m.date, y: round(dispLen(m.waistCm, units), 1) }));
  const mb = n => num(n / 1048576, n > 1e9 ? 0 : 1);
  return (
    <div class="stack">
      <section class="card stack">
        <h2 style={{ fontSize: 'var(--fs-17)' }}>{t('body.measure')}</h2>
        <div class="row">{FIELDS.slice(0, 2).map(([k, l]) => <NumberField label={t(l)} unit={u} value={vals[k] ?? ''} onInput={v => setVals({ ...vals, [k]: v })} />)}</div>
        <div class="row">{FIELDS.slice(2, 4).map(([k, l]) => <NumberField label={t(l)} unit={u} value={vals[k] ?? ''} onInput={v => setVals({ ...vals, [k]: v })} />)}</div>
        <div class="row"><NumberField label={t(FIELDS[4][1])} unit={u} value={vals.thighCm ?? ''} onInput={v => setVals({ ...vals, thighCm: v })} />
          <label class="field"><span class="field__label">{t('weight.date')}</span><span class="input-wrap"><input type="date" max={todayKey()} value={date} onInput={e => e.currentTarget.value && setDate(e.currentTarget.value)} /></span></label></div>
        <button class="btn btn--primary btn--block" disabled={!any} onClick={save}>{t('common.save')}</button>
      </section>

      {waist.length >= 1 && <section class="card stack">
        <h2 style={{ fontSize: 'var(--fs-17)' }}>{t('body.waist_trend')}</h2>
        {waist.length >= 2 ? <LineChart label={t('body.waist_trend')} series={[{ kind: 'line', points: waist }, { kind: 'dots', points: waist }]} fmtY={n => num(n, 0)} height={150} /> : <p class="muted small">{t('body.need_two')}</p>}
      </section>}

      {ms.length > 0 && <div class="card card--flush"><ul class="list">{[...ms].reverse().slice(0, 12).map(m => (
        <li class="list-item"><div class="list-item__body"><div class="list-item__title">{dateLabel(m.date, { day: 'numeric', month: 'short', year: 'numeric' })}</div>
          <div class="list-item__sub num">{FIELDS.filter(([k]) => m[k] != null).map(([k, l]) => `${t(l)} ${num(dispLen(m[k], units), 1)}${u}`).join(' · ')}</div></div>
          <button class="icon-btn" aria-label={t('common.delete')} onClick={async () => { await deleteMeasurement(m.id); load(); }}><Trash2 size={18} /></button></li>))}</ul></div>}

      <section class="card stack">
        <div class="hstack"><Lock size={18} style={{ color: 'var(--accent)' }} /><h2 style={{ fontSize: 'var(--fs-17)' }}>{t('body.photos')}</h2></div>
        <p class="muted small">{t('body.photos_note')}</p>
        <div class="row">
          <button class="btn btn--secondary btn--sm" onClick={() => cam.current.click()}><Camera size={16} />{t('photo.take')}</button>
          <button class="btn btn--secondary btn--sm" onClick={() => gal.current.click()}><ImageIcon size={16} />{t('photo.choose')}</button>
        </div>
        <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />
        <input ref={gal} type="file" accept="image/*" hidden onChange={onPhoto} />
        {quota && <Notice>{t('body.quota')}</Notice>}
        {photos.length > 0 && <div class="photo-grid">{photos.map(p => <button onClick={() => setView(p)} aria-label={dateLabel(p.date)}><img src={urls[p.id]} alt="" loading="lazy" /><span class="num">{dateLabel(p.date, { day: 'numeric', month: 'short' })}</span></button>)}</div>}
        {est && est.quota > 0 && <span class="field__hint num">{t('body.storage', { used: mb(est.usage), quota: mb(est.quota) })}</span>}
      </section>

      {view && <Sheet title={dateLabel(view.date, { day: 'numeric', month: 'long', year: 'numeric' })} onClose={() => setView(null)}>
        <img class="photo-full" src={urls[view.id]} alt="" />
        <button class="btn btn--danger btn--block" onClick={async () => { await deletePhoto(view.id); haptic([20, 40, 20]); setView(null); toast(t('common.deleted')); load(); }}><Trash2 size={16} />{t('common.delete')}</button>
      </Sheet>}
    </div>
  );
}
