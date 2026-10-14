import { useEffect, useState } from 'preact/hooks';
import { Plus, Moon, Sun, ChevronLeft, ChevronRight, Droplets, Undo2, Flame, MoreHorizontal, Footprints, Timer, ShieldAlert, Copy, BookmarkPlus, ListPlus, Trash2 } from 'lucide-preact';
import { Ring, MacroBar, Sheet, Banner, NumberField, TextField, Segmented, fmt, fmt1 } from '../components/ui.jsx';
import { getDay, getRecentFoods, addEntry, getInsights, calcTargets, addWater, undoWater, setActivityDay, clearActivityDay, dayTargetKcal, activityBonus, waterTotal,
  updateEntryGrams, deleteEntry, copyEntries, listTemplates, saveTemplate, applyTemplate, deleteTemplate, saveSettings, todayKey, addDays, backupDue, hasAnyData, dispWeight, wUnit, DEFAULT_WATER_GOAL_ML } from '../services/index.js';
import { t, num, dateLabel } from '../../i18n';
import { haptic } from '../../lib/haptics';
import { fastElapsedMs, fastProgress, formatHMS } from '../../lib/stats';

export const MEALS = () => [['breakfast', t('meal.breakfast')], ['lunch', t('meal.lunch')], ['dinner', t('meal.dinner')], ['snack', t('meal.snack')]];
const sum = (xs, k) => xs.reduce((a, x) => a + (x[k] || 0), 0);
const defaultMeal = () => { const h = new Date().getHours(); return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 21 ? 'dinner' : 'snack'; };

export function Dashboard({ profile, dark, toggleTheme, toast, date: dateParam }) {
  const today = todayKey();
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && dateParam <= today ? dateParam : today;
  const isToday = date === today;
  const [day, setDay] = useState(null);
  const [recent, setRecent] = useState([]);
  const [ins, setIns] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [showBackup, setShowBackup] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = async () => { const [d, r, i] = await Promise.all([getDay(date), getRecentFoods(), isToday ? getInsights(profile) : null]); setDay(d); setRecent(r); setIns(i); };
  useEffect(() => { load(); }, [date]);
  useEffect(() => { (async () => { if (!isToday) return; const s = (await getDay(date)).settings; setShowBackup(backupDue(s) && await hasAnyData()); })(); }, [date]);
  const fast = day?.settings.fasting;
  useEffect(() => { if (!(fast?.enabled && fast.startedAt && isToday)) return; const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, [fast?.enabled, fast?.startedAt, isToday]);
  if (!day) return <main class="page" />;

  const { entries, taps, activity, waterGoal, settings } = day;
  const units = settings.units || 'kg';
  const baseKcal = profile.targets.kcal, target = dayTargetKcal(baseKcal, activity), bonus = activityBonus(activity);
  const tg = { kcal: target, protein: profile.targets.protein, carbs: profile.targets.carbs, fat: profile.targets.fat };
  const tot = { kcal: sum(entries, 'kcal'), protein: sum(entries, 'protein'), carbs: sum(entries, 'carbs'), fat: sum(entries, 'fat') };
  const go = d => { location.hash = d === today ? '#/' : `#/?d=${d}`; };
  const close = () => setSheet(null);
  const done = async m => { if (m) toast(m); close(); await load(); };

  const quickAdd = async r => {
    await addEntry({ name: r.name, grams: r.grams, kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, source: r.source, foodId: r.foodId, meal: isToday ? defaultMeal() : 'snack', date });
    haptic(15); toast(t('dash.added', { name: r.name.split(',')[0] })); load();
  };
  const copyDay = async (from, to) => {
    const src = await getDay(from); if (!src.entries.length) return toast(t('dash.nothing_to_copy'));
    await copyEntries(src.entries, to); haptic(15); toast(t('dash.copied', { n: src.entries.length })); if (to !== date) go(to); else load();
  };
  const water = async ml => { await addWater(date, ml); haptic(12); load(); };
  const wTotal = waterTotal(taps), wPct = Math.min(1, wTotal / waterGoal), wC = 2 * Math.PI * 24;

  return (
    <main class="page">
      <div class="topbar">
        <div><div class="eyebrow">{dateLabel(date)}</div><div class="topbar__title">{isToday ? t('dash.today') : dateLabel(date, { day: 'numeric', month: 'long' })}</div></div>
        <div class="hstack" style={{ gap: 0 }}>
          <button class="icon-btn" aria-label={t('dash.prev')} onClick={() => go(addDays(date, -1))}><ChevronLeft size={22} /></button>
          <button class="icon-btn" aria-label={t('dash.next')} disabled={isToday} style={{ opacity: isToday ? .3 : 1 }} onClick={() => go(addDays(date, 1))}><ChevronRight size={22} /></button>
          <button class="icon-btn" aria-label={t('dash.theme')} onClick={toggleTheme}>{dark ? <Sun size={20} /> : <Moon size={20} />}</button>
        </div>
      </div>

      {!isToday && <Banner icon={<ChevronLeft size={16} />} action={t('dash.copy_day_today')} onAction={() => copyDay(date, today)}>{t('dash.viewing_past')}</Banner>}
      {isToday && showBackup && <Banner icon={<ShieldAlert size={16} />} action={t('dash.backup_now')} onAction={() => { location.hash = '#/settings'; }} onDismiss={() => setShowBackup(false)}>{t('dash.backup_due')}</Banner>}

      <section class="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}>
        <div class="summary">
          <Ring consumed={tot.kcal} target={tg.kcal} />
          <div class="stat-list">
            <div class="stat"><span class="stat__k">{t('dash.target')}</span><span class="stat__v num">{fmt(tg.kcal)}</span></div>
            {bonus > 0 && <div class="stat"><span class="stat__k">{t('dash.activity_bonus')}</span><span class="stat__v num">+{fmt(bonus)}</span></div>}
            <div class="stat"><span class="stat__k">{t('dash.eaten')}</span><span class="stat__v num">{fmt(tot.kcal)}</span></div>
            <div class="stat"><span class="stat__k">{t('dash.protein_left')}</span><span class="stat__v num">{fmt(Math.max(0, tg.protein - tot.protein))} g</span></div>
          </div>
        </div>
        <div class="macros">
          <MacroBar name={t('m.protein')} value={tot.protein} target={tg.protein} color="var(--m-protein)" />
          <MacroBar name={t('m.carbs')} value={tot.carbs} target={tg.carbs} color="var(--m-carbs)" />
          <MacroBar name={t('m.fat')} value={tot.fat} target={tg.fat} color="var(--m-fat)" />
        </div>
      </section>

      {isToday && ins && <div class="hstack" style={{ flexWrap: 'wrap', gap: 'var(--s-2)' }}>
        <span class="pill"><Flame size={14} />{ins.streak > 0 ? t('dash.streak', { n: ins.streak }) : t('dash.streak0')}</span>
        {bonus === 0 && <button class="chip" onClick={() => setSheet({ type: 'activity' })}><Footprints size={14} />{t('dash.add_activity')}</button>}
        {bonus > 0 && <button class="chip" onClick={() => setSheet({ type: 'activity' })}><Footprints size={14} />{t('dash.activity_edit')}</button>}
      </div>}
      {!isToday && <div class="hstack"><button class="chip" onClick={() => setSheet({ type: 'activity' })}><Footprints size={14} />{bonus ? t('dash.activity_edit') : t('dash.add_activity')}</button></div>}

      {(recent.length > 0 || isToday) && <section class="stack stack--sm">
        <h2 class="h-section">{t('dash.quick')}</h2>
        <div class="chips">
          {isToday && <button class="chip" onClick={() => copyDay(addDays(date, -1), date)}><Copy size={14} strokeWidth={2.5} />{t('dash.copy_yesterday')}</button>}
          {recent.map(r => <button class="chip" onClick={() => quickAdd(r)}><Plus size={14} strokeWidth={2.5} />{r.name.split(',')[0]} <span class="num" style={{ color: 'var(--text-3)' }}>{fmt(r.kcal)}</span></button>)}
        </div>
      </section>}

      <section class="card meal-card">
        <div class="between" style={{ alignItems: 'center' }}>
          <div class="hstack"><Droplets size={20} style={{ color: 'var(--m-fat)' }} /><div><div class="meal-head__title">{t('water.title')}</div><div class="meal-head__kcal num">{num(wTotal)} / {num(waterGoal)} ml</div></div></div>
          <div class="ring-sm" role="img" aria-label={`${Math.round(wPct * 100)}%`}>
            <svg width="56" height="56"><circle class="t" cx="28" cy="28" r="24" stroke-width="5" /><circle class={`b ${wPct >= 1 ? 'full' : ''}`} cx="28" cy="28" r="24" stroke-width="5" stroke-dasharray={wC} stroke-dashoffset={wC * (1 - wPct)} /></svg>
            <span class="num">{Math.round(wPct * 100)}%</span>
          </div>
        </div>
        <div class="row">
          <button class="btn btn--secondary btn--sm" onClick={() => water(250)}><Plus size={16} />250 ml</button>
          <button class="btn btn--secondary btn--sm" onClick={() => water(500)}><Plus size={16} />500 ml</button>
          <button class="btn btn--secondary btn--sm" aria-label={t('water.undo')} disabled={!taps.length} onClick={async () => { await undoWater(date); haptic(8); load(); }} style={{ flex: '0 0 48px', padding: 0 }}><Undo2 size={18} /></button>
        </div>
      </section>

      {isToday && fast?.enabled && <FastCard fast={fast} now={now} onChange={async f => { await saveSettings({ fasting: f }); haptic(15); load(); }} />}

      {isToday && ins && ins.week.loggedDays > 0 && <section class="card meal-card">
        <h2 class="h-section">{t('week.title')}</h2>
        <div class="kpis">
          <div class="kpi"><b class="num">{fmt(ins.week.avgKcal)}</b><small>{t('week.avg')}</small></div>
          <div class="kpi"><b class="num">{Math.round(ins.week.proteinHitRate * 100)}%</b><small>{t('week.protein')}</small></div>
          <div class="kpi"><b class="num">{ins.week.weightChangeKg == null ? '–' : `${ins.week.weightChangeKg > 0 ? '+' : ''}${num(dispWeight(ins.week.weightChangeKg, units), 1)}`}</b><small>{wUnit(units)}</small></div>
        </div>
        <span class="field__hint">{t('week.note', { n: ins.week.loggedDays })}</span>
      </section>}

      {MEALS().map(([key, label]) => {
        const items = entries.filter(e => e.meal === key);
        return (
          <section class="card card--flush">
            <div class="meal-head">
              <div><div class="meal-head__title">{label}</div><div class="meal-head__kcal num">{items.length ? `${fmt(sum(items, 'kcal'))} kcal` : t('dash.nothing')}</div></div>
              <div class="hstack" style={{ gap: 0 }}>
                <button class="icon-btn" aria-label={t('dash.more', { meal: label })} onClick={() => setSheet({ type: 'meal', meal: key, view: 'menu' })}><MoreHorizontal size={22} /></button>
                <a class="icon-btn" href={`#/log?meal=${key}&d=${date}`} aria-label={t('dash.add_to', { meal: label })} style={{ color: 'var(--accent)' }}><Plus size={22} /></a>
              </div>
            </div>
            {items.length > 0 && <ul class="list" style={{ borderTop: '1px solid var(--border)' }}>{items.map(e => (
              <li><button class="list-item list-item--button" onClick={() => setSheet({ type: 'entry', e })}>
                <div class="list-item__body"><div class="list-item__title">{e.name}</div>
                  <div class="list-item__sub num">{fmt(e.grams)} g · {t('m.p')} {fmt(e.protein)} · {t('m.c')} {fmt(e.carbs)} · {t('m.f')} {fmt(e.fat)}</div></div>
                <span class="list-item__trail num">{fmt(e.kcal)}</span>
              </button></li>))}</ul>}
          </section>
        );
      })}

      {sheet?.type === 'entry' && <EntrySheet e={sheet.e} isToday={isToday} today={today} onClose={close} onDone={done} />}
      {sheet?.type === 'meal' && <MealSheet st={sheet} setSt={setSheet} entries={entries.filter(e => e.meal === sheet.meal)} date={date} isToday={isToday} today={today} onClose={close} onDone={done} go={go} />}
      {sheet?.type === 'activity' && <ActivitySheet date={date} current={activity} onClose={close} onDone={done} />}
    </main>
  );
}

function FastCard({ fast, now, onChange }) {
  const running = !!fast.startedAt;
  const el = running ? fastElapsedMs(fast.startedAt, now) : 0, pct = running ? fastProgress(fast.startedAt, now, fast.targetH) : 0;
  return (
    <section class="card meal-card">
      <div class="between" style={{ alignItems: 'center' }}>
        <div class="hstack"><Timer size={20} style={{ color: 'var(--accent)' }} /><div><div class="meal-head__title">{t('fast.title')}</div><div class="meal-head__kcal">{t('fast.target', { h: fast.targetH })}</div></div></div>
        {running && <span class="fast-time num">{formatHMS(el)}</span>}
      </div>
      {running && <div class="bar"><i style={{ width: `${pct * 100}%`, background: 'var(--accent)' }} /></div>}
      {running && pct >= 1 && <span class="field__hint">{t('fast.reached')}</span>}
      {running
        ? <button class="btn btn--secondary btn--sm" onClick={() => onChange({ ...fast, startedAt: undefined })}>{t('fast.end')}</button>
        : <button class="btn btn--primary btn--sm" onClick={() => onChange({ ...fast, startedAt: Date.now() })}>{t('fast.start')}</button>}
    </section>
  );
}

function EntrySheet({ e, isToday, today, onClose, onDone }) {
  const [g, setG] = useState(e.grams);
  const k = e.grams > 0 ? g / e.grams : 1;
  return (
    <Sheet title={e.name} sub={`${fmt(e.kcal)} kcal · ${fmt(e.grams)} g`} onClose={onClose}>
      <NumberField label={t('log.amount')} value={g} unit="g" onInput={setG} />
      <div class="nutri-grid">
        <div><b class="num">{fmt(e.kcal * k)}</b><small>kcal</small></div><div><b class="num">{fmt(e.protein * k)}g</b><small>{t('m.protein')}</small></div>
        <div><b class="num">{fmt(e.carbs * k)}g</b><small>{t('m.carbs')}</small></div><div><b class="num">{fmt(e.fat * k)}g</b><small>{t('m.fat')}</small></div>
      </div>
      <button class="btn btn--primary btn--block" disabled={!(g > 0)} onClick={async () => { await updateEntryGrams(e.id, e.date, g); haptic(12); onDone(t('common.saved')); }}>{t('common.save')}</button>
      <div class="row">
        {!isToday && <button class="btn btn--secondary" onClick={async () => { await copyEntries([e], today); haptic(12); onDone(t('dash.copied_one')); }}><Copy size={16} />{t('dash.copy_to_today')}</button>}
        <button class="btn btn--danger" onClick={async () => { await deleteEntry(e.id); haptic([20, 40, 20]); onDone(t('common.deleted')); }}><Trash2 size={16} />{t('common.delete')}</button>
      </div>
    </Sheet>
  );
}

function MealSheet({ st, setSt, entries, date, isToday, today, onClose, onDone, go }) {
  const [name, setName] = useState(''); const [tpls, setTpls] = useState(null);
  const label = MEALS().find(m => m[0] === st.meal)[1];
  useEffect(() => { if (st.view === 'templates') listTemplates().then(setTpls); }, [st.view]);
  const yesterdayMeal = async () => { const src = (await getDayEntries(addDays(date, -1))).filter(x => x.meal === st.meal); if (!src.length) return onDone(t('dash.nothing_to_copy')); await copyEntries(src, date, st.meal); haptic(12); onDone(t('dash.copied', { n: src.length })); };
  if (st.view === 'save') return (
    <Sheet title={t('tpl.save')} sub={label} onClose={onClose}>
      <TextField label={t('tpl.name')} value={name} onInput={setName} placeholder={t('tpl.name_ph')} />
      <button class="btn btn--primary btn--block" disabled={!name.trim()} onClick={async () => { await saveTemplate(name, st.meal, entries); haptic(12); onDone(t('tpl.saved')); }}>{t('common.save')}</button>
    </Sheet>);
  if (st.view === 'templates') return (
    <Sheet title={t('tpl.use')} sub={label} onClose={onClose}>
      {tpls == null ? null : tpls.length === 0 ? <p class="muted">{t('tpl.none')}</p> :
        <div class="card card--flush"><ul class="list">{tpls.map(tp => (
          <li class="list-item">
            <button class="list-item--button list-item" style={{ border: 0, padding: 0 }} onClick={async () => { await applyTemplate(tp, date, st.meal); haptic(15); onDone(t('tpl.logged', { name: tp.name })); }}>
              <div class="list-item__body"><div class="list-item__title">{tp.name}</div><div class="list-item__sub num">{tp.items.length} · {fmt(tp.items.reduce((a, i) => a + i.macros.kcal, 0))} kcal</div></div>
            </button>
            <button class="icon-btn" aria-label={t('common.delete')} onClick={async () => { await deleteTemplate(tp.id); setTpls(await listTemplates()); }}><Trash2 size={18} /></button>
          </li>))}</ul></div>}
    </Sheet>);
  return (
    <Sheet title={label} onClose={onClose}>
      <div class="stack stack--sm">
        <button class="btn btn--secondary btn--block" disabled={!entries.length} onClick={() => setSt({ ...st, view: 'save' })}><BookmarkPlus size={18} />{t('tpl.save')}</button>
        <button class="btn btn--secondary btn--block" onClick={() => setSt({ ...st, view: 'templates' })}><ListPlus size={18} />{t('tpl.use')}</button>
        <button class="btn btn--secondary btn--block" onClick={yesterdayMeal}><Copy size={18} />{t('dash.copy_meal_yesterday')}</button>
        {!isToday && <button class="btn btn--secondary btn--block" disabled={!entries.length} onClick={async () => { await copyEntries(entries, today, st.meal); haptic(12); onDone(t('dash.copied', { n: entries.length })); }}><Copy size={18} />{t('dash.copy_meal_today')}</button>}
      </div>
    </Sheet>);
}
const getDayEntries = async d => (await getDay(d)).entries;

function ActivitySheet({ date, current, onClose, onDone }) {
  const [mode, setMode] = useState(current?.kcal != null ? 'kcal' : 'steps');
  const [v, setV] = useState(current ? (current.kcal ?? current.steps ?? '') : '');
  const preview = v === '' ? 0 : activityBonus(mode === 'kcal' ? { kcal: v } : { steps: v });
  return (
    <Sheet title={t('act.title')} sub={t('act.sub')} onClose={onClose}>
      <Segmented label={t('act.title')} value={mode} onChange={m => setMode(m)} options={[{ value: 'steps', label: t('act.steps') }, { value: 'kcal', label: t('act.kcal') }]} />
      <NumberField label={mode === 'steps' ? t('act.steps') : t('act.kcal')} value={v} unit={mode === 'steps' ? t('act.stepsunit') : 'kcal'} decimals={0} onInput={setV} hint={t('act.hint')} />
      <div class="stat"><span class="stat__k">{t('act.adds')}</span><span class="stat__v num">+{fmt(preview)} kcal</span></div>
      <button class="btn btn--primary btn--block" disabled={v === '' || !(v >= 0)} onClick={async () => { await setActivityDay(date, mode === 'kcal' ? { kcal: v } : { steps: v }); haptic(12); onDone(t('common.saved')); }}>{t('common.save')}</button>
      {current && <button class="btn btn--danger btn--block" onClick={async () => { await clearActivityDay(date); onDone(t('act.removed')); }}>{t('act.remove')}</button>}
    </Sheet>);
}
