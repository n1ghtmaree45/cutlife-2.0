// Opt-in LOCAL reminders (no push server, so no account and $0). They fire when the app is open or
// resumes, and also from the service worker via Periodic Background Sync where Chrome allows it
// (installed PWA). On Samsung, set Cutline's battery use to "Unrestricted" for reliable timing.
import * as db from '../data/db';
import { t } from '../i18n';

export type Perm = 'granted' | 'denied' | 'default' | 'unsupported';
export const permission = (): Perm => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

/** Only ever called from a user toggle: nothing is requested at first launch. */
export async function requestPermission(): Promise<Perm> {
  if (typeof Notification === 'undefined') return 'unsupported';
  const p = await Notification.requestPermission();
  if (p === 'granted') registerPeriodic();
  return p;
}
async function registerPeriodic() {
  try { const reg: any = await navigator.serviceWorker?.ready; await reg?.periodicSync?.register('cutline-reminders', { minInterval: 3600 * 1000 }); } catch { /* not allowed or unsupported */ }
}

const FIRED = 'ct.reminders.fired';
const firedMap = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(FIRED) || '{}'); } catch { return {}; } };
const markFired = (k: string, day: string) => { const m = firedMap(); m[k] = day; try { localStorage.setItem(FIRED, JSON.stringify(m)); } catch { /* ignore */ } };
const hm = (s: string) => { const [h, m] = s.split(':').map(Number); return (h || 0) * 60 + (m || 0); };

export interface Due { key: 'weigh' | 'meal' | 'backup'; title: string; body: string; url: string; }

/** Which reminders should fire right now? Each fires at most once per day. */
export async function dueReminders(now = new Date()): Promise<Due[]> {
  const s = await db.getSettings(); const n = s.notifications; if (!n?.enabled) return [];
  const today = db.todayISO(now), mins = now.getHours() * 60 + now.getMinutes(), fired = firedMap(), out: Due[] = [];
  if (fired.weigh !== today && mins >= hm(n.weighTime || '08:00') && !(await db.listWeights()).some(w => w.date === today))
    out.push({ key: 'weigh', title: t('notif.weigh.title'), body: t('notif.weigh.body'), url: './#/weight?add=1' });
  if (fired.meal !== today && mins >= hm(n.mealTime || '13:00') && (await db.getLogsByDate(today)).length === 0)
    out.push({ key: 'meal', title: t('notif.meal.title'), body: t('notif.meal.body'), url: './#/log' });
  if (n.backup && fired.backup !== today && mins >= 19 * 60 && (!s.lastBackupAt || Date.now() - s.lastBackupAt > 7 * 86400000))
    out.push({ key: 'backup', title: t('notif.backup.title'), body: t('notif.backup.body'), url: './#/settings' });
  return out;
}

export async function fireDue() {
  if (permission() !== 'granted') return;
  const reg = await navigator.serviceWorker?.getRegistration(); if (!reg) return;
  const today = db.todayISO();
  for (const d of await dueReminders()) {
    await reg.showNotification(d.title, { body: d.body, tag: `cutline-${d.key}`, icon: './icons/icon-192.png', badge: './icons/favicon-48.png', data: { url: d.url } });
    markFired(d.key, today);
  }
}

/** Start the in-app scheduler: check now, on resume and every minute while the app is open. */
export function startReminderLoop() {
  const tick = () => { fireDue().catch(() => {}); };
  tick();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });
  return window.setInterval(tick, 60000);
}
