# Story Loom deployment

The app is a TanStack Start application bundled by Cloudflare's Vite plugin. It uses a D1 database for accounts and chapter metadata, a private R2 bucket for PNG/WebP/GIF/MP4 media, and a Worker-only `JWT_SECRET`. Sessions are encrypted compact JWE tokens in an HttpOnly cookie; D1 stores only the session-id hash and CSRF hash.

## First production setup

```bash
npx wrangler login
npx wrangler d1 create story-loom-db --update-config
npx wrangler r2 bucket create story-loom-media
openssl rand -hex 32 | npx wrangler secret put JWT_SECRET
pnpm db:migrate:remote
pnpm run deploy
```

The D1 command may print an updated `database_id`; keep the generated `wrangler.jsonc` binding. Never place the session secret in `vars`, source code, or client configuration.

## Local development

Copy `.dev.vars.example` to `.dev.vars`, replace the placeholder with the output of `openssl rand -hex 32`, then run:

```bash
pnpm db:migrate:local
pnpm dev
```

Production media access is private and requires the encrypted, revocable browser session. The API enforces chapter ownership on every D1 query, accepts images up to 5 MB, and accepts MP4 clips up to 25 MB and 30 seconds. Image metadata cleansing is optional in the UI and is never applied to MP4.

## Optional providers

Stripe Checkout is implemented but remains disabled until these server-only secrets are configured:

```bash
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put STRIPE_PRICE_MEMORY
npx wrangler secret put STRIPE_PRICE_STUDIO
npx wrangler secret put STRIPE_PRICE_GOLDEN_HOUR
npx wrangler secret put STRIPE_PRICE_RAIN_WINDOW
npx wrangler secret put STRIPE_PRICE_STARDUST_CEILING
npx wrangler secret put STRIPE_PRICE_PREMIERE_NIGHT
npx wrangler secret put STRIPE_PRICE_KEEPSAKE_EXPORT
npx wrangler secret put APP_URL
```

Create separate Stripe Products and Prices for Memory and Studio subscriptions, and one-time Prices for Golden Hour, Rain Window, Stardust Ceiling, Premiere Night, and Keepsake Export. One-time finishes must be started from an open chapter so the webhook can attach `chapter_id`. Configure the webhook endpoint as `/api/stripe/webhook`; the Worker verifies Stripe signatures and treats webhook events as the entitlement source of truth.

The opt-in OpenRouter editor uses the standard TypeScript `fetch()` API from the Worker. Configure `OPENROUTER_API_KEY`; the browser must explicitly confirm that its typed prompt may be sent to the provider, and the endpoint does not forward private chapter metadata or images automatically. The nine model IDs are hard-coded in `src/lib/server/ai-catalog.ts`, three per tier, and are sent as an ordered `models` fallback array with provider data collection denied.
