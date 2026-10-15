import { useEffect, useRef, useState } from 'preact/hooks';
import { Camera, Image as ImageIcon, RefreshCw, Trash2, Pencil, Plus, Search, X, Info, KeyRound, CameraOff, WifiOff, ScanBarcode } from 'lucide-preact';
import { Sheet, NumberField, TextField, Notice, fmt, fmt1 } from '../components/ui.jsx';
import { scanLookup, aiAnalyze, resizeImage, confidenceLabel, AiError, addEntry, saveCustomFood, deleteMyFood, saveRecipe, getRecipe, searchFoods, recipePer100g, round } from '../services/index.js';
import { startScanner, ScanFail, looksLikeBarcode } from '../../lib/scanner';
import { t, num } from '../../i18n';
import { haptic } from '../../lib/haptics';

/* ---------------- barcode ---------------- */
export function ScanMode({ online, onPick, onManual, onCreate }) {
  const video = useRef(null);
  const [state, setState] = useState('starting'); // starting | scanning | error | looking
  const [err, setErr] = useState(null);
  const [code, setCode] = useState('');
  const [miss, setMiss] = useState(null); // {code, reason: 'notfound'|'offline'|'network'}
  const [run, setRun] = useState(0);
  const stop = useRef(null);

  const lookup = async c => {
    setState('looking'); setMiss(null);
    const r = await scanLookup(c);
    if (r.food) { haptic(20); onPick(r.food); setState('idle'); return; }
    setMiss({ code: c, reason: r.error || 'notfound' }); setState('idle');
  };
  useEffect(() => {
    let dead = false;
    (async () => {
      setState('starting'); setErr(null);
      try {
        stop.current = await startScanner(video.current, c => { stop.current?.(); stop.current = null; haptic(20); lookup(c); });
        if (dead) { stop.current?.(); return; } setState('scanning');
      } catch (e) { if (!dead) { setErr(e instanceof ScanFail ? e.kind : 'failed'); setState('error'); } }
    })();
    return () => { dead = true; stop.current?.(); stop.current = null; };
  }, [run]);

  const submit = () => { const c = code.trim(); if (looksLikeBarcode(c)) lookup(c); };
  const camMsg = { denied: t('scan.denied'), no_camera: t('scan.no_camera'), unsupported: t('scan.unsupported'), failed: t('scan.failed') };
  return (
    <div class="stack">
      <div class="video-box">
        <video ref={video} muted playsInline aria-label={t('scan.view')} style={{ display: state === 'error' ? 'none' : 'block' }} />
        {state === 'scanning' && <div class="reticle" />}
        {state === 'error' && <div style={{ color: '#fff', padding: 'var(--s-4)', textAlign: 'center' }}><CameraOff size={28} /><p class="small" style={{ marginTop: 8 }}>{camMsg[err]}</p></div>}
        {state === 'starting' && <span style={{ color: '#fff' }} class="small">{t('scan.starting')}</span>}
      </div>
      {state === 'looking' && <p class="muted small">{t('scan.looking')}</p>}
      {!online && <div class="notice notice--info" role="status"><WifiOff size={16} /><span>{t('scan.offline')}</span></div>}
      {miss && <div class="stack stack--sm">
        <Notice info>{miss.reason === 'offline' ? t('scan.miss_offline') : miss.reason === 'network' ? t('scan.miss_network') : t('scan.notfound', { code: miss.code })}</Notice>
        <div class="row">
          <button class="btn btn--secondary btn--sm" onClick={() => { setMiss(null); setRun(r => r + 1); }}><RefreshCw size={16} />{t('scan.again')}</button>
          <button class="btn btn--secondary btn--sm" onClick={() => onCreate(miss.code)}><Plus size={16} />{t('scan.create')}</button>
        </div>
      </div>}
      <div class="stack stack--sm">
        <span class="field__label">{t('scan.manual')}</span>
        <div class="hstack">
          <label class="input-wrap grow"><input type="text" inputMode="numeric" placeholder="5000112637922" value={code} onInput={e => setCode(e.currentTarget.value.replace(/\D/g, ''))} onKeyDown={e => e.key === 'Enter' && submit()} /></label>
          <button class="btn btn--primary" disabled={!looksLikeBarcode(code)} onClick={submit}>{t('scan.lookup')}</button>
        </div>
        <button class="link small" style={{ alignSelf: 'flex-start' }} onClick={onManual}>{t('scan.search_by_name')}</button>
      </div>
    </div>
  );
}

/* ---------------- photo + AI ---------------- */
const rnd1 = v => Math.round(v * 10) / 10;
const mkItem = f => ({ name: f.name, grams: Math.round(f.grams_estimate), kcal: Math.round(f.kcal), protein: rnd1(f.protein), carbs: rnd1(f.carbs), fat: rnd1(f.fat), confidence: f.confidence,
  per: f.grams_estimate > 0 ? { kcal: f.kcal / f.grams_estimate, protein: f.protein / f.grams_estimate, carbs: f.carbs / f.grams_estimate, fat: f.fat / f.grams_estimate } : null });

export function PhotoMode({ meal, date, online, onManual, onSaved }) {
  const [stage, setStage] = useState('pick'); // pick | working | review | error
  const [items, setItems] = useState([]);
  const [hint, setHint] = useState('');
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const blob = useRef(null); const ac = useRef(null);
  const cam = useRef(null); const gal = useRef(null);
  useEffect(() => () => { ac.current?.abort(); if (preview) URL.revokeObjectURL(preview); blob.current = null; }, []);

  const analyze = async () => {
    setStage('working'); setError(null); ac.current = new AbortController();
    try {
      const r = await aiAnalyze(blob.current, { hint: hint.trim() || undefined, signal: ac.current.signal });
      setItems(r.foods.map(mkItem)); setStage('review');
    } catch (e) { if (ac.current.signal.aborted) return; setError(e instanceof AiError ? { kind: e.kind, msg: e.message } : { kind: 'provider', msg: String(e?.message || e) }); setStage('error'); }
  };
  const onFile = async e => {
    const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (!f) return;
    try { blob.current = await resizeImage(f); } catch { setError({ kind: 'image', msg: t('photo.bad_image') }); setStage('error'); return; }
    if (preview) URL.revokeObjectURL(preview); setPreview(URL.createObjectURL(blob.current)); analyze();
  };
  const reset = () => { ac.current?.abort(); blob.current = null; if (preview) URL.revokeObjectURL(preview); setPreview(null); setItems([]); setStage('pick'); };

  const upd = (i, patch) => setItems(xs => xs.map((x, k) => k === i ? { ...x, ...patch } : x));
  const setGrams = (i, g) => setItems(xs => xs.map((x, k) => { if (k !== i) return x; const n = { ...x, grams: g === '' ? '' : g }; if (x.per && g !== '') Object.assign(n, { kcal: Math.round(x.per.kcal * g), protein: rnd1(x.per.protein * g), carbs: rnd1(x.per.carbs * g), fat: rnd1(x.per.fat * g) }); return n; }));
  const setMacro = (i, k, v) => setItems(xs => xs.map((x, j) => { if (j !== i) return x; const n = { ...x, [k]: v }; if (n.grams > 0 && v !== '') n.per = { ...(x.per || {}), kcal: n.kcal / n.grams, protein: n.protein / n.grams, carbs: n.carbs / n.grams, fat: n.fat / n.grams }; return n; }));
  const valid = items.length > 0 && items.every(x => x.name.trim() && x.grams > 0 && [x.kcal, x.protein, x.carbs, x.fat].every(v => v !== '' && v >= 0));
  const save = async () => {
    for (const x of items) await addEntry({ meal, date, name: x.name.trim(), grams: x.grams, kcal: x.kcal, protein: x.protein, carbs: x.carbs, fat: x.fat, source: 'ai', confidence: x.confidence });
    haptic(20); const n = items.length; reset(); onSaved(t('photo.saved', { n }));
  };

  if (!online && stage === 'pick') return (
    <div class="stack"><Notice info>{t('photo.offline')}</Notice><button class="btn btn--secondary" onClick={onManual}><Search size={16} />{t('photo.manual')}</button></div>);

  return (
    <div class="stack">
      {stage === 'pick' && <>
        <TextField label={t('photo.hint')} value={hint} onInput={setHint} placeholder={t('photo.hint_ph')} />
        <div class="row">
          <button class="btn btn--primary" onClick={() => cam.current.click()}><Camera size={18} />{t('photo.take')}</button>
          <button class="btn btn--secondary" onClick={() => gal.current.click()}><ImageIcon size={18} />{t('photo.choose')}</button>
        </div>
        <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
        <input ref={gal} type="file" accept="image/*" hidden onChange={onFile} />
        <Notice info>{t('photo.privacy')}</Notice>
      </>}
      {stage === 'working' && <div class="card stack stack--sm" role="status" aria-live="polite">{preview && <img class="photo-full" src={preview} alt="" style={{ maxHeight: 220 }} />}<p class="muted">{t('photo.analyzing')}</p>
        <button class="btn btn--secondary btn--sm" onClick={reset}>{t('common.cancel')}</button></div>}
      {stage === 'error' && <div class="stack">
        <Notice>{error.kind === 'no_key' ? t('photo.no_key') : error.kind === 'rate_limited' ? t('photo.rate_limited') : error.kind === 'invalid_json' ? t('photo.invalid') : error.kind === 'network' ? t('photo.network') : error.msg}</Notice>
        {error.kind === 'no_key' && <a class="btn btn--secondary" href="#/settings"><KeyRound size={16} />{t('photo.open_settings')}</a>}
        <div class="row">
          {blob.current && error.kind !== 'no_key' && <button class="btn btn--primary btn--sm" onClick={analyze}><RefreshCw size={16} />{t('common.retry')}</button>}
          <button class="btn btn--secondary btn--sm" onClick={reset}>{t('photo.new_photo')}</button>
        </div>
        <button class="link small" style={{ alignSelf: 'flex-start' }} onClick={onManual}>{t('photo.manual')}</button>
      </div>}
      {stage === 'review' && <>
        <Notice info>{t('photo.estimate_warn')}</Notice>
        {items.length === 0 && <div class="stack"><p class="muted">{t('photo.none')}</p><button class="btn btn--secondary" onClick={reset}>{t('photo.new_photo')}</button></div>}
        {items.length > 0 && <div class="card card--flush">
          {items.map((x, i) => {
            const cl = confidenceLabel(x.confidence);
            return (
              <div class="edit-item">
                <div class="between" style={{ alignItems: 'center' }}>
                  <span class={`conf conf--${cl}`}>{t(`conf.${cl}`)} · {Math.round(x.confidence * 100)}%</span>
                  <button class="icon-btn" style={{ width: 36, height: 36 }} aria-label={t('common.remove')} onClick={() => setItems(xs => xs.filter((_, k) => k !== i))}><Trash2 size={18} /></button>
                </div>
                <TextField label={t('photo.name')} value={x.name} onInput={v => upd(i, { name: v })} />
                <div class="row">
                  <NumberField label={t('log.amount')} unit="g" decimals={0} value={x.grams} onInput={g => setGrams(i, g)} />
                  <NumberField label="kcal" decimals={0} value={x.kcal} onInput={v => setMacro(i, 'kcal', v)} />
                </div>
                <div class="row">
                  <NumberField label={t('m.protein')} unit="g" value={x.protein} onInput={v => setMacro(i, 'protein', v)} />
                  <NumberField label={t('m.carbs')} unit="g" value={x.carbs} onInput={v => setMacro(i, 'carbs', v)} />
                  <NumberField label={t('m.fat')} unit="g" value={x.fat} onInput={v => setMacro(i, 'fat', v)} />
                </div>
              </div>);
          })}
        </div>}
        {items.length > 0 && <div class="stat"><span class="stat__k">{t('photo.total')}</span><span class="stat__v num">{fmt(items.reduce((a, x) => a + (x.kcal || 0), 0))} kcal</span></div>}
        {items.length > 0 && <div class="row"><button class="btn btn--secondary" onClick={reset}>{t('common.cancel')}</button><button class="btn btn--primary" disabled={!valid} onClick={save}>{t('photo.save_all')}</button></div>}
      </>}
    </div>
  );
}

/* ---------------- custom foods ---------------- */
export function CustomFoodForm({ food, barcode, toast, onDone }) {
  const f = food?.raw;
  const [v, setV] = useState({ name: f?.name || '', brand: f?.brand || '', barcode: f?.barcode || barcode || '',
    kcal: f?.per100g.kcal ?? '', protein: f?.per100g.protein ?? '', carbs: f?.per100g.carbs ?? '', fat: f?.per100g.fat ?? '', servingG: f?.servingG ?? '' });
  const set = k => x => setV(s => ({ ...s, [k]: x }));
  const nums = [v.kcal, v.protein, v.carbs, v.fat];
  const valid = v.name.trim() && nums.every(n => n !== '' && n >= 0) && (v.servingG === '' || v.servingG > 0);
  const est = ([v.protein, v.carbs].every(n => n !== '') && v.fat !== '') ? Math.round(v.protein * 4 + v.carbs * 4 + v.fat * 9) : null;
  const save = async () => {
    await saveCustomFood({ id: f?.id, name: v.name, brand: v.brand, barcode: v.barcode, kcal: v.kcal, protein: v.protein, carbs: v.carbs, fat: v.fat, servingG: v.servingG === '' ? 0 : v.servingG });
    haptic(15); toast(t('common.saved')); onDone(true);
  };
  return (
    <div class="stack">
      <TextField label={t('custom.name')} value={v.name} onInput={set('name')} />
      <TextField label={t('custom.brand')} value={v.brand} onInput={set('brand')} />
      <h2 class="h-section">{t('custom.per100')}</h2>
      <div class="row"><NumberField label="kcal" decimals={0} value={v.kcal} onInput={set('kcal')} /><NumberField label={t('m.protein')} unit="g" value={v.protein} onInput={set('protein')} /></div>
      <div class="row"><NumberField label={t('m.carbs')} unit="g" value={v.carbs} onInput={set('carbs')} /><NumberField label={t('m.fat')} unit="g" value={v.fat} onInput={set('fat')} /></div>
      {est != null && v.kcal !== '' && Math.abs(est - v.kcal) > Math.max(25, v.kcal * 0.15) && <Notice info>{t('custom.mismatch', { est: fmt(est) })}</Notice>}
      <NumberField label={t('custom.serving')} unit="g" value={v.servingG} decimals={0} onInput={set('servingG')} hint={t('custom.serving_hint')} />
      <TextField label={t('custom.barcode')} value={v.barcode} onInput={x => set('barcode')(x.replace(/\D/g, ''))} />
      <button class="btn btn--primary btn--block" disabled={!valid} onClick={save}>{t('common.save')}</button>
    </div>
  );
}

/* ---------------- my foods ---------------- */
export function MyFoods({ foods, setView, onPick, toast, reload }) {
  const [del, setDel] = useState(null);
  return (
    <div class="stack">
      <div class="row">
        <button class="btn btn--secondary btn--sm" onClick={() => setView({ type: 'custom' })}><Plus size={16} />{t('log.custom_food')}</button>
        <button class="btn btn--secondary btn--sm" onClick={() => setView({ type: 'recipe' })}><Plus size={16} />{t('log.recipe')}</button>
      </div>
      {foods.length === 0 ? <p class="empty" style={{ padding: 0 }}>{t('mine.empty')}</p> :
        <div class="card card--flush"><ul class="list">{foods.map(f => (
          <li class="list-item">
            <button class="list-item--button list-item" style={{ border: 0, padding: 0 }} onClick={() => onPick(f)}>
              <div class="list-item__body"><div class="list-item__title">{f.name}</div><div class="list-item__sub num">{f.servingLabel} · {fmt(f.kcal * f.serving / 100)} kcal</div></div>
            </button>
            <button class="icon-btn" aria-label={t('common.edit')} onClick={() => setView(f.source === 'recipe' ? { type: 'recipe', id: f.id.slice(7) } : { type: 'custom', food: f })}><Pencil size={18} /></button>
            <button class="icon-btn" aria-label={t('common.delete')} onClick={() => setDel(f)}><Trash2 size={18} /></button>
          </li>))}</ul></div>}
      {del && <Sheet title={t('mine.delete_q', { name: del.name })} sub={t('mine.delete_note')} onClose={() => setDel(null)}>
        <button class="btn btn--danger btn--block" onClick={async () => { await deleteMyFood(del.id); haptic([20, 40, 20]); setDel(null); toast(t('common.deleted')); reload(); }}><Trash2 size={16} />{t('common.delete')}</button>
      </Sheet>}
    </div>
  );
}

/* ---------------- recipes ---------------- */
export function RecipeBuilder({ id, toast, onDone }) {
  const [name, setName] = useState(''); const [servings, setServings] = useState(1); const [cooked, setCooked] = useState('');
  const [ings, setIngs] = useState([]); // [{food: rawFood, grams}]
  const [picker, setPicker] = useState(false);
  useEffect(() => { if (id) getRecipe(id).then(r => { if (r) { setName(r.name); setServings(r.servings); setCooked(r.totalCookedG ?? ''); setIngs(r.ingredients); } }); }, [id]);
  const map = Object.fromEntries(ings.map(i => [i.food.id, i.food]));
  const totalRaw = ings.reduce((a, i) => a + (i.grams || 0), 0);
  const totalG = cooked > 0 ? cooked : totalRaw;
  const per100 = ings.length && totalG > 0 ? recipePer100g(ings.map(i => ({ foodId: i.food.id, grams: i.grams || 0 })), map, cooked > 0 ? cooked : undefined) : null;
  const perServ = per100 && servings > 0 ? { kcal: per100.kcal * totalG / 100 / servings, protein: per100.protein * totalG / 100 / servings, carbs: per100.carbs * totalG / 100 / servings, fat: per100.fat * totalG / 100 / servings } : null;
  const valid = name.trim() && ings.length > 0 && ings.every(i => i.grams > 0) && servings > 0;
  return (
    <div class="stack">
      <TextField label={t('recipe.name')} value={name} onInput={setName} />
      <h2 class="h-section">{t('recipe.ingredients')}</h2>
      {ings.length > 0 && <div class="card card--flush">{ings.map((i, k) => (
        <div class="edit-item" style={{ gap: 'var(--s-2)' }}>
          <div class="between" style={{ alignItems: 'center' }}><span class="list-item__title">{i.food.brand ? `${i.food.name}, ${i.food.brand}` : i.food.name}</span>
            <button class="icon-btn" style={{ width: 36, height: 36 }} aria-label={t('common.remove')} onClick={() => setIngs(xs => xs.filter((_, j) => j !== k))}><Trash2 size={18} /></button></div>
          <NumberField label={t('recipe.grams')} unit="g" decimals={0} value={i.grams} onInput={g => setIngs(xs => xs.map((x, j) => j === k ? { ...x, grams: g } : x))} />
        </div>))}</div>}
      <button class="btn btn--secondary" onClick={() => setPicker(true)}><Plus size={16} />{t('recipe.add_ing')}</button>
      <div class="row">
        <NumberField label={t('recipe.servings')} decimals={0} value={servings} onInput={setServings} />
        <NumberField label={t('recipe.cooked')} unit="g" decimals={0} value={cooked} onInput={setCooked} hint={t('recipe.cooked_hint')} />
      </div>
      {perServ && <div class="card stack stack--sm"><span class="eyebrow">{t('recipe.per_serving', { g: fmt(totalG / servings) })}</span>
        <div class="nutri-grid"><div><b class="num">{fmt(perServ.kcal)}</b><small>kcal</small></div><div><b class="num">{fmt(perServ.protein)}g</b><small>{t('m.protein')}</small></div>
          <div><b class="num">{fmt(perServ.carbs)}g</b><small>{t('m.carbs')}</small></div><div><b class="num">{fmt(perServ.fat)}g</b><small>{t('m.fat')}</small></div></div></div>}
      <button class="btn btn--primary btn--block" disabled={!valid} onClick={async () => { await saveRecipe({ id, name, ingredients: ings, servings, totalCookedG: cooked === '' ? 0 : cooked }); haptic(15); toast(t('common.saved')); onDone(); }}>{t('common.save')}</button>
      {picker && <IngredientPicker onClose={() => setPicker(false)} onPick={f => { setIngs(xs => [...xs, { food: f.raw, grams: f.serving || 100 }]); setPicker(false); }} />}
    </div>
  );
}

function IngredientPicker({ onClose, onPick }) {
  const [q, setQ] = useState(''); const [res, setRes] = useState([]); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!q.trim()) { setRes([]); return; }
    const ac = new AbortController(); const tm = setTimeout(() => { setBusy(true); searchFoods(q, { signal: ac.signal }).then(r => { if (!ac.signal.aborted) { setRes(r.foods.filter(f => f.raw)); setBusy(false); } }); }, 300);
    return () => { clearTimeout(tm); ac.abort(); };
  }, [q]);
  return (
    <Sheet title={t('recipe.add_ing')} onClose={onClose}>
      <label class="input-wrap"><Search size={18} style={{ color: 'var(--text-3)' }} /><input type="text" autoFocus placeholder={t('log.search_ph')} value={q} onInput={e => setQ(e.currentTarget.value)} /></label>
      <div style={{ maxHeight: '45dvh', overflowY: 'auto' }}>
        {busy && <p class="muted small">{t('log.searching')}</p>}
        <ul class="list">{res.map(f => <li><button class="list-item list-item--button" onClick={() => onPick(f)}><div class="list-item__body"><div class="list-item__title">{f.name}</div><div class="list-item__sub num">{fmt(f.kcal)} kcal / 100 g</div></div></button></li>)}</ul>
        {!busy && q.trim() && res.length === 0 && <p class="muted small">{t('log.no_match', { q })}</p>}
      </div>
    </Sheet>);
}
