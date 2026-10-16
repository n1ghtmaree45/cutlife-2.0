import { useEffect, useRef, useState } from 'preact/hooks';
import { Download, Upload, Trash2, Pencil, HardDrive, ShieldCheck, BellRing, RefreshCw, LogOut } from 'lucide-preact';
import { Segmented, TextField, SelectField, Toggle, Sheet, Notice, NumberField } from '../components/ui.jsx';
import { getSettings, saveSettings, saveKey, clearKeys, exportJsonFile, exportCsvFile, importFile, resetEverything, downloadBlob, storageEstimate, DEFAULT_MODELS, PROVIDER_LABEL, DEFAULT_WATER_GOAL_ML } from '../services/index.js';
import { t, num, dateLabel, getLang } from '../../i18n';
import { requestPermission, permission } from '../../lib/reminders';
import { haptic } from '../../lib/haptics';
import { cloudEnabled, currentUser, signOut, sync, getSyncStatus } from '../../cloud';

const PROVIDERS = ['gemini', 'groq', 'openrouter'];
const Section = ({ title, children, note }) => <section class="stack stack--sm"><h2 class="h-section">{title}</h2><div class="card stack">{children}</div>{note && <span class="field__hint">{note}</span>}</section>;

export function Settings({ profile, toast, theme, setTheme, onLang }) {
  const [s, setS] = useState(null);
  const [keys, setKeys] = useState({ gemini: '', groq: '', openrouter: '', usda: '' });
  const [models, setModels] = useState({});
  const [perm, setPerm] = useState(permission());
  const [photos, setPhotos] = useState(false);
  const [est, setEst] = useState(null); const [persisted, setPersisted] = useState(null);
  const [confirm, setConfirm] = useState(null); // 'reset' | {file}
  const [importErr, setImportErr] = useState(null);
  const file = useRef(null);
  const [email, setEmail] = useState(''); const [sy, setSy] = useState(getSyncStatus());
  useEffect(() => {
    if (!cloudEnabled) return;
    currentUser().then(u => setEmail(u?.email || '')).catch(() => {});
    const h = e => setSy(e.detail); addEventListener('cutline:sync', h); return () => removeEventListener('cutline:sync', h);
  }, []);

  const load = async () => { const x = await getSettings(); setS(x); setKeys({ gemini: x.apiKeys.gemini || '', groq: x.apiKeys.groq || '', openrouter: x.apiKeys.openrouter || '', usda: x.apiKeys.usda || '' }); setModels(x.models || {}); };
  useEffect(() => { load(); storageEstimate().then(setEst); navigator.storage?.persisted?.().then(setPersisted); }, []);
  if (!s) return <main class="page" />;
  const patch = async p => { const n = await saveSettings(p); setS(n); return n; };
  const n = s.notifications || { enabled: false, weighTime: '08:00', mealTime: '13:00', backup: true };
  const fasting = s.fasting || { enabled: false, targetH: 16 };
  const mb = b => num(b / 1048576, b > 1e9 ? 0 : 1);

  const toggleNotif = async on => {
    if (!on) return patch({ notifications: { ...n, enabled: false } });
    const p = await requestPermission(); setPerm(p);
    if (p === 'granted') { await patch({ notifications: { ...n, enabled: true } }); toast(t('notif.on')); }
  };
  const saveAi = async () => {
    for (const id of [...PROVIDERS, 'usda']) await saveKey(id, keys[id] || '');
    const m = {}; for (const id of PROVIDERS) if ((models[id] || '').trim()) m[id] = models[id].trim();
    await patch({ models: m }); await load(); haptic(15); toast(t('common.saved'));
  };
  const keysDirty = [...PROVIDERS, 'usda'].some(id => (keys[id] || '') !== (s.apiKeys[id] || '')) || PROVIDERS.some(id => (models[id] || '') !== ((s.models || {})[id] || ''));

  const doExport = async () => { const r = await exportJsonFile({ photos }); downloadBlob(r.blob, r.name); haptic(15); toast(t('data.exported')); await load(); };
  const doCsv = async k => { const r = await exportCsvFile(k); downloadBlob(r.blob, r.name); toast(t('data.exported')); };
  const pickFile = e => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) { setImportErr(null); setConfirm({ file: f }); } };
  const doImport = async () => {
    const f = confirm.file; setConfirm(null);
    try { await importFile(f); haptic(15); toast(t('data.imported')); await load(); } catch (e) { setImportErr(e.message || t('err.import_json')); }
  };
  const doReset = async () => { await resetEverything(); location.hash = '#/onboarding'; location.reload(); };

  return (
    <main class="page">
      <div class="topbar"><div class="topbar__title">{t('set.title')}</div></div>

      <Section title={t('set.profile')}>
        <div class="stat"><span class="stat__k">{t('set.target')}</span><span class="stat__v num">{num(profile.targets.kcal)} kcal</span></div>
        <div class="stat"><span class="stat__k">{t('m.protein')}</span><span class="stat__v num">{profile.targets.protein} g</span></div>
        <a class="btn btn--secondary btn--block" href="#/onboarding?step=1"><Pencil size={16} />{t('set.edit_profile')}</a>
        <span class="field__hint">{t('set.edit_note')}</span>
      </Section>

      <Section title={t('set.appearance')}>
        <div class="field"><span class="field__label">{t('set.language')}</span>
          <Segmented label={t('set.language')} value={getLang()} onChange={async l => { await patch({ lang: l }); onLang(); }} options={[{ value: 'en', label: 'English' }, { value: 'el', label: 'Ελληνικά' }]} /></div>
        <div class="field"><span class="field__label">{t('set.units')}</span>
          <Segmented label={t('set.units')} value={s.units} onChange={u => patch({ units: u })} options={[{ value: 'kg', label: 'kg · cm' }, { value: 'lb', label: 'lb · in' }]} /></div>
        <div class="field"><span class="field__label">{t('set.theme')}</span>
          <Segmented label={t('set.theme')} value={theme} onChange={x => { setTheme(x); setS({ ...s, theme: x }); }} options={[{ value: 'system', label: t('set.theme_system') }, { value: 'light', label: t('set.theme_light') }, { value: 'dark', label: t('set.theme_dark') }]} /></div>
        <div class="divided"><Toggle label={t('set.haptics')} sub={t('set.haptics_sub')} checked={s.haptics !== false} onChange={v => patch({ haptics: v })} /></div>
      </Section>

      <Section title={t('set.daily')}>
        <NumberField label={t('set.water_goal')} unit="ml" decimals={0} value={s.waterGoalMl || DEFAULT_WATER_GOAL_ML} onInput={v => v > 0 && patch({ waterGoalMl: Math.round(v) })} />
        <div class="divided">
          <Toggle label={t('set.fasting')} sub={t('set.fasting_sub')} checked={fasting.enabled} onChange={v => patch({ fasting: { ...fasting, enabled: v, startedAt: v ? fasting.startedAt : undefined } })} />
        </div>
        {fasting.enabled && <SelectField label={t('set.fasting_target')} value={String(fasting.targetH)} onChange={v => patch({ fasting: { ...fasting, targetH: Number(v) } })} options={[12, 14, 16, 18, 20, 24].map(h => ({ value: String(h), label: `${h} h` }))} />}
      </Section>

      <Section title={t('set.reminders')} note={t('notif.note')}>
        <div class="divided"><Toggle label={t('notif.enable')} sub={t('notif.enable_sub')} checked={n.enabled && perm === 'granted'} onChange={toggleNotif} disabled={perm === 'unsupported'} /></div>
        {perm === 'denied' && <Notice>{t('notif.blocked')}</Notice>}
        {perm === 'unsupported' && <Notice info>{t('notif.unsupported')}</Notice>}
        {n.enabled && perm === 'granted' && <>
          <div class="row">
            <label class="field"><span class="field__label">{t('notif.weigh_time')}</span><span class="input-wrap"><input type="time" value={n.weighTime} onInput={e => e.currentTarget.value && patch({ notifications: { ...n, weighTime: e.currentTarget.value } })} /></span></label>
            <label class="field"><span class="field__label">{t('notif.meal_time')}</span><span class="input-wrap"><input type="time" value={n.mealTime} onInput={e => e.currentTarget.value && patch({ notifications: { ...n, mealTime: e.currentTarget.value } })} /></span></label>
          </div>
          <div class="divided"><Toggle label={t('notif.backup')} checked={n.backup} onChange={v => patch({ notifications: { ...n, backup: v } })} /></div>
        </>}
      </Section>

      <Section title={t('set.ai')} note={t('set.ai_note')}>
        <SelectField label={t('set.provider')} value={s.provider} onChange={v => patch({ provider: v })} options={PROVIDERS.map(p => ({ value: p, label: PROVIDER_LABEL[p] }))} />
        <SelectField label={t('set.fallback')} value={s.fallbackProvider || ''} onChange={v => patch({ fallbackProvider: v || undefined })} options={[{ value: '', label: t('set.none') }, ...PROVIDERS.filter(p => p !== s.provider).map(p => ({ value: p, label: PROVIDER_LABEL[p] }))]} />
        {PROVIDERS.map(id => <div class="stack stack--sm">
          <TextField type="password" label={`${PROVIDER_LABEL[id]} ${t('set.api_key')}`} value={keys[id]} onInput={v => setKeys({ ...keys, [id]: v })} placeholder={t('set.paste_key')} />
          <TextField label={t('set.model')} value={models[id] || ''} onInput={v => setModels({ ...models, [id]: v })} placeholder={DEFAULT_MODELS[id]} hint={id === 'groq' ? t('set.model_groq') : id === 'openrouter' ? t('set.model_or') : undefined} />
        </div>)}
        <TextField type="password" label={t('set.usda_key')} value={keys.usda} onInput={v => setKeys({ ...keys, usda: v })} placeholder={t('set.paste_key')} hint={t('set.usda_hint')} />
        <a class="link small" href="https://fdc.nal.usda.gov/api-key-signup" target="_blank" rel="noopener noreferrer">{t('err.get_key')}</a>
        <button class="btn btn--primary btn--block" disabled={!keysDirty} onClick={saveAi}>{t('set.save_keys')}</button>
        <button class="btn btn--danger btn--block" onClick={async () => { await clearKeys(); await load(); toast(t('set.keys_cleared')); }}><Trash2 size={16} />{t('set.clear_keys')}</button>
        <div class="hstack small muted"><ShieldCheck size={16} />{t('set.keys_local')}</div>
      </Section>

      {cloudEnabled && <Section title={t('set.account')} note={t('acct.note')}>
        {email && <div class="stat"><span class="stat__k">{t('acct.signed_in')}</span><span class="stat__v">{email}</span></div>}
        <div class="stat"><span class="stat__k">{t('acct.last_sync')}</span><span class="stat__v num">{sy.state === 'syncing' ? t('acct.syncing') : sy.at && sy.state !== 'error' ? new Date(sy.at).toLocaleTimeString(getLang() === 'el' ? 'el-GR' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) : t('data.never')}</span></div>
        {sy.state === 'error' && <Notice>{t('acct.sync_fail', { msg: sy.error })}</Notice>}
        <button class="btn btn--secondary btn--block" disabled={sy.state === 'syncing'} onClick={async () => { await sync(); if (getSyncStatus().state === 'ok') toast(t('acct.sync_ok')); }}><RefreshCw size={16} />{t('acct.sync_now')}</button>
        <button class="btn btn--secondary btn--block" onClick={() => signOut()}><LogOut size={16} />{t('acct.signout')}</button>
      </Section>}

      <Section title={t('set.data')}>
        <div class="stat"><span class="stat__k">{t('data.last_backup')}</span><span class="stat__v num">{s.lastBackupAt ? dateLabel(new Date(s.lastBackupAt).toISOString().slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' }) : t('data.never')}</span></div>
        <div class="divided"><Toggle label={t('data.include_photos')} sub={t('data.include_photos_sub')} checked={photos} onChange={setPhotos} /></div>
        <button class="btn btn--primary btn--block" onClick={doExport}><Download size={18} />{t('data.export_json')}</button>
        <div class="row">
          <button class="btn btn--secondary btn--sm" onClick={() => doCsv('logs')}><Download size={16} />{t('data.csv_logs')}</button>
          <button class="btn btn--secondary btn--sm" onClick={() => doCsv('weights')}><Download size={16} />{t('data.csv_weights')}</button>
        </div>
        <span class="field__hint">{t('data.csv_note')}</span>
        <button class="btn btn--secondary btn--block" onClick={() => file.current.click()}><Upload size={18} />{t('data.import')}</button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={pickFile} />
        {importErr && <Notice>{importErr}</Notice>}
        {est && est.quota > 0 && <div class="hstack small muted num"><HardDrive size={16} />{t('data.storage', { used: mb(est.usage), quota: mb(est.quota) })}{persisted === false ? ` · ${t('data.not_persisted')}` : persisted ? ` · ${t('data.persisted')}` : ''}</div>}
        <button class="btn btn--danger btn--block" onClick={() => setConfirm('reset')}><Trash2 size={16} />{t('data.reset')}</button>
      </Section>

      {confirm === 'reset' && <Sheet title={t('data.reset_q')} sub={t('data.reset_note')} onClose={() => setConfirm(null)}>
        <button class="btn btn--secondary btn--block" onClick={doExport}><Download size={16} />{t('data.export_first')}</button>
        <button class="btn btn--danger btn--block" onClick={doReset}><Trash2 size={16} />{t('data.reset_confirm')}</button>
      </Sheet>}
      {confirm?.file && <Sheet title={t('data.import_q')} sub={confirm.file.name} onClose={() => setConfirm(null)}>
        <p class="muted">{t('data.import_note')}</p>
        <button class="btn btn--primary btn--block" onClick={doImport}>{t('data.import_confirm')}</button>
      </Sheet>}

      <p class="field__hint" style={{ textAlign: 'center' }}>Cutline {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''}</p>
    </main>
  );
}
