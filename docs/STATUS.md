# Cutline status (v0.2.0)

All milestones M1–M5 and all approved extras are implemented. This file separates what was **verified automatically** from what **still needs a real phone**.

## Built
- **M1** profile, targets, manual/search logging, custom foods, recipes, edit/delete, day navigation.
- **M2** weight log, 7-day average chart, weekly rate, goal ETA, bi-weekly target suggestion (apply / keep).
- **M3** barcode scan (native `BarcodeDetector`, ZXing fallback loaded lazily), photo → AI with editable review and confidence, 429 backoff + provider fallback.
- **M4** AI meal suggestions (3 options, remaining macros, preferences / allergies / pantry, one-tap log).
- **M5** settings, JSON export/import (validated, transactional), CSV, reset, backup banner, storage info.
- **Extras** water, streaks, weekly summary, copy meal/day, templates, activity bonus, fasting timer, body measurements, local-only progress photos, reminders, Android shortcuts, haptics, English + Greek.

## Verified here (headless Chromium + Node)
- `npm run build` clean (tsc strict). **99 unit tests** pass: nutrition math, DB v1→v2 migration on a genuine v1 database, import/export round-trip and rollback, AI parsing/backoff/fallback (mocked network), CSV, i18n parity, streak/DST, adjustment logic.
- **23/23 end-to-end steps** on a production build: onboarding, water, activity, search fallback, edit/delete, custom food, templates, copy, weight chart/ETA, body + photo, AI/scan/photo error states, language switch + persistence, lb/kg, JSON/CSV export, corrupt-import rejection, reset, **offline cold start**.
- No horizontal overflow at 320 / 360 / 412 px in English or Greek (9 screens each).

## NOT verifiable without a phone / real keys (please test on the Samsung)
- Real **camera barcode scanning** and photo capture (headless has no camera).
- Real **AI answers**: provider requests are covered by mocked tests only. Model names in Settings are defaults and may need changing (`gemini-3.5-flash`, `openai/gpt-oss-120b`, and an OpenRouter `:free` model that is **unverified**).
- **Open Food Facts / USDA live results** (the sandbox blocks them; the offline/error paths were exercised).
- **Reminders while the app is closed** (Periodic Background Sync is Chrome-only and best-effort; set battery to Unrestricted on Samsung). Reminders while the app is open are logic-tested.
- Install flow, maskable icon, haptics, Lighthouse scores, TWA.

## Bugs found and fixed during this pass (some pre-dated it)
1. First visit reloaded the page (service-worker `controllerchange`), wiping half-filled onboarding.
2. Service worker did not precache hashed JS/CSS, so the first offline cold start could be blank.
3. Number field dropped characters when typing fast; rewritten without effects.
4. Toasts hid early when two occurred within 2.4 s.
5. Inputs forced two-column rows wider than the screen; Greek button labels overflowed.
