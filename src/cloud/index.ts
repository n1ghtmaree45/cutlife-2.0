import { getClient, cloudEnabled } from './client';
import { ConflictError, claimDevice, localStateStore, syncNow, type Remote, type SyncResult } from './sync';

export { cloudEnabled, hasStoredSession } from './client';

export type SyncStatus = { state: 'idle' | 'syncing' | 'ok' | 'error'; at?: number; error?: string; result?: SyncResult };
let status: SyncStatus = { state: 'idle' };
export const getSyncStatus = () => status;
const emit = (s: SyncStatus) => { status = s; dispatchEvent(new CustomEvent('cutline:sync', { detail: s })); };

export async function currentUser() { const { data } = await getClient().auth.getSession(); return data.session?.user ?? null; }
export async function signIn(email: string, password: string) {
  const { data, error } = await getClient().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error; return data.user;
}
/** Returns `needsConfirm: true` when the project requires e-mail confirmation before the first sign-in. */
export async function signUp(email: string, password: string) {
  const { data, error } = await getClient().auth.signUp({ email: email.trim(), password });
  if (error) throw error; return { needsConfirm: !data.session };
}
export function onSignedOut(cb: () => void): () => void {
  if (!cloudEnabled) return () => {};
  const { data } = getClient().auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') cb(); });
  return () => data.subscription.unsubscribe();
}
export async function signOut() { await getClient().auth.signOut(); emit({ state: 'idle' }); }

function remoteFor(userId: string): Remote {
  const sb = getClient();
  return {
    async get() {
      const { data, error } = await sb.from('user_data').select('data,version,updated_at').eq('user_id', userId).maybeSingle();
      if (error) throw error; return data as any;
    },
    async put(bundle, expected) {
      if (expected === null) {
        const { error } = await sb.from('user_data').insert({ user_id: userId, data: bundle, version: 1 });
        if (error) { if (error.code === '23505') throw new ConflictError(); throw error; }
        return 1;
      }
      const { data, error } = await sb.from('user_data').update({ data: bundle, version: expected + 1 }).eq('user_id', userId).eq('version', expected).select('version');
      if (error) throw error;
      if (!data?.length) throw new ConflictError();
      return data[0].version as number;
    },
  };
}

let running: Promise<void> | null = null;
/** Safe to call from anywhere, any number of times: overlapping calls share one run. */
export function sync(): Promise<void> {
  if (!cloudEnabled) return Promise.resolve();
  if (running) return running;
  running = (async () => {
    try {
      const user = await currentUser(); if (!user) return;
      if (navigator.onLine === false) return;
      emit({ ...status, state: 'syncing' });
      const result = await syncNow(remoteFor(user.id), localStateStore(user.id));
      emit({ state: 'ok', at: Date.now(), result });
      if (result === 'pulled' || result === 'merged') dispatchEvent(new CustomEvent('cutline:data-changed'));
    } catch (e: any) { emit({ state: 'error', at: Date.now(), error: e?.message || 'Sync failed' }); }
    finally { running = null; }
  })();
  return running;
}

/** Call after a successful sign-in or when the app starts with a session. */
export async function onSignedIn(userId: string) { await claimDevice(userId); await sync(); }

let started = false;
export function startAutoSync() {
  if (started || !cloudEnabled) return; started = true;
  addEventListener('online', () => { void sync(); });
  document.addEventListener('visibilitychange', () => { void sync(); }); // on hide: push what changed; on show: pick up other devices
  setInterval(() => { if (document.visibilityState === 'visible') void sync(); }, 5 * 60 * 1000);
}
