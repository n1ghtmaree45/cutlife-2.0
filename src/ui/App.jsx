import { useEffect, useRef, useState } from 'preact/hooks';
import { Check } from 'lucide-preact';
import { Onboarding } from './screens/Onboarding.jsx';
import { Dashboard } from './screens/Dashboard.jsx';
import { LogFood } from './screens/LogFood.jsx';
import { Weight } from './screens/Weight.jsx';
import { Ideas } from './screens/Ideas.jsx';
import { Plan } from './screens/Plan.jsx';
import { Settings } from './screens/Settings.jsx';
import { Login } from './screens/Login.jsx';
import { TabBar } from './components/TabBar.jsx';
import { getProfile, getTheme, setTheme, applyStoredSettings } from './services/index.js';
import { getLang, t } from '../i18n';
import { startReminderLoop } from '../lib/reminders';
import { cloudEnabled, hasStoredSession, currentUser, onSignedIn, onSignedOut, startAutoSync } from '../cloud';

const parse = () => { const [path, qs = ''] = (location.hash.slice(1) || '/').split('?'); return { path, params: new URLSearchParams(qs) }; };
const sysDark = () => matchMedia('(prefers-color-scheme: dark)').matches;

export function App() {
  const [route, setRoute] = useState(parse());
  const [profile, setProfile] = useState(undefined);
  const [theme, setThemeState] = useState(getTheme());
  const [msg, setMsg] = useState(null);
  const [update, setUpdate] = useState(null);
  const [authed, setAuthed] = useState(() => !cloudEnabled || hasStoredSession()); // stored session = usable offline
  const toastTimer = useRef(null); // a ref: the toast function is re-created each render, so a property on it would lose the timer
  const [rev, setRev] = useState(0); // bumped on language change so every screen re-renders with the new strings
  useEffect(() => { const h = e => setUpdate(() => e.detail); addEventListener('cutline:update', h); return () => removeEventListener('cutline:update', h); }, []);
  const dark = theme === 'dark' || (theme === 'system' && sysDark());

  const reloadProfile = async () => setProfile(await getProfile());
  useEffect(() => {
    if (!cloudEnabled) return;
    const refresh = async () => { await reloadProfile(); setRev(r => r + 1); };
    addEventListener('cutline:data-changed', refresh);
    const off = onSignedOut(() => setAuthed(false));
    currentUser().then(u => { if (u) { startAutoSync(); onSignedIn(u.id); } }).catch(() => {});
    return () => { removeEventListener('cutline:data-changed', refresh); off(); };
  }, []);
  useEffect(() => {
    const h = () => setRoute(parse()); addEventListener('hashchange', h);
    const before = getLang();
    applyStoredSettings().then(s => {
      if (s.theme) setThemeState(s.theme);
      document.documentElement.lang = getLang();
      if (getLang() !== before) setRev(r => r + 1); // remount only if the saved language differs from what is on screen, never mid-form
    });
    getProfile().then(p => { setProfile(p); startReminderLoop(); });
    return () => removeEventListener('hashchange', h);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.querySelectorAll('meta[name=theme-color]').forEach(m => m.setAttribute('content', dark ? '#0e1113' : '#1B5E20'));
  }, [dark]);
  const toast = m => { setMsg(m); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setMsg(null), 2400); };
  const applyTheme = th => { setTheme(th); setThemeState(th); };
  const toggleTheme = () => applyTheme(dark ? 'light' : 'dark');
  const relang = () => { document.documentElement.lang = getLang(); setRev(r => r + 1); };

  if (profile === undefined) return null;
  if (!authed) return <div class="app" key={rev}><Login onDone={async u => { await onSignedIn(u.id); startAutoSync(); await reloadProfile(); setRev(r => r + 1); setAuthed(true); }} /></div>;
  const { path, params } = route;
  if (!profile || path === '/onboarding')
    return <div class="app" key={rev}><Onboarding existing={profile} initialStep={Number(params.get('step') || 0)} onDone={async () => { await reloadProfile(); location.hash = profile ? '#/settings' : '#/'; }} /></div>;

  let screen;
  if (path === '/log') screen = <LogFood key={location.hash} meal={params.get('meal')} mode={params.get('mode')} date={params.get('d')} toast={toast} initialQuery={params.get('q') || ''} openFirst={params.has('open')} />;
  else if (path === '/weight') screen = <Weight profile={profile} reloadProfile={reloadProfile} toast={toast} focusAdd={params.has('add')} />;
  else if (path === '/ideas') screen = <Ideas profile={profile} toast={toast} />;
  else if (path === '/plan') screen = <Plan profile={profile} toast={toast} />;
  else if (path === '/settings') screen = <Settings profile={profile} toast={toast} theme={theme} setTheme={applyTheme} onLang={relang} />;
  else screen = <Dashboard profile={profile} dark={dark} toggleTheme={toggleTheme} toast={toast} date={params.get('d')} />;

  return (
    <div class="app" key={rev}>
      {screen}
      <TabBar route={path} />
      {update && <div class="toast" role="status">{t('update.ready')}<button class="btn btn--ghost" style={{ height: 32, color: 'inherit', textDecoration: 'underline' }} onClick={update}>{t('update.reload')}</button></div>}
      {msg && <div class="toast" role="status"><Check size={16} />{msg}</div>}
    </div>
  );
}
