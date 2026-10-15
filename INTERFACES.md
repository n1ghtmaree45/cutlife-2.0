# Module interfaces (backend → frontend contract)

Owner: Backend bot. Status: **M1 implemented and tested** (`npm test`). The source files are TypeScript with full types. The UI can be `.jsx`, and imports from `.ts` files work as-is under Vite.
All values are metric internally: kg, cm, grams, kcal. Convert to lb only for display (`kgToLb`/`lbToKg`). Dates are local `YYYY-MM-DD` strings (`todayISO()`).

## Types: `src/types.ts`
```ts
Sex = 'male'|'female'; ActivityLevel = 'sedentary'|'light'|'moderate'|'active'|'very_active'
Goal = 'lose'|'maintain'|'gain'; MealType = 'breakfast'|'lunch'|'dinner'|'snack'
Units = 'kg'|'lb'; Theme = 'system'|'light'|'dark'; AiProviderId = 'gemini'|'groq'|'openrouter'
FoodSource = 'off'|'usda'|'custom'|'recipe'|'ai'|'quick'
Macros  { kcal, protein, carbs, fat }                       // grams except kcal
Profile { id:'me', sex, birthDate, heightCm, weightKg, goalWeightKg, activity, goal,
          deficitPct /*0.15-0.25*/, proteinGPerKg /*1.6-2.2*/, fatPctOfRemaining?, targets: Macros, updatedAt }
Food    { id /*'off:<code>'|'usda:<fdcId>'|uuid*/, source, sourceId?, name, brand?, barcode?,
          per100g: Macros, fiber100g?, servingG?, servingLabel? }
Recipe  { id, name, ingredients:{foodId,grams}[], totalCookedG?, servings, createdAt }
LogEntry{ id, date, meal, foodId?, name, grams, macros: Macros /*snapshot for the portion*/, source, confidence?, createdAt }
WeightEntry { date /*key*/, kg, createdAt }
Settings { id:'settings', units, theme, provider, fallbackProvider?, apiKeys:{gemini?,groq?,openrouter?,usda?},
           models?:{gemini?,groq?,openrouter?}, preferences?, allergies?, pantry? }
ExportBundle { app:'calorie-app', version, exportedAt, profile?, settings?, foods, recipes, logs, weights }
```

## Storage: `src/data/db.ts` (IndexedDB "calorie-app" v1 via `idb`)
| store | keyPath | indexes |
|---|---|---|
| profile | id ('me') | |
| settings | id ('settings') | |
| foods | id | byBarcode, byName |
| recipes | id | |
| logs | id | byDate, byCreated |
| weights | date | (one weigh-in per day; re-saving overwrites) |

All functions are async.
```ts
getProfile(): Profile|undefined;     saveProfile(p: Profile)
getSettings(): Settings /*merged with DEFAULT_SETTINGS*/;  saveSettings(patch): Settings
saveFood(f): Food; getFood(id); getFoodByBarcode(code); deleteFood(id); listFoods(source?); searchLocalFoods(q, limit=20)
saveRecipe(r); listRecipes(); deleteRecipe(id)
addLog(entry without id/createdAt): LogEntry; updateLog(e); deleteLog(id)
getLogsByDate(date): LogEntry[] /*oldest first*/; getLogsInRange(from,to); getDayTotals(date): Macros
getRecentFoods(limit=10): LogEntry[]  // distinct by foodId||name, newest first (quick-add)
addWeight(date, kg); deleteWeight(date); listWeights(): WeightEntry[] /*date asc*/
exportAll(includeKeys=false): ExportBundle    // API keys are stripped by default
importAll(bundle, 'replace'|'merge'='replace') // keeps existing API keys if the file has none; throws on a bad file
resetAll()
sync helpers: uid(), todayISO(date?), sumMacros(items)
```

## Nutrition: `src/lib/nutrition.ts` (pure functions)
```ts
computeTargets({sex, weightKg, heightCm, age, activity, goal, deficitPct?=0.2, proteinGPerKg?=1.8,
                fatPctOfRemaining?=0.35, surplusPct?=0.10}) → {
  bmr, tdee, targets: Macros, dailyDeficit, expectedWeeklyKg /*negative = loss*/, maxDailyDeficit,
  warnings: ('rate_capped'|'floor_applied'|'deficit_out_of_range'|'protein_out_of_range')[] }
// Order: Mifflin-St Jeor → ×activity (1.2/1.375/1.55/1.725/1.9) → deficit capped at 0.75% bw/week (7700 kcal/kg)
//        → floor 1500 m / 1200 f. Protein = g/kg × weightKg; fat = 35% of non-protein kcal (min 0.6 g/kg); carbs = rest.
bmr(sex,kg,cm,age); tdee(bmr,activity); ageFromBirthDate(iso, on?); isRateTooAggressive(weeklyLossKg, kg)
macrosForGrams(per100g, grams): Macros; kcalFromMacros({protein,carbs,fat}); remaining(targets, eaten)
recipePer100g(ingredients, foodsMapOrRecord, totalCookedG?)
kgToLb, lbToKg, round(n, decimals)
// Weight (M2): 
movingAverage7(weights) → {date,kg,avg}[]   // trailing 7 calendar days
weeklyRate(weights, days=14) → kg/week | null  // least-squares fit; null if <2 points or <7-day span
etaToGoal(currentKg, goalKg, weeklyRate, from?) → 'YYYY-MM-DD' | null
suggestAdjustment({currentKcal, expectedWeeklyKg, observedWeeklyKg, sex, weightKg, tdee})
  → {newKcal, deltaKcal, reason:'too_slow'|'too_fast'|'on_track'|'insufficient_data'}  // ±200 kcal max per step
```
UI warning copy is the frontend's job. Map the warning codes to text.

## Food lookup: `src/api/*`
```ts
searchFoods(query, {usdaKey?, limit=40, signal?, includeLocal=true}) → {foods: Food[], errors:{source, code, message}[]}
  // code: 'usda_key_needed' (show "Add your free USDA key in Settings"), 'off_unavailable' (OFF down, retry later),
  //       'rate_limited' | 'bad_key' | 'unavailable' | 'network' | 'timeout' | 'bad_response' | 'unknown'
  // src/api/search.ts: local first, then USDA + OFF interleaved, deduped. Never throws.
lookupBarcode(code, {signal?}) → Food|null          // src/api/off.ts (OFF v2 product API)
searchOff(q, {pageSize?, signal?}) /*OFF cgi/search.pl (CORS *), 1 retry, then throws code 'off_unavailable'*/; searchUsda(q, {apiKey?, pageSize?, dataTypes?, signal?})
normalizeOff(product), normalizeUsda(food)          // → Food per 100 g or null
```
USDA falls back to `DEMO_KEY` (very low shared limits), so Settings should invite the user to paste a free key from api.data.gov into `apiKeys.usda`.
To log a search result: call `saveFood(food)` (caches it for offline/recent use), then `addLog({date, meal, foodId: food.id, name, grams, macros: macrosForGrams(food.per100g, grams), source: food.source})`.

## AI: `src/ai/*` (contract only. Providers arrive in M3)
```ts
interface AiProvider { id; analyzePhoto(jpegBlob, {signal?, hint?}): PhotoAnalysis; suggestMeals(SuggestInput, {signal?}): MealSuggestions }
PhotoAnalysis { foods: {name, grams_estimate, kcal, protein, carbs, fat, confidence /*0-1*/}[] }
MealSuggestions { suggestions: {name, description, ingredients:{name,grams}[], macros, prepMinutes?}[] /*3*/ }
SuggestInput { remaining: Macros, preferences?, allergies?, pantry? }
AiError(kind: 'no_key'|'rate_limited'|'invalid_json'|'network'|'provider', msg, retryAfterS?)
confidenceLabel(c) → 'High'|'Medium'|'Low'       // always show "estimate ±20-30%"
extractJson(text); validatePhotoAnalysis(v); validateMealSuggestions(v)   // src/ai/json.ts
```

## Mapping from the current UI stubs (`src/ui/services/index.js`)
- `getEntries(date)` → `getLogsByDate(date)`. Entry macros live in `e.macros.{kcal,...}`, not flat fields.
- `addEntry(e)` → `addLog(...)`. `at` is renamed `createdAt`.
- `calcTargets(p)` → `computeTargets(...)`: `activity` is an enum (not a multiplier), `deficitPct` is a fraction (0.2, not 20), age comes from `ageFromBirthDate(profile.birthDate)`, and warnings are codes.
- `searchFoods(q)` → returns `{foods, errors}`, not an array.
- Theme/units → `settings.theme` / `settings.units`, not localStorage.

## CORS notes (verified 2026-10-12 with Origin: http://localhost:5173)
All requests are plain GETs with query params and no custom headers, so no preflight is sent. Do not add a User-Agent or other headers.
- OFF `/cgi/search.pl` and `/api/v2/product/{code}.json` return `Access-Control-Allow-Origin: *` on 200. OFF's intermittent 503 HTML pages carry no CORS header, so the browser reports a "CORS error" that is really a server error.
- `search.openfoodfacts.org` sends **no** ACAO header, so the browser blocks it. Not used.
- USDA `/fdc/v1/foods/search` returns ACAO `*`.
