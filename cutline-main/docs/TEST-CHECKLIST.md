# Cutline QA checklist

Devices: Samsung (Android), **Chrome** and **Samsung Internet** (run each section in both unless marked). Desktop Chrome DevTools for Lighthouse/Application panel. `$D` = deployed domain (placeholder, likely `cutline.vercel.app`).
Mark: ✅ pass · ❌ fail (file issue) · ➖ n/a.

## Automated (CI / local)
- [ ] `npm ci && npm run build && npm test` green (tsc, vite build, vitest). Node ≥ 22.
- [ ] Unit: BMR/TDEE (Mifflin-St Jeor, both sexes), deficit 15–25 %, max 0.75 % BW/week warning, protein 1.6–2.2 g/kg, kcal floors 1500 (M) / 1200 (F).
- [ ] Unit: 7-day moving average, weekly rate, ETA, 2-week target-adjust suggestion.
- [ ] Unit: DB (fake-indexeddb) CRUD, schema upgrade, JSON export→import round-trip with identical data, `schemaVersion` check rejects bad files.
- [ ] Unit: AI JSON parsing strips fences, validates schema, rejects malformed output. OFF/USDA mappers handle missing nutrients.
- [ ] `node -e JSON.parse` on `public/manifest.webmanifest`, `vercel.json`, `public/.well-known/assetlinks.json`. `node --check public/sw.js`.
- [ ] Manifest lint: name/short_name Cutline, id/scope/start_url `./`, display standalone, theme `#1B5E20`, 192/512 any + 192/512 maskable, `shortcuts` icons ≥ 96px exist.
- [ ] Lighthouse (mobile) on `$D`: PWA installable, Performance ≥ 90, LCP < 2 s on Fast 4G, Accessibility ≥ 95.
- [ ] Headers: `curl -sI https://$D/sw.js` → `cache-control: no-cache…`. `/manifest.webmanifest` → `application/manifest+json`. `/.well-known/assetlinks.json` → 200 `application/json`.
- [ ] No secrets in repo: `git ls-files | rg -i '\.env|\.jks|keystore|\.apk'` is empty.
- [ ] Unit (extras): CSV export escaping (commas, quotes, Greek UTF-8 with BOM for Excel), water totals, streak computation across DST/midnight, weekly summary math, activity bonus adjusts the day's target only, fasting timer elapsed calc, i18n: every EN key has an EL key.

## M1 manual: profile, calcs, manual log
- [ ] Onboarding completes. Targets shown match the unit-test values for the same inputs. Aggressive rate shows a warning. Floors are enforced.
- [ ] kg ↔ lb toggle converts display only, with stored values unchanged.
- [ ] Manual search (OFF/USDA) → portion → save. Dashboard ring and macro bars update. Meal list is correct. Quick-add recent works.
- [ ] Custom food create/edit/delete. Edit/delete a log entry.
- [ ] Dark/light theme. Touch targets ≥ 44 px. Text stays readable at 200 % system font size (Samsung "Font size" max).
- [ ] Data survives app kill + phone reboot.

## Install (Samsung)
- [ ] Chrome: ⋮ → Install app. Icon is the Cutline ring (maskable, not clipped by Samsung squircle). Splash shows deep green, name and icon. Opens standalone (no URL bar).
- [ ] Samsung Internet: address-bar install icon / Menu → Add page to → Home screen. Same checks.
- [ ] Storage is separate per browser: data logged in Chrome install is not in Samsung Internet install (expected, documented).
- [ ] `navigator.storage.persisted()` returns true after install (DevTools remote debugging).

## Offline
- [ ] After first load, airplane mode → cold start from home screen: app shell loads, today's log/weight/history visible.
- [ ] Offline: add manual/custom food, weigh-in, water, measurements. All persist after reconnect.
- [ ] Offline: OFF/USDA search, barcode lookup and AI show a clear "needs connection" state with a manual-entry fallback, and never a blank screen.
- [ ] Never-visited deep link offline → `offline.html` with a Retry button.
- [ ] No cross-origin (AI/OFF/USDA) responses in Cache Storage (DevTools → Application).

## Update toast
- [ ] Bump `VERSION` in `sw.js`, deploy. Reopen app: an "Update available" toast appears (not a silent reload).
- [ ] Tap Update → page reloads once (no loop) and the new version is active. Old `cutline-*` caches are deleted.
- [ ] Dismiss toast → the app keeps working on the old version, and the toast reappears on the next launch.
- [ ] Works in both Chrome and Samsung Internet installs.

## Backup reminder and export
- [ ] Settings shows "last backup" date. Never exported, or > 7 days (set the device clock forward) → reminder banner appears. Export clears it.
- [ ] JSON export → wipe app data → import → identical data. Import of a corrupt/other-version file shows an error and leaves the data unchanged.
- [ ] Reset requires confirmation.
- [ ] If notifications are opted in, the backup reminder also arrives as a local notification (see below).

## Android APK / assetlinks (when the APK is built)
- [ ] `https://$D/.well-known/assetlinks.json` lists package `app.cutline.twa` and the release SHA-256 `30:D8:…:91:EA`.
- [ ] Google Statement List tester: `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://$D&relation=delegate_permission/common.handle_all_urls` returns the app.
- [ ] Sideload APK (allow "Install unknown apps"). App opens **full-screen with no URL bar**. A URL bar means assetlinks failed.
- [ ] Reinstalling an APK built with the same keystore upgrades in place and keeps the data.

## Extras (approved)
### Manifest shortcuts
- [ ] Long-press the home icon (Chrome and Samsung Internet installs) → **Log food**, **Weigh in**, **Scan barcode**. Each opens the right screen, including cold start and offline (Scan shows the offline state).
- [ ] Shortcut icons are monochrome SVG-style PNGs, not emoji.

### Local notifications (opt-in)
- [ ] Off by default. Nothing is requested at first launch. Permission is asked only after the user toggles it on.
- [ ] Weigh-in, meal and backup reminders fire at the set times while the app is installed. Note: there is no push server, so firing depends on the app/SW being alive. Document the actual behavior on Samsung (battery optimization may delay them), and test with "Unrestricted" vs "Optimized" battery.
- [ ] Denied permission → toggle shows "blocked in system settings", no errors.
- [ ] Tapping a notification opens the matching screen.

### Greek / English toggle
- [ ] Toggle switches all UI text instantly and persists across restarts. Defaults to device language (el → Greek).
- [ ] No untranslated strings and no clipped labels (Greek text is longer). Check every screen in both languages.
- [ ] Numbers, dates and decimal comma follow the locale (`1.234,5` in el). Units stay correct. Typing a decimal with a comma in Greek is parsed correctly.
- [ ] Food names from OFF/USDA are shown as returned (not translated) without breaking the layout.

### Water tracker
- [ ] +250 ml taps add up. Undo the last tap. Goal ring hits 100 %. The day resets at local midnight. Works offline.

### Streaks and weekly summary
- [ ] Streak increments for a day with ≥ 1 log and breaks after a missed day. A timezone change or DST does not double-count.
- [ ] Weekly card: avg kcal, protein hit-rate, weight change match hand calculation on seeded data.

### Meal templates / copy
- [ ] Save a meal as a template, then log it in one tap. "Copy yesterday" and "copy meal to today" duplicate entries (new ids, today's date), with no shared references.

### Intermittent fasting timer
- [ ] Off by default. Start/stop survives app kill and reboot (timestamp-based, not a running interval). Shows the correct elapsed time after the phone sleeps.

### Steps / activity bonus
- [ ] Manual entry adjusts only that day's target, by the documented formula. It can be removed. It's shown clearly on the dashboard.

### Body measurements and progress photos
- [ ] Measurements are saved with a date and charted. kg/lb and cm/in units follow settings.
- [ ] Photos are stored only in IndexedDB on the device. DevTools Network shows **no upload**. Photos are excluded from or optional in the JSON export (size), with a clear warning. Deleting a photo removes the blob.
- [ ] Storage usage is shown (`navigator.storage.estimate()`) and the app handles a quota error gracefully.

### Haptics
- [ ] `navigator.vibrate` fires on key taps (save, +water, weigh-in) on Samsung Chrome. It does nothing on browsers or devices that don't support vibration, with no errors.

### CSV export
- [ ] Logs CSV and weights CSV download and open correctly in Google Sheets and Excel, including Greek characters, with the date format documented.
