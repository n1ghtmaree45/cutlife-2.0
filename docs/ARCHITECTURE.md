# Cutline: Architecture (QA & Deploy)

## Summary
- **Cutline**: a static PWA on **Vercel** (Hobby, free) at `https://$CUTLINE_DOMAIN/` (likely `cutline.vercel.app`), served from the root path. Code lives in the private repo `n1ghtmaree45/cutline`. `vercel.json` sets the headers. Accent `#1B5E20`, splash background `#0E1A10`.
- **Static PWA** built with Vite + Preact (TypeScript) and served from Vercel. It has no server and costs $0.
- **Data** lives in IndexedDB (via `idb`) and is owned by Backend in `src/data`. Stores: profile, foodLog, weights, customFoods, recipes, pantry, settings (API keys). Images are never stored.
- **Domain logic** in `src/lib/nutrition`: pure functions for BMR, TDEE, targets, moving average, rate and ETA. These are unit-tested with vitest.
- **External APIs** are called directly from the browser: Open Food Facts, USDA FDC (needs a user key), and the AI providers in `src/ai` (Gemini first, then Groq/OpenRouter as fallback), all behind one provider interface. User keys stay in IndexedDB and go only to the provider they belong to.
- **UI** lives in `src/ui` (Frontend). It uses one accent color, system/Inter fonts, Lucide icons and a 4/8px spacing grid.
- **PWA**: `public/manifest.webmanifest` and `public/sw.js`. The app shell is cache-first and uses a versioned cache. Navigations go network-first and fall back to the cached shell offline. Cross-origin requests are never cached. Updates use a prompt that posts SKIP_WAITING and then reloads (see `pwa-register.snippet.js`).
- All paths are relative (`./`), so the same build works at the Vercel root (or any sub-path). Vite uses `base: './'`.

## Assumptions
- Primary device: Thanos's Samsung Android phone (Chrome or Samsung Internet). iOS is secondary.
- API keys are stored locally **without a passphrase** (his decision). Clearing site data or the "clear keys" button removes them.
- Weekly backup reminder is **on**: Settings shows the last export date and prompts after 7 days.
- An optional Android APK (TWA via Bubblewrap) wraps the same site, see `docs/TWA.md`.
- One user on one main device. There is no sync, and moving to a new device goes through a JSON export/import.
- A modern Chromium-based browser on Android, and iOS 16.4 or later in Safari.
- Free AI tiers are enough for personal use, and limits and model names must be re-checked in the official docs before release.
- Calling a user-key API straight from the browser is acceptable because only Thanos uses the app and the keys live on his own device.

## Risks and mitigations
| Risk | Mitigation |
|---|---|
| **iOS storage eviction**: Safari can delete script-writable storage for sites that haven't been used in about 7 days when they run in a browser tab. Installed home-screen apps are mostly exempt. | Install to the Home Screen, call `navigator.storage.persist()`, show a "last backup" date and nag weekly to export. |
| IndexedDB is cleared when site data is cleared or the app is uninstalled. Safari tab storage and Home Screen app storage are **separate**. | On iOS, use only the Home Screen app. Export JSON regularly (Share sheet → Files/iCloud). |
| Schema changes break old data | Versioned `onupgradeneeded` migrations. The export carries a `schemaVersion` and the import validates it. |
| Offline | Logging, weight and history work offline. Barcode lookup, search and AI need a network connection, so the UI must say so and offer manual entry instead. |
| Stale service worker / cache never updates | `VERSION` bump on every deploy (ideally injected at build time), network-first navigations, update prompt. |
| API keys exposed if the device or a browser extension is compromised | Local-only storage, no analytics or third-party scripts, a strict CSP if possible, and a "clear keys" button. |
| CORS / rate limits (429) from providers | Exponential backoff, provider fallback, clear error with retry. |
| AI estimates inaccurate | Every item can be edited before saving, and confidence is labeled ±20–30%. |
| Camera/BarcodeDetector support | BarcodeDetector is missing on iOS Safari, so iOS uses the ZXing fallback. Camera access needs HTTPS. |
| TWA shows a URL bar | `assetlinks.json` must be reachable at `https://<domain>/.well-known/` as JSON. Vercel serves it from the root, so check it after each domain change. |
| Lost signing keystore | APK updates become impossible, so back up `android-keystore/` + `.env` offline. |
| Vercel caches an old `sw.js` | `vercel.json` sends `no-cache` for `sw.js` and the manifest. Hashed `/assets/*` are immutable. |
