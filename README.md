# Cutline

Cutline is a private calorie and weight tracker that works offline. All data stays on your phone in IndexedDB, and there is no server or account. It costs $0 to run.

## Features
**Status: M1–M5 and all approved extras are built; see `docs/STATUS.md` for what is verified and what still needs a real phone.**

Core (M1–M5): profile and targets, food logging (manual/search, barcode, photo via your own AI key), dashboard, weight tracking with trend, AI meal suggestions, export/import.

Extras (planned, all free and offline-first):
- **Water tracker**: quick +250 ml taps toward a daily goal.
- **Streaks and weekly summary**: average kcal, protein hit-rate, weight change.
- **Meal templates**, "copy yesterday" and copy a meal.
- **Intermittent fasting timer** (off by default).
- **Steps/activity bonus**: manual entry that raises that day's target.
- **Body measurements and progress photos**, stored only on the phone and never uploaded.
- **Local notifications** (opt-in) for weigh-in, meal logging and backups. There is no push server, so on Samsung set Cutline's battery use to *Unrestricted* for reliable reminders.
- **Home-screen shortcuts**: long-press the icon for Log food, Weigh in or Scan barcode.
- **Haptic feedback** on key taps (Android).
- **CSV export** of logs and weights, in addition to the JSON backup.
- **Greek / English** language toggle.

QA checklist: `docs/TEST-CHECKLIST.md`.

## Run locally
Requirements: Node 20+.
```bash
npm install
npm run dev        # http://localhost:5173 (service worker disabled in dev)
npm test           # unit tests
npm run build      # outputs dist/
npm run preview    # serve dist/ to test PWA + offline at http://localhost:4173
```
To test on your phone over Wi-Fi, run `npm run preview -- --host` and open the shown LAN URL. Camera and install need HTTPS, so for a full test use a deploy (below).

## Install on your phone
Live URL: `https://$CUTLINE_DOMAIN/` (probably `https://cutline.vercel.app/`, confirm after the first Vercel deploy).

### Android: Chrome
1. Open the URL in Chrome and let it load once.
2. Tap **⋮ → Add to Home screen → Install** (or the "Install app" banner).
3. Open **Cutline** from the home screen. It runs full-screen and works offline after the first load.

### Android: Samsung Internet
1. Open the URL in Samsung Internet.
2. Tap the **install icon** in the address bar (a down-arrow/phone icon), or **≡ Menu → Add page to → Home screen**.
3. Confirm **Install**/**Add**. Open Cutline from the home screen.

Note: each browser keeps its **own storage**. Pick one browser, install from it and log only there. Use Export/Import to move data between browsers.

### iPhone (secondary)
Safari → Share → Add to Home Screen. Storage is separate from Safari tabs, and iOS may evict data, so export regularly.

## Your data
A reminder appears weekly if you haven't exported a backup in 7 days.
Settings → Export saves a JSON backup, and Import restores it, which is also how you move to a new phone. API keys are stored only on the device.

## Deploy for free (Vercel)
Code: private repo `github.com/n1ghtmaree45/cutline`. Hosting: Vercel Hobby (free). `vercel.json` already sets the build, output and headers (`sw.js` no-cache, manifest content type, `assetlinks.json` as JSON).
1. Sign in at vercel.com **with GitHub** (account `n1ghtmaree45`).
2. **Add New → Project → Import** `n1ghtmaree45/cutline`. Grant Vercel access to that private repo when asked.
3. Framework preset **Vite**, build `npm run build`, output `dist` (picked up from `vercel.json`). Click **Deploy**.
4. The URL is shown (e.g. `https://cutline.vercel.app`). If that name is taken, rename the project or note the URL Vercel assigns. Every push to `main` redeploys.
5. Check: `curl -I https://<domain>/sw.js` shows `cache-control: no-cache…` and `/.well-known/assetlinks.json` returns JSON.

(Or use the CLI: `npx vercel` then `npx vercel --prod`.)

### After each deploy
Bump `VERSION` in `public/sw.js`. Open the app, accept the "Update available" prompt, and it reloads.

## Android APK (optional, sideload)
The installed PWA already behaves like an app. The APK is an alternative that wraps the same site (a Trusted Web Activity). See `docs/TWA.md`.
1. Deploy to Vercel first.
2. On the build machine, run `scripts/build-apk.sh <domain>` (e.g. `cutline.vercel.app`), which writes `android/app-release-signed.apk`.
3. Make sure `https://<domain>/.well-known/assetlinks.json` is live (it's in `public/`, so it deploys with the site). The APK then opens full-screen.
4. Copy the APK to the phone (USB, Google Drive or email) and open it.
5. Samsung: allow **Settings → Apps → (Files/My Files or Chrome) → Install unknown apps**, then tap **Install**. Play Protect may warn that the app is unrecognized. Choose **Install anyway**.
6. Updates: bump `appVersionCode` (Bubblewrap asks), rebuild with the **same keystore** and install over the old one.

Data note: the APK uses Chrome's storage for the site, so it shares data with the site in Chrome but **not** with Samsung Internet.

## Privacy: your data stays on your phone
- **Everything you enter** (profile, food log, weights, measurements, progress photos, settings, API keys) is stored only in the browser's IndexedDB on your device. There is **no backend, no account, no analytics, no cookies**.
- The app only talks to the network for lookups you trigger: Open Food Facts / USDA (food search, barcode) and the AI provider you chose (photo or meal ideas). A meal photo is resized on the phone, sent once to that provider, and never saved.
- Your API keys are kept on the device and sent only to their own provider. They are excluded from backups unless you opt in.
- Progress photos are never uploaded and are left out of backups unless you tick "Include progress photos".
- Backups are files you export yourself (Settings → Your data). Clearing browser data or uninstalling deletes everything, so back up regularly.
- This repository contains **no personal data and no secrets**. Never commit `.env` files, keystores, or API keys.
