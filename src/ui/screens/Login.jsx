import { useState } from 'preact/hooks';
import { LogIn } from 'lucide-preact';
import { TextField, Notice } from '../components/ui.jsx';
import { signIn, signUp } from '../../cloud';
import { t } from '../../i18n';
import { haptic } from '../../lib/haptics';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Login({ onDone }) {
  const [mode, setMode] = useState('in');
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null); const [info, setInfo] = useState(null);
  const up = mode === 'up';

  const submit = async e => {
    e.preventDefault(); setErr(null); setInfo(null);
    if (!EMAIL.test(email.trim())) return setErr(t('acct.err_email'));
    if (up && pw.length < 8) return setErr(t('acct.err_short'));
    setBusy(true);
    try {
      if (up) {
        const r = await signUp(email, pw);
        if (r.needsConfirm) { setInfo(t('acct.confirm')); setMode('in'); setPw(''); return; }
      }
      const user = await signIn(email, pw); haptic(15); await onDone(user);
    } catch (x) { setErr(x?.code === 'invalid_credentials' ? t('acct.err_creds') : t('acct.err_generic')); }
    finally { setBusy(false); }
  };

  return (
    <main class="page page--flow">
      <div class="hero" style={{ paddingTop: 'var(--s-12)' }}>
        <span class="eyebrow">Cutline</span>
        <h1>{t('acct.title')}</h1>
        <p>{t('acct.sub')}</p>
      </div>
      <form class="stack" onSubmit={submit} noValidate>
        <div class="card stack">
          <TextField type="email" autoComplete="email" label={t('acct.email')} value={email} onInput={setEmail} />
          <TextField type="password" autoComplete={up ? 'new-password' : 'current-password'} label={t('acct.password')} value={pw} onInput={setPw} hint={up ? t('acct.pw_hint') : undefined} />
        </div>
        {err && <Notice>{err}</Notice>}
        {info && <Notice info>{info}</Notice>}
        <button class="btn btn--primary btn--block" type="submit" disabled={busy || !email || !pw}><LogIn size={18} />{up ? t('acct.signup') : t('acct.signin')}</button>
        <button class="btn btn--ghost btn--block" type="button" onClick={() => { setMode(up ? 'in' : 'up'); setErr(null); setInfo(null); }}>{up ? t('acct.to_signin') : t('acct.to_signup')}</button>
      </form>
    </main>
  );
}
