# Calorie & Weight Tracker PWA: Spec (from Thanos)

$0 budget, single user, no backend server, IndexedDB + JSON export/import, Vite + Preact or vanilla JS, deploy free on GitHub Pages or Cloudflare Pages, user pastes their own API keys in Settings (stored locally only), offline logging/weight/history via a service worker.

Features:
1. Onboarding/profile: Mifflin-St Jeor BMR, TDEE, 15-25% deficit (max ~0.75% of bodyweight per week), protein 1.6-2.2 g/kg, carb/fat split, floors of 1500 kcal (male) / 1200 kcal (female), warning when the rate is too aggressive.
2. Food logging: (a) photo sent to a vision LLM, returning JSON {foods:[{name,grams_estimate,kcal,protein,carbs,fat,confidence}]} that the user can edit before saving; (b) barcode via BarcodeDetector with a ZXing-js fallback, looked up in Open Food Facts; (c) manual search in OFF/USDA FDC plus custom foods and recipes.
3. Dashboard: calories-remaining ring, macro bars, meal list, quick-add of recent foods.
4. Weight: daily weigh-in, chart with raw points and a 7-day moving average, weekly rate, ETA to goal, and a suggested target adjustment every 2 weeks.
5. AI meal suggestions: 3 high-protein, high-volume options from the remaining macros, preferences/allergies, and the pantry. Strict JSON, validated, with a retry button.
6. Settings: keys, provider, kg/lb, theme, export/import/reset.

AI layer: swappable provider interface; Gemini free tier plus a Groq/OpenRouter fallback; verify CURRENT free limits and model names in the official docs; 429 backoff; strip markdown fences and validate with a schema; resize images to 1024px JPEG at ~0.7; honest confidence labels (±20-30%).
Non-functional: mobile-first, dark mode, big touch targets, <2s load, no analytics, images never stored.
Milestones: M1 profile+calcs+manual log, M2 weight+charts, M3 camera+barcode+AI, M4 meal suggestions, M5 PWA/offline/deploy. Report what works and what to test after each.

## Extra requirements from Thanos
- It must be installable on his phone (PWA install on the home screen).
- It must look PROFESSIONAL and NOT look AI-generated: no generic purple gradients, no emoji icons, no glassmorphism clichés, no "AI sparkle" styling. Use a restrained, deliberate design system (one accent color, a real type scale such as Inter or system fonts, consistent 4/8px spacing, proper SVG icons like Lucide, subtle motion), modeled on polished native health apps.

## Ownership
- Backend bot: src/data (IndexedDB), src/lib/nutrition, src/api (OFF, USDA), src/ai (providers). Start first and publish module interfaces in INTERFACES.md.
- Frontend bot: src/ui, styles, design system; build against INTERFACES.md.
- QA & Deploy bot: manifest, service worker, README, deploy, test checklist, code review after each milestone.

## Extras approved by Thanos (add after M1-M5 core, keep $0 and offline-first)
- Water tracker (quick +250ml taps, daily goal)
- Streaks and a weekly summary card (avg kcal, protein hit-rate, weight change)
- Meal templates and "copy yesterday" / copy a meal
- Intermittent fasting timer (optional, off by default)
- Steps entry or a daily activity bonus (manual, adjusts the day's target)
- Body measurements (waist, etc.) and progress photos stored LOCALLY only, never uploaded
- Local notifications: weigh-in, meal logging, and backup reminders (opt-in)
- Home-screen shortcuts (manifest shortcuts: Log food, Weigh in, Scan barcode)
- Haptic feedback on key taps (navigator.vibrate on Android)
- CSV export of logs and weights in addition to JSON
- Greek + English language toggle
