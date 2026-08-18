# One-time setup before first deploy

`wrangler.toml` currently contains placeholder ids (`00000000-0000-0000-0000-000000000000`)
for the D1 database and KV namespace, because creating these resources requires an
authenticated Cloudflare session that isn't available in this environment. Local tests
don't need real ids — `@cloudflare/vitest-pool-workers` provisions its own local D1/KV
through miniflare regardless of what's in `wrangler.toml`.

Before the first real (non-test) deploy, a human with Cloudflare access must run:

```bash
pnpm wrangler d1 create ba_bot
pnpm wrangler kv namespace create SESSIONS
```

Then copy the printed `database_id` (from the `d1 create` output) and `id` (from the
`kv namespace create` output) into `wrangler.toml`, replacing the two
`00000000-0000-0000-0000-000000000000` placeholders.

Secrets (`LLM_BASE_URL`, `LLM_MODEL`, `LLM_MODEL_HEAVY`, `LLM_API_KEY`, `TURNSTILE_SECRET`,
`IP_HASH_SALT`) are not set here — they're configured in Task 5 via `wrangler secret put`.
