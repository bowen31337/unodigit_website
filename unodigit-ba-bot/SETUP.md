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

## Vars vs secrets

Provider configuration is **not** secret and lives in `[vars]` in `wrangler.toml`:

| Var | Current value |
| --- | --- |
| `LLM_BASE_URL` | `https://api.deepseek.com` |
| `LLM_MODEL` | `deepseek-v4-flash` |
| `LLM_MODEL_HEAVY` | `deepseek-v4-pro` |

To change any of these, edit `wrangler.toml` and redeploy. **Do not** `wrangler secret put`
them: a secret shadows a var of the same name, so setting one silently overrides the
committed value and the override is invisible in the repo. `LLM_BASE_URL` in particular
must stay the OpenAI-format host exactly as it appears in `wrangler.toml`
(`https://api.deepseek.com`) — `src/llm/openai-compat.ts` appends `/chat/completions`
itself, and DeepSeek's `/anthropic` endpoint would need a different adapter.

Only these four are real secrets:

| Secret | Where it comes from |
| --- | --- |
| `LLM_API_KEY` | DeepSeek console |
| `RESEND_API_KEY` | Resend dashboard |
| `TURNSTILE_SECRET` | Cloudflare dashboard → Turnstile → your site → secret key |
| `IP_HASH_SALT` | generate once: `openssl rand -hex 32` |

They are not set in this environment — that requires an authenticated Cloudflare session.
Local tests don't need real values: `vitest.config.ts` supplies stubs (`test-key`,
`test-salt`, etc.) directly as miniflare bindings.

Before the first real (non-test) deploy, push them from 1Password:

```bash
./scripts/sync-secrets.sh --check   # verify Cloudflare auth, change nothing
./scripts/sync-secrets.sh           # push every secret
./scripts/sync-secrets.sh --list    # names only; Cloudflare never returns values
```

The script pipes `op read` straight into `wrangler secret put`, so values never touch disk
or shell history. Its `SECRETS` array is the source of truth for what gets pushed; the
1Password items it references must exist first.

`LLM_API_KEY`, `TURNSTILE_SECRET`, and `IP_HASH_SALT` are checked on every `/api/*`
request — the Worker returns **503** while any is missing rather than running with a
degraded guardrail (an unsalted `ip_hash` is a reversible IP address).

Secrets cannot be read back from Cloudflare once set — 1Password stays the source of truth.
