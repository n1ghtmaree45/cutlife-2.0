// Suggested registration + update flow for the Frontend bot (e.g. in src/main.tsx).
// Uses import.meta.env.BASE_URL so it works on GitHub Pages sub-paths.
export function registerSW(onUpdateReady) {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  // A page with no controller is a first visit: the new worker will claim it, and that must NOT trigger a reload
  // (it would wipe a first-time user's half-filled onboarding). Only reload when an update replaces a running worker.
  const hadController = !!navigator.serviceWorker.controller;
  window.addEventListener('load', async () => {
    const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
    const prompt = (w) => onUpdateReady(() => w.postMessage({ type: 'SKIP_WAITING' }));
    if (reg.waiting && navigator.serviceWorker.controller) prompt(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) prompt(w);
      });
    });
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController && !reloaded) { reloaded = true; location.reload(); }
    });
    if (navigator.storage?.persist) navigator.storage.persist();
  });
}
