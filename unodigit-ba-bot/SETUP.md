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
`IP_HASH_SALT`) are not set here — they require an authenticated Cloudflare session that
isn't available in this environment. Local tests don't need real secrets —
`vitest.config.ts` supplies stub values (`test-model`, `test-key`, etc.) directly as
miniflare bindings.

Before the first real (non-test) deploy, a human with Cloudflare access must run:

```bash
pnpm wrangler secret put LLM_BASE_URL      # https://api.deepseek.com/v1
pnpm wrangler secret put LLM_MODEL         # DeepSeek V4-Flash model id
pnpm wrangler secret put LLM_MODEL_HEAVY   # DeepSeek V4-Pro model id
pnpm wrangler secret put LLM_API_KEY
pnpm wrangler secret put TURNSTILE_SECRET  # Cloudflare dashboard → Turnstile → your site → secret key
pnpm wrangler secret put IP_HASH_SALT      # generate once: openssl rand -hex 32
```

Secrets cannot be read back from Cloudflare once set — record each value in a password
manager as you set it.
