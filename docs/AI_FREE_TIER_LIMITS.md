# AI provider free-tier limits (verified 2026-10-12)

Checked against the official docs on 2026-10-12. Limits change often, so recheck before M3. Every provider returns HTTP 429 when a limit is hit, and the client must back off (honor `Retry-After` when present).

## Google Gemini API: primary
- Source: https://ai.google.dev/gemini-api/docs/rate-limits (page "Last updated 2026-10-09 UTC") and https://ai.google.dev/gemini-api/docs/pricing
- Limits are counted in RPM, input TPM and RPD. They apply **per Google Cloud project, not per API key**. RPD resets at **midnight Pacific**.
- **Per-model free-tier numbers are no longer published on the docs page.** The page says to "View your active rate limits in AI Studio" (https://aistudio.google.com/rate-limit). Preview/experimental models have tighter limits.
- Free tier: "Active project or free trial". No spend cap applies (N/A). Paid Tier 1 requires linking billing, which we must NOT do ($0 budget).
- The pricing page lists a "Free of charge" free tier for current Flash models. Model IDs seen there include `gemini-3.8-flash` (newest, announced as available free of charge), `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-2.5-flash` and `gemini-2.5-flash-lite`. Some rows show "Not available" on the free tier (paid-only features), so confirm vision/JSON support on the free tier for the chosen model in AI Studio.
- Free-tier note: Google may use free-tier prompts to improve its products (see the pricing page). That matters because we send food photos.

## Groq: fallback 1
- Source: https://console.groq.com/docs/rate-limits (exact per-org limits: https://console.groq.com/settings/limits)
- Limits apply per organization and are counted in RPM/RPD/TPM/TPD. Cached tokens don't count. A 429 includes a `retry-after` header (seconds), and `x-ratelimit-*` headers come on every response.
- Published base limits (2026-10-12; the page says these are the Developer-plan base values and to check your org's limits page for exact values):

| Model | RPM | RPD | TPM | TPD |
|---|---|---|---|---|
| openai/gpt-oss-120b | 30 | 1K | 8K | 200K |
| openai/gpt-oss-20b | 30 | 1K | 8K | 200K |
| qwen/qwen3.8-27b | 30 | 1K | 8K | 200K |
| openai/gpt-oss-safeguard-20b | 3 | 1K | 2K | 200K |
| whisper-large-v3(-turbo) | 20 | 2K | – | – |

- Vision: https://console.groq.com/docs/vision mentions `meta-llama/llama-4-scout-17b-16e-instruct`, `meta-llama/llama-4-maverick-17b-128e-instruct` and `qwen/qwen3.6-27b`/`qwen3.8-27b`, but the Llama 4 models no longer appear in the rate-limit table, so they may be deprecated. **Open question:** which Groq model currently accepts images on the free plan. Treat Groq as text-first (meal suggestions) until this is confirmed.

## OpenRouter: fallback 2
- Source: https://openrouter.ai/docs/api-reference/limits
- Free model variants (ID ends in `:free`): **20 requests/min**. The daily cap is **50 requests/day** if lifetime credits purchased are under 10, or **1000/day** with at least 10 credits purchased. The daily counter resets at 00:00 UTC.
- Adding more keys or accounts doesn't raise the limits (they're enforced globally). A negative balance can cause 402 errors even on free models.
- `GET https://openrouter.ai/api/v1/key` returns `free_model_daily_requests {used,limit,remaining}`, which the app can use to show remaining quota.
- 429 handling: use exponential backoff and honor `Retry-After`. A mid-stream 429 arrives as an SSE event with `finish_reason:"error"`, so don't stream.

## Implications for the AI layer (M3)
- Default to Gemini Flash (or Flash-Lite) for photos. Use Groq for text suggestions. Use OpenRouter `:free` as the last resort (only 50/day on $0).
- Backoff: honor `Retry-After`, otherwise wait 1s, 2s, 4s (max 3 tries), then fail over to the fallback provider.
- Keep model IDs user-editable in Settings (`settings.models`), because names change month to month.
