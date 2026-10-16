import { exportAll, importAll, resetAll } from '../data/db';
import type { ExportBundle } from '../types';

/** One JSON snapshot per user (never contains API keys or progress photos). */
export interface RemoteRow { data: ExportBundle; version: number; updated_at: string }
export class ConflictError extends Error { constructor() { super('Remote changed during sync'); } }
export interface Remote {
  get(): Promise<RemoteRow | null>;
  /** Writes only if the stored version is still `expectedVersion` (null = no row yet). Returns the new version. Throws ConflictError otherwise. */
  put(data: ExportBundle, expectedVersion: number | null): Promise<number>;
}
export interface SyncState { hash: string; version: number }
export interface StateStore { load(): SyncState | null; save(s: SyncState): void }
export type SyncResult = 'noop' | 'pushed' | 'pulled' | 'merged';

const stable = (v: unknown): string => Array.isArray(v) ? `[${v.map(stable).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v as object).sort().map(k => `${JSON.stringify(k)}:${stable((v as any)[k])}`).join(',')}}`
  : JSON.stringify(v) ?? 'null';

/** Content hash that ignores the export timestamp, so "did anything change locally?" is exact. */
export async function hashBundle(b: ExportBundle): Promise<string> {
  const { exportedAt: _e, ...rest } = b;
  const bytes = new TextEncoder().encode(stable(rest));
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...d].map(x => x.toString(16).padStart(2, '0')).join('');
}

const snapshot = () => exportAll(false, false); // keys stripped, photos excluded

async function once(remote: Remote, store: StateStore): Promise<SyncResult> {
  const row = await remote.get();
  const local = await snapshot(); const h = await hashBundle(local);
  const st = store.load();

  if (!row) { const v = await remote.put(local, null); store.save({ hash: h, version: v }); return 'pushed'; }

  if (st && st.version === row.version) { // remote untouched since our last sync
    if (st.hash === h) return 'noop';
    const v = await remote.put(local, row.version); store.save({ hash: h, version: v }); return 'pushed';
  }

  if (st && st.hash === h) { // only remote changed: take it as is (propagates deletions)
    await importAll(row.data, 'replace');
    store.save({ hash: await hashBundle(await snapshot()), version: row.version }); return 'pulled';
  }

  // Both changed, or first sync on this device: merge remote into local, local profile/settings win when newer.
  const incoming: ExportBundle = { ...row.data };
  if (local.profile && (!incoming.profile || local.profile.updatedAt >= incoming.profile.updatedAt)) delete incoming.profile;
  if (local.settings) delete incoming.settings;
  await importAll(incoming, 'merge');
  const merged = await snapshot();
  const v = await remote.put(merged, row.version); store.save({ hash: await hashBundle(merged), version: v });
  return 'merged';
}

/** Retries once when another device wrote between our read and our write. */
export async function syncNow(remote: Remote, store: StateStore): Promise<SyncResult> {
  try { return await once(remote, store); }
  catch (e) { if (e instanceof ConflictError) return once(remote, store); throw e; }
}

/** A different account signing in on the same device must not inherit the previous account's data. */
export async function claimDevice(userId: string, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): Promise<boolean> {
  const prev = storage.getItem('ct.owner'); let wiped = false;
  if (prev && prev !== userId) { await resetAll(); wiped = true; }
  storage.setItem('ct.owner', userId); return wiped;
}

export const localStateStore = (userId: string, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): StateStore => ({
  load() { try { return JSON.parse(storage.getItem(`ct.sync.${userId}`) ?? 'null'); } catch { return null; } },
  save(s) { try { storage.setItem(`ct.sync.${userId}`, JSON.stringify(s)); } catch { /* ignore */ } },
});
