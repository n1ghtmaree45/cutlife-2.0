import { useEffect, useState } from 'preact/hooks';
import { ChevronLeft, Search, X, Check, Info, KeyRound, ScanBarcode, Camera, Plus, Pencil, UtensilsCrossed, ChefHat } from 'lucide-preact';
import { Segmented, Sheet, NumberField, fmt } from '../components/ui.jsx';
import { searchFoods, getRecentFoods, addEntry, sourceLabel, cacheFood, listMyFoods, todayKey } from '../services/index.js';
import { MEALS } from './Dashboard.jsx';
import { ScanMode, PhotoMode, CustomFoodForm, RecipeBuilder, MyFoods } from './LogExtras.jsx';
import { t } from '../../i18n';
import { haptic } from '../../lib/haptics';

const dest = d => (d && d !== todayKey() ? `#/?d=${d}` : '#/');

export function LogFood({ meal: initialMeal, mode: initialMode, date: dateParam, toast, initialQuery = '', openFirst = false }) {
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayKey();
  const [meal, setMeal] = useState(initialMeal || (() => { const h = new Date().getHours(); return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 21 ? 'dinner' : 'snack'; })());
  const [mode, setMode] = useState(['scan', 'photo'].includes(initialMode) ? initialMode : 'search');
  const [view, setView] = useState(null); // null | {type:'custom'|'recipe'|'mine', ...}
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState([]);
  const [recent, setRecent] = useState([]);
  const [mine, setMine] = useState([]);
  const [sel, setSel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState([]);
  const [fallback, setFallback] = useState(false);
  const [online, setOnline] = useState(navigator.onLine !== false);

  useEffect(() => { const on = () => setOnline(true), off = () => setOnline(false); addEventListener('online', on); addEventListener('offline', off); return () => { removeEventListener('online', on); removeEventListener('offline', off); }; }, []);
  useEffect(() => { getRecentFoods(10).then(setRecent); listMyFoods().then(setMine); }, [view]);
  useEffect(() => {
    if (mode !== 'search') return;
    const ac = new AbortController();
    const tm = setTimeout(() => {
      if (q.trim()) setLoading(true);
      searchFoods(q, { signal: ac.signal }).then(r => {
        if (ac.signal.aborted) return;
        setResults(r.foods); setErrors(r.errors); setFallback(r.fallback); setLoading(false);
        if (openFirst && r.foods[0] && !sel) setSel(r.foods[0]);
      });
    }, 300);
    return () => { clearTimeout(tm); ac.abort(); };
  }, [q, mode]);

  const back = () => { if (view) setView(null); else history.length > 1 ? history.back() : (location.hash = dest(date)); };
  const mealLabel = MEALS().find(m => m[0] === meal)[1];
  const finish = msg => { toast(msg); location.hash = dest(date); };
  const showRecent = !q.trim();
  const list = showRecent ? recent.map(e => ({ ...e, id: e.foodId || e.id, kcal: e.kcal / e.grams * 100, protein: e.protein / e.grams * 100, carbs: e.carbs / e.grams * 100, fat: e.fat / e.grams * 100, serving: e.grams, servingLabel: `${fmt(e.grams)} g`, source: e.source, foodId: e.foodId })) : results;

  const title = view?.type === 'custom' ? (view.food ? t('custom.edit') : t('custom.new')) : view?.type === 'recipe' ? (view.id ? t('recipe.edit') : t('recipe.new')) : view?.type === 'mine' ? t('log.my_foods') : t('log.title');
  return (
    <main class="page">
      <div class="topbar">
        <button class="icon-btn" aria-label={t('common.back')} onClick={back} style={{ marginLeft: -10 }}><ChevronLeft size={24} /></button>
        <span style={{ fontWeight: 600, fontSize: 'var(--fs-17)' }}>{title}</span>
        <span style={{ width: 44 }} />
      </div>

      {view?.type === 'custom' && <CustomFoodForm food={view.food} barcode={view.barcode} toast={toast} onDone={f => { setView(f ? { type: 'mine' } : null); }} />}
      {view?.type === 'recipe' && <RecipeBuilder id={view.id} toast={toast} onDone={() => setView({ type: 'mine' })} />}
      {view?.type === 'mine' && <MyFoods foods={mine} setView={setView} onPick={setSel} toast={toast} reload={() => listMyFoods().then(setMine)} />}

      {!view && <>
        <div class="stack stack--sm">
          <Segmented label={t('log.meal')} value={meal} onChange={setMeal} options={MEALS().map(([value, label]) => ({ value, label }))} />
          <Segmented label={t('log.mode')} value={mode} onChange={setMode} options={[
            { value: 'search', label: t('log.search'), icon: <Search size={16} /> }, { value: 'scan', label: t('log.scan'), icon: <ScanBarcode size={16} /> }, { value: 'photo', label: t('log.photo'), icon: <Camera size={16} /> }]} />
        </div>

        {mode === 'scan' && <ScanMode online={online} onPick={setSel} onManual={() => setMode('search')} onCreate={code => setView({ type: 'custom', barcode: code })} />}
        {mode === 'photo' && <PhotoMode meal={meal} date={date} online={online} onManual={() => setMode('search')} onSaved={finish} />}

        {mode === 'search' && <>
          <div class="search">
            <label class="input-wrap" aria-label={t('log.search_ph')}>
              <Search size={18} style={{ color: 'var(--text-3)' }} />
              <input type="text" inputMode="search" enterKeyHint="search" placeholder={t('log.search_ph')} value={q} onInput={e => setQ(e.currentTarget.value)} autoFocus />
              {q && <button class="icon-btn" style={{ width: 32, height: 32 }} aria-label={t('common.clear')} onClick={() => setQ('')}><X size={16} /></button>}
            </label>
          </div>
          {!online && <div class="notice notice--info" role="status"><Info size={16} /><span>{t('log.offline_search')}</span></div>}
          <div class="hstack" style={{ flexWrap: 'wrap', gap: 'var(--s-2)' }}>
            <button class="chip" onClick={() => setView({ type: 'custom' })}><Plus size={14} />{t('log.custom_food')}</button>
            <button class="chip" onClick={() => setView({ type: 'recipe' })}><ChefHat size={14} />{t('log.recipe')}</button>
            <button class="chip" onClick={() => setView({ type: 'mine' })}><UtensilsCrossed size={14} />{t('log.my_foods')}{mine.length ? ` (${mine.length})` : ''}</button>
          </div>

          <h2 class="h-section">{showRecent ? t('log.recent') : loading ? t('log.searching') : t('log.results')}</h2>
          {!showRecent && !loading && <SearchNotices errors={errors} fallback={fallback} />}
          {list.length === 0 && !loading
            ? <p class="empty" style={{ padding: 0 }}>{showRecent ? t('log.recent_empty') : t('log.no_match', { q })}</p>
            : <div class="card card--flush"><ul class="list">{list.map(f => (
              <li><button class="list-item list-item--button" onClick={() => setSel(f)}>
                <div class="list-item__body"><div class="list-item__title">{f.name}</div>
                  <div class="list-item__sub num">{f.servingLabel} · {fmt(f.kcal * f.serving / 100)} kcal</div></div>
                <span class="badge">{sourceLabel(f.source)}</span>
              </button></li>))}</ul></div>}
          {!showRecent && !loading && list.length === 0 && <button class="btn btn--secondary" onClick={() => setView({ type: 'custom' })}><Plus size={16} />{t('log.create_this')}</button>}
        </>}
      </>}

      {sel && <PortionSheet food={sel} meal={meal} setMeal={setMeal} date={date} onClose={() => setSel(null)} onSaved={() => finish(t('log.added_to', { meal: mealLabel }))} />}
    </main>
  );
}

export function PortionSheet({ food, meal, setMeal, date, onClose, onSaved }) {
  const [grams, setGrams] = useState(food.serving || 100);
  const g = Number(grams) || 0;
  const scaled = { kcal: food.kcal * g / 100, protein: food.protein * g / 100, carbs: food.carbs * g / 100, fat: food.fat * g / 100 };
  const label = MEALS().find(m => m[0] === meal)[1];
  const save = async () => {
    await cacheFood(food.raw);
    const r = v => Math.round(v * 10) / 10;
    const builtin = food.source === 'builtin';
    await addEntry({ meal, date, name: food.name, grams: g, kcal: Math.round(scaled.kcal), protein: r(scaled.protein), carbs: r(scaled.carbs), fat: r(scaled.fat), source: builtin ? 'quick' : food.source, foodId: builtin ? undefined : (food.raw?.id || food.foodId) });
    haptic(15); onSaved();
  };
  return (
    <Sheet title={food.name} sub={`${fmt(food.kcal)} kcal / 100 g · ${sourceLabel(food.source)}`} onClose={onClose}>
      <NumberField label={t('log.amount')} value={grams} unit="g" onInput={setGrams} />
      <div class="nutri-grid">
        <div><b class="num">{fmt(scaled.kcal)}</b><small>kcal</small></div>
        <div><b class="num">{fmt(scaled.protein)}g</b><small>{t('m.protein')}</small></div>
        <div><b class="num">{fmt(scaled.carbs)}g</b><small>{t('m.carbs')}</small></div>
        <div><b class="num">{fmt(scaled.fat)}g</b><small>{t('m.fat')}</small></div>
      </div>
      <button class="btn btn--primary btn--block" disabled={!g} onClick={save}><Check size={18} /> {t('log.add_to', { meal: label })}</button>
    </Sheet>
  );
}

const SRC = () => ({ usda: 'USDA', off: 'Open Food Facts', local: t('src.saved') });
const MSG = {
  off_unavailable: () => t('err.off_unavailable'),
  rate_limited: s => t('err.rate_limited', { s }),
  bad_key: s => s === 'USDA' ? t('err.usda_bad_key') : t('err.rejected', { s }),
  unavailable: s => t('err.unavailable', { s }), network: s => t('err.network', { s }), timeout: s => t('err.timeout', { s }),
  bad_response: s => t('err.bad_response', { s }), unknown: s => t('err.unknown', { s }),
};

export function SearchNotices({ errors, fallback }) {
  const keyNeeded = errors.some(e => e.code === 'usda_key_needed');
  const rest = errors.filter(e => e.code !== 'usda_key_needed');
  if (!errors.length) return null;
  return (
    <div class="stack stack--sm">
      {keyNeeded && (
        <div class="notice notice--info" role="status">
          <KeyRound size={16} strokeWidth={2} />
          <span>{t('err.usda_needed')}{' '}
            <a href="https://fdc.nal.usda.gov/api-key-signup" target="_blank" rel="noopener noreferrer">{t('err.get_key')}</a>, {t('err.then')}{' '}
            <a href="#/settings">{t('err.add_settings')}</a>.</span>
        </div>
      )}
      {rest.map(e => (
        <div class="notice notice--info" role="status"><Info size={16} strokeWidth={2} /><span>{(MSG[e.code] || MSG.unknown)(SRC()[e.source] || e.source)}</span></div>
      ))}
      {fallback && <p class="field__hint">{t('log.builtin_shown')}</p>}
    </div>
  );
}
