/* Cutline service worker: cache-first app shell, versioned cache, offline fallback,
 * local reminders (Periodic Background Sync) and notification taps.
 * VERSION is replaced at build time (see vite.config.ts), so every deploy gets a fresh cache
 * and clients see the "update available" toast. */
const VERSION = '__SW_VERSION__';
const CACHE = `cutline-shell-${VERSION}`;
const RUNTIME = `cutline-runtime-${VERSION}`;
const SCOPE = self.registration.scope; // works at root or any sub-path
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './offline.html'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(SHELL.map((p) => c.add(new URL(p, SCOPE)).catch(() => {})));
    // Precache the hashed JS/CSS the shell points at, so the very first offline cold start works
    // (otherwise they would only be cached after the page had been loaded a second time).
    try {
      const html = await (await c.match(new URL('./index.html', SCOPE))).text();
      const assets = [...html.matchAll(/(?:src|href)="(\.?\/?assets\/[^"]+)"/g)].map((m) => m[1]);
      await Promise.all(assets.map((a) => c.add(new URL(a.replace(/^\//, './'), SCOPE)).catch(() => {})));
    } catch { /* offline install: shell still works from navigations */ }
  })());
  // No skipWaiting here: the page asks the user, then posts SKIP_WAITING.
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('cutline-') && k !== CACHE && k !== RUNTIME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Never cache cross-origin calls (AI providers, Open Food Facts, USDA): they carry user API keys and live data.
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first so new deploys show up, cached shell offline.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) { const c = await caches.open(CACHE); c.put(new URL('./index.html', SCOPE), res.clone()); }
        return res;
      } catch {
        return (await caches.match(new URL('./index.html', SCOPE))) ||
               (await caches.match(new URL('./offline.html', SCOPE))) ||
               new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  // Static assets (Vite hashed files, icons): cache-first, fill runtime cache.
  event.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') { const c = await caches.open(RUNTIME); c.put(req, res.clone()); }
      return res;
    } catch { return new Response('', { status: 504 }); }
  })());
});

/* ---------------- notifications ---------------- */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || './', SCOPE).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if (c.url.startsWith(SCOPE)) { await c.focus(); if ('navigate' in c) { try { await c.navigate(target); } catch { /* cross-origin */ } } return; } }
    await self.clients.openWindow(target);
  })());
});

// Reminders while the app is closed (Chrome/Samsung installed PWA, Periodic Background Sync). Same rules as src/lib/reminders.ts.
const idb = (name, store, mode, fn) => new Promise((res, rej) => {
  const r = indexedDB.open(name);
  r.onupgradeneeded = () => { if (name === 'cutline-sw' && !r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv'); };
  r.onerror = () => rej(r.error);
  r.onsuccess = () => {
    const db = r.result;
    if (!db.objectStoreNames.contains(store)) { db.close(); return res(undefined); }
    const tx = db.transaction(store, mode); const out = fn(tx.objectStore(store));
    tx.oncomplete = () => { db.close(); res(out && 'result' in out ? out.result : undefined); };
    tx.onerror = () => { db.close(); rej(tx.error); };
  };
});
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const hm = (s) => { const [h, m] = String(s || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const T = { en: { w: ['Time to weigh in', "You haven't logged your weight today."], m: ['Log your meals', 'Nothing logged yet today.'], b: ['Back up your data', 'Export a backup so your data is safe.'] },
            el: { w: ['Ώρα για ζύγιση', 'Δεν έχεις καταγράψει το βάρος σου σήμερα.'], m: ['Καταγραφή γευμάτων', 'Δεν έχεις καταγράψει τίποτα σήμερα.'], b: ['Αντίγραφο ασφαλείας', 'Κάνε εξαγωγή αντιγράφου για να είναι ασφαλή τα δεδομένα σου.'] } };

async function runReminders() {
  if (self.Notification && Notification.permission !== 'granted') return;
  const s = await idb('calorie-app', 'settings', 'readonly', (st) => st.get('settings'));
  const n = s && s.notifications; if (!n || !n.enabled) return;
  const day = today(), now = new Date(), mins = now.getHours() * 60 + now.getMinutes();
  const fired = (await idb('cutline-sw', 'kv', 'readonly', (st) => st.get('fired'))) || {};
  const lang = (s.lang === 'el' || (!s.lang && /^el/i.test(self.navigator.language || ''))) ? 'el' : 'en';
  const due = [];
  if (fired.weigh !== day && mins >= hm(n.weighTime || '08:00')) {
    const w = await idb('calorie-app', 'weights', 'readonly', (st) => st.get(day));
    if (!w) due.push(['weigh', T[lang].w, './#/weight?add=1']);
  }
  if (fired.meal !== day && mins >= hm(n.mealTime || '13:00')) {
    const logs = await idb('calorie-app', 'logs', 'readonly', (st) => st.index('byDate').count(day));
    if (!logs) due.push(['meal', T[lang].m, './#/log']);
  }
  if (n.backup && fired.backup !== day && mins >= 19 * 60 && (!s.lastBackupAt || Date.now() - s.lastBackupAt > 7 * 86400000)) due.push(['backup', T[lang].b, './#/settings']);
  for (const [key, text, url] of due) {
    await self.registration.showNotification(text[0], { body: text[1], tag: `cutline-${key}`, icon: './icons/icon-192.png', badge: './icons/favicon-48.png', data: { url } });
    fired[key] = day;
  }
  if (due.length) await idb('cutline-sw', 'kv', 'readwrite', (st) => st.put(fired, 'fired'));
}
self.addEventListener('periodicsync', (event) => { if (event.tag === 'cutline-reminders') event.waitUntil(runReminders().catch(() => {})); });
