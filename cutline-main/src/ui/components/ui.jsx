import { useEffect, useState } from 'preact/hooks';
import { Check, AlertTriangle, X } from 'lucide-preact';
import { t, num, getLang, parseNum } from '../../i18n';
import { haptic } from '../../lib/haptics';

export const fmt = n => num(Math.round(n));
export const fmt1 = n => num(n, 1);

export function Ring({ consumed, target, size = 132, stroke = 12, tone }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const pct = target ? Math.min(consumed / target, 1) : 0;
  const left = target - consumed;
  return (
    <div class="ring" style={{ width: size, height: size }} role="img" aria-label={`${fmt(Math.abs(left))} ${left >= 0 ? t('ring.left') : t('ring.over')}`}>
      <svg width={size} height={size}>
        <circle class="ring__track" cx={size / 2} cy={size / 2} r={r} stroke-width={stroke} />
        <circle class={`ring__bar ${left < 0 ? 'over' : ''}`} cx={size / 2} cy={size / 2} r={r} stroke-width={stroke}
          stroke-dasharray={c} stroke-dashoffset={c * (1 - pct)} />
      </svg>
      <div class="ring__center">
        <span class="ring__value num">{fmt(Math.abs(left))}</span>
        <span class="ring__label">{left >= 0 ? t('ring.left') : t('ring.over')}</span>
      </div>
    </div>
  );
}

export function MacroBar({ name, value, target, color }) {
  return (
    <div class="macro">
      <div class="macro__head"><span class="macro__name">{name}</span></div>
      <div class="bar"><i style={{ width: `${Math.min(100, target ? (value / target) * 100 : 0)}%`, background: color }} /></div>
      <span class="macro__val num" style={{ fontSize: 'var(--fs-13)' }}>{fmt(value)} / {fmt(target)} g</span>
    </div>
  );
}

export function Segmented({ value, options, onChange, label }) {
  return (
    <div class="segmented" role="group" aria-label={label}>
      {options.map(o => <button type="button" aria-pressed={value === o.value} onClick={() => { haptic(8); onChange(o.value); }}>{o.icon}{o.label}</button>)}
    </div>
  );
}

const toText = (v, dec) => (v === '' || v == null || Number.isNaN(v)) ? '' : String(Math.round(v * 10 ** dec) / 10 ** dec).replace('.', getLang() === 'el' ? ',' : '.');

/**
 * Text input that accepts "72,5" and "72.5". Reports a number, or '' when empty/invalid.
 * What is shown is derived (no effects, so no timing races when typing fast): the user's own text is kept
 * while it still means the same number as `value` (within the field's precision); if `value` was changed from
 * outside (unit switch, reset), the formatted value is shown instead.
 */
export function NumberField({ label, value, unit, onInput, hint, decimals = 1, placeholder }) {
  const [txt, setTxt] = useState(toText(value, decimals));
  const empty = value === '' || value == null || Number.isNaN(value);
  const parsed = parseNum(txt);
  const same = empty ? !Number.isFinite(parsed) : Number.isFinite(parsed) && Math.abs(parsed - value) <= 0.5 * 10 ** -decimals + 1e-9;
  const shown = same ? txt : toText(value, decimals);
  const change = e => { const raw = e.currentTarget.value; setTxt(raw); const n = parseNum(raw); onInput(Number.isFinite(n) ? n : ''); };
  return (
    <label class="field">
      {label && <span class="field__label">{label}</span>}
      <span class="input-wrap">
        <input type="text" inputMode="decimal" autoComplete="off" placeholder={placeholder} value={shown} onInput={change} aria-invalid={shown !== '' && empty} />
        {unit && <span class="unit">{unit}</span>}
      </span>
      {hint && <span class="field__hint">{hint}</span>}
    </label>
  );
}

export function TextField({ label, value, onInput, hint, placeholder, type = 'text', multiline }) {
  return (
    <label class="field">
      {label && <span class="field__label">{label}</span>}
      <span class="input-wrap" style={multiline ? { height: 'auto', padding: 'var(--s-2) var(--s-3)' } : undefined}>
        {multiline
          ? <textarea rows={2} class="textarea" placeholder={placeholder} value={value} onInput={e => onInput(e.currentTarget.value)} />
          : <input type={type} autoComplete="off" spellcheck={false} placeholder={placeholder} value={value} onInput={e => onInput(e.currentTarget.value)} />}
      </span>
      {hint && <span class="field__hint">{hint}</span>}
    </label>
  );
}

export function SelectField({ label, value, options, onChange, hint }) {
  return (
    <label class="field">
      {label && <span class="field__label">{label}</span>}
      <span class="input-wrap"><select value={value} onChange={e => onChange(e.currentTarget.value)}>{options.map(o => <option value={o.value}>{o.label}</option>)}</select></span>
      {hint && <span class="field__hint">{hint}</span>}
    </label>
  );
}

export function Option({ title, sub, selected, onClick }) {
  return (
    <button type="button" class="option" aria-pressed={selected} onClick={onClick}>
      <span><span class="option__title">{title}</span><br /><span class="option__sub">{sub}</span></span>
      {selected && <Check class="option__check" size={20} strokeWidth={2.25} />}
    </button>
  );
}

export function Notice({ children, info }) {
  return <div class={`notice ${info ? 'notice--info' : ''}`} role="status"><AlertTriangle size={16} strokeWidth={2} /><span>{children}</span></div>;
}

/** Bottom sheet dialog. Closes on backdrop tap and on Escape. */
export function Sheet({ title, sub, onClose, children }) {
  useEffect(() => { const h = e => e.key === 'Escape' && onClose(); addEventListener('keydown', h); return () => removeEventListener('keydown', h); }, []);
  return (<>
    <div class="sheet-backdrop" onClick={onClose} />
    <div class="sheet" role="dialog" aria-modal="true" aria-label={title}>
      <div class="sheet__grip" />
      <div class="between">
        <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 'var(--fs-20)' }}>{title}</div>{sub && <div class="eyebrow num">{sub}</div>}</div>
        <button class="icon-btn" aria-label={t('common.close')} onClick={onClose} style={{ marginRight: -10, marginTop: -6 }}><X size={20} /></button>
      </div>
      {children}
    </div>
  </>);
}

export function Toggle({ label, sub, checked, onChange, disabled }) {
  return (
    <button type="button" class="toggle-row" role="switch" aria-checked={checked} disabled={disabled} onClick={() => { haptic(10); onChange(!checked); }}>
      <span class="toggle-row__text"><span class="toggle-row__label">{label}</span>{sub && <span class="toggle-row__sub">{sub}</span>}</span>
      <span class="switch" aria-hidden="true"><i /></span>
    </button>
  );
}

export function Banner({ icon, children, action, onAction, onDismiss }) {
  return (
    <div class="banner" role="status">
      {icon}<span class="banner__text">{children}</span>
      {action && <button class="btn btn--ghost banner__btn" onClick={onAction}>{action}</button>}
      {onDismiss && <button class="icon-btn" style={{ width: 32, height: 32 }} aria-label={t('common.dismiss')} onClick={onDismiss}><X size={16} /></button>}
    </div>
  );
}

const dayNum = iso => Math.round(Date.parse(iso + 'T00:00:00Z') / 86400000);
/**
 * Small dependency-free SVG line chart.
 * series: [{kind:'dots'|'line', points:[{date, y}]}], goal: number|undefined, fmtY(n)
 */
export function LineChart({ series, goal, fmtY = n => fmt1(n), height = 180, label }) {
  const W = 320, H = height, P = { l: 40, r: 10, t: 10, b: 22 };
  const pts = series.flatMap(s => s.points); if (!pts.length) return null;
  let ys = pts.map(p => p.y); if (goal != null) ys = ys.concat(goal);
  let lo = Math.min(...ys), hi = Math.max(...ys); const pad = Math.max((hi - lo) * 0.15, 0.4); lo -= pad; hi += pad;
  const xs = pts.map(p => dayNum(p.date)); const x0 = Math.min(...xs), x1 = Math.max(...xs, x0 + 1);
  const X = d => P.l + ((dayNum(d) - x0) / (x1 - x0)) * (W - P.l - P.r), Y = y => P.t + (1 - (y - lo) / (hi - lo)) * (H - P.t - P.b);
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];
  const short = d => new Date(d + 'T12:00:00').toLocaleDateString(getLang() === 'el' ? 'el-GR' : 'en-GB', { day: 'numeric', month: 'short' });
  const first = pts.reduce((a, p) => (p.date < a ? p.date : a), pts[0].date), last = pts.reduce((a, p) => (p.date > a ? p.date : a), pts[0].date);
  return (
    <svg class="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {ticks.map(v => <g><line class="chart__grid" x1={P.l} x2={W - P.r} y1={Y(v)} y2={Y(v)} /><text class="chart__tick" x={P.l - 6} y={Y(v) + 4} text-anchor="end">{fmtY(v)}</text></g>)}
      {goal != null && <line class="chart__goal" x1={P.l} x2={W - P.r} y1={Y(goal)} y2={Y(goal)} />}
      {series.map(s => s.kind === 'line'
        ? <polyline class="chart__line" fill="none" points={s.points.map(p => `${X(p.date)},${Y(p.y)}`).join(' ')} />
        : s.points.map(p => <circle class="chart__dot" cx={X(p.date)} cy={Y(p.y)} r="3" />))}
      <text class="chart__tick" x={P.l} y={H - 4}>{short(first)}</text>
      <text class="chart__tick" x={W - P.r} y={H - 4} text-anchor="end">{short(last)}</text>
    </svg>
  );
}
