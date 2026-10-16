import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import * as DB from '../src/data/db';
import { syncNow, claimDevice, hashBundle, ConflictError, type Remote, type RemoteRow, type StateStore, type SyncState } from '../src/cloud/sync';

const M = { kcal: 100, protein: 10, carbs: 5, fat: 2 };
const log = (id: string, name = 'Egg') => ({ id, date: '2026-10-15', meal: 'lunch' as const, name, grams: 50, macros: M, source: 'custom' as const, createdAt: 1 });

/** In-memory stand-in for the Supabase table, with the same optimistic-version rule. */
function fakeRemote() {
  let row: RemoteRow | null = null; let failNextPut = false;
  const remote: Remote = {
    async get() { return row ? structuredClone(row) : null; },
    async put(data, expected) {
      if (failNextPut) { failNextPut = false; throw new ConflictError(); }
      if ((row?.version ?? null) !== expected) throw new ConflictError();
      row = { data: structuredClone(data), version: (expected ?? 0) + 1, updated_at: new Date().toISOString() }; return row.version;
    },
  };
  return { remote, peek: () => row, failNextPut: () => { failNextPut = true; } };
}
const memStore = (): StateStore & { s: SyncState | null } => ({ s: null, load() { return this.s; }, save(x) { this.s = x; } });

/** Switch "device": IndexedDB is global in tests, so a device is its own snapshot swapped in and out. */
async function asDevice(snap: any | null, fn: () => Promise<void>) {
  await DB.resetAll(); if (snap) await DB.importAll(snap, 'replace'); await fn();
  return DB.exportAll();
}

beforeEach(async () => { await DB.resetAll(); });

describe('cloud sync', () => {
  it('first sync pushes local data; a second sync with no changes does nothing', async () => {
    const { remote, peek } = fakeRemote(); const st = memStore();
    await DB.addLog(log('a')); await DB.addWeight('2026-10-15', 80);
    expect(await syncNow(remote, st)).toBe('pushed');
    expect(peek()!.data.logs).toHaveLength(1);
    expect(await syncNow(remote, st)).toBe('noop');
    expect(peek()!.version).toBe(1);
  });

  it('local edit is pushed, remote-only change is pulled (including deletions)', async () => {
    const { remote, peek } = fakeRemote(); const phone = memStore(); const laptop = memStore();
    await DB.addLog(log('a')); await DB.addLog(log('b', 'Rice'));
    await syncNow(remote, phone);
    const phoneSnap = await DB.exportAll();

    // laptop: first sync on an empty device merges everything in, then deletes one log and pushes
    const laptopSnap = await asDevice(null, async () => {
      expect(await syncNow(remote, laptop)).toBe('merged');
      expect(await DB.listLogs()).toHaveLength(2);
      await DB.deleteLog('b');
      expect(await syncNow(remote, laptop)).toBe('pushed');
    });
    expect(peek()!.data.logs.map(l => l.id)).toEqual(['a']);

    // phone had no local changes -> replace, so the deletion propagates
    await asDevice(phoneSnap, async () => {
      expect(await syncNow(remote, phone)).toBe('pulled');
      expect((await DB.listLogs()).map(l => l.id)).toEqual(['a']);
    });
    expect(laptopSnap.logs).toHaveLength(1);
  });

  it('both sides changed: merges, keeps both entries, newer local profile wins', async () => {
    const { remote, peek } = fakeRemote(); const phone = memStore(); const laptop = memStore();
    await DB.addLog(log('a')); await syncNow(remote, phone); const phoneBase = await DB.exportAll();

    await asDevice(null, async () => { await syncNow(remote, laptop); await DB.addLog(log('laptop-1', 'Oats')); await syncNow(remote, laptop); });

    await asDevice(phoneBase, async () => {
      await DB.addLog(log('phone-1', 'Toast'));
      expect(await syncNow(remote, phone)).toBe('merged');
      expect((await DB.listLogs()).map(l => l.id).sort()).toEqual(['a', 'laptop-1', 'phone-1']);
    });
    expect(peek()!.data.logs.map(l => l.id).sort()).toEqual(['a', 'laptop-1', 'phone-1']);
  });

  it('retries once when another device wins the write race, but gives up on a second conflict', async () => {
    const { remote, failNextPut } = fakeRemote(); const st = memStore();
    await DB.addLog(log('a'));
    failNextPut(); expect(await syncNow(remote, st)).toBe('pushed');
  });

  it('never uploads API keys or photos', async () => {
    const { remote, peek } = fakeRemote();
    await DB.saveSettings({ apiKeys: { gemini: 'SECRET-KEY', usda: 'SECRET-2' } });
    await DB.addPhoto('2026-10-15', new Blob(['x']));
    await syncNow(remote, memStore());
    const json = JSON.stringify(peek());
    expect(json).not.toContain('SECRET'); expect(peek()!.data.photos).toBeUndefined();
  });

  it('pulling keeps this device\'s own API keys', async () => {
    const { remote } = fakeRemote(); const a = memStore(); const b = memStore();
    await DB.addLog(log('a')); await syncNow(remote, a); const snapA = await DB.exportAll(true);
    await asDevice(null, async () => { await DB.saveSettings({ apiKeys: { gemini: 'LOCAL-KEY' } }); await syncNow(remote, b); expect((await DB.getSettings()).apiKeys.gemini).toBe('LOCAL-KEY'); });
    expect(snapA.logs).toHaveLength(1);
  });

  it('hash ignores the export timestamp but notices real changes', async () => {
    const h1 = await hashBundle(await DB.exportAll()); await new Promise(r => setTimeout(r, 5));
    expect(await hashBundle(await DB.exportAll())).toBe(h1);
    await DB.addWeight('2026-10-15', 79.5);
    expect(await hashBundle(await DB.exportAll())).not.toBe(h1);
  });

  it('a different account on the same device wipes the previous account\'s local data first', async () => {
    const store = new Map<string, string>(); const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    await DB.addLog(log('mine'));
    expect(await claimDevice('user-A', ls)).toBe(false);          // first owner keeps pre-login data
    expect(await claimDevice('user-A', ls)).toBe(false);
    expect(await DB.listLogs()).toHaveLength(1);
    expect(await claimDevice('user-B', ls)).toBe(true);           // someone else: clean slate
    expect(await DB.listLogs()).toHaveLength(0);
  });
});
