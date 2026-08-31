# Story Loom deployment

The app is a TanStack Start application bundled by Cloudflare's Vite plugin. It uses a D1 database for accounts and chapter metadata, a private R2 bucket for PNG/WebP/GIF media, and a Worker-only `SESSION_SECRET`.

## First production setup

```bash
npx wrangler login
npx wrangler d1 create story-loom-db --update-config
npx wrangler r2 bucket create story-loom-media
npx wrangler secret put SESSION_SECRET
pnpm db:migrate:remote
pnpm run deploy
```

The D1 command may print an updated `database_id`; keep the generated `wrangler.jsonc` binding. Never place the session secret in `vars`, source code, or client configuration.

## Local development

Copy `.dev.vars.example` to `.dev.vars`, replace the placeholder with a long random value, then run:

```bash
pnpm db:migrate:local
pnpm dev
```

Production media access is private and requires the opaque, revocable browser session. The API enforces chapter ownership on every D1 query, accepts images up to 5 MB, and accepts MP4 clips up to 25 MB and 30 seconds.

## Optional providers

Stripe Checkout is implemented but remains disabled until these server-only secrets are configured:

```bash
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put STRIPE_PRICE_MEMORY
npx wrangler secret put STRIPE_PRICE_STUDIO
npx wrangler secret put STRIPE_PRICE_GOLDEN_HOUR
npx wrangler secret put APP_URL
```

Create separate Stripe Products and Prices for Memory and Studio subscriptions, and a one-time Price for Golden Hour. Configure the webhook endpoint as `/api/stripe/webhook`; the Worker verifies Stripe signatures and treats webhook events as the entitlement source of truth.

The opt-in OpenRouter editor uses the standard TypeScript `fetch()` API from the Worker. Configure `OPENROUTER_API_KEY` and optionally `OPENROUTER_MODEL`; the browser must explicitly confirm that its typed prompt may be sent to the provider, and the endpoint does not forward private chapter metadata or images automatically.
