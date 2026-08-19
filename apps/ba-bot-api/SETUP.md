# Setup

**Done — the Worker is live at `https://unodigit-ba-bot.unodigit.workers.dev`.**
D1 (`ba_bot`, region OC) and KV (`SESSIONS`) exist, their real ids are committed in
`wrangler.toml`, `0001_initial.sql` is applied to the remote database, and the original
four secrets are pushed. Nothing below needs re-running unless you are rebuilding the
environment from scratch — **except `QUOTE_LINK_SIGNING_KEY`, which is new, does not
exist in 1Password yet, and blocks the next deploy. See "Vars vs secrets" below.**

Local tests never needed any of it — `@cloudflare/vitest-pool-workers` provisions its
own D1/KV through miniflare regardless of what `wrangler.toml` says.

To recreate the resources in a fresh account:

```bash
pnpm wrangler d1 create ba_bot
pnpm wrangler kv namespace create SESSIONS
pnpm wrangler d1 migrations apply ba_bot --remote
```

then copy the printed `database_id` and `id` into `wrangler.toml`.

## Hostname

The spec's `api.unodigit.com` is **not reachable** and no DNS record can fix it.
Workers Custom Domains require an active Cloudflare zone, and `unodigit.com.au` is not
one — its DNS is at OnlyDomains. A CNAME pointing at `*.workers.dev` does not route to
a Worker either, because dispatch matches the Host header against a configured route.
Using a custom hostname means moving the zone's nameservers to Cloudflare first; until
then the widget talks to the `workers.dev` origin, which is set in
`apps/web/.env.production`.

## CORS

`ALLOWED_ORIGIN` is a **comma-separated** allowlist (split in `src/index.ts`), currently
www + apex + `http://localhost:3000`. It has to be a list because the widget floats on
every page and is loaded from www in production and localhost in development. Note the
site is `unodigit.com.**au**` — an origin mismatch here fails only in the browser, so
the Worker's own logs still show clean 200s while every call is blocked.

## Vars vs secrets

Provider configuration is **not** secret and lives in `[vars]` in `wrangler.toml`:

| Var | Current value |
| --- | --- |
| `LLM_BASE_URL` | `https://api.deepseek.com` |
| `LLM_MODEL` | `deepseek-v4-flash` |
| `LLM_MODEL_HEAVY` | `deepseek-v4-pro` |
| `PUBLIC_SITE_URL` | `https://www.unodigit.com.au` |

`PUBLIC_SITE_URL` is the origin of the quote link that goes into the client's email
(`${PUBLIC_SITE_URL}/q/?id=<quoteId>&sig=<hmac>`). It is deliberately **separate from
`ALLOWED_ORIGIN`**: that one is a CORS allowlist containing `http://localhost:3000`, and
reordering it must never change the URL a client receives.

**Both the id and the signature are in the query string, and that is load-bearing.**
The site is `output: 'export'` with `trailingSlash: true`, so a dynamic `/q/[id]` route
cannot be pre-rendered for ids that do not exist at build time — a path-form link
(`/q/<quoteId>?sig=…`) resolves to Cloudflare Pages' `404.html` and is permanently dead.
Spec §11 therefore specifies a **static shell** at `app/q/page.tsx` that reads
`?id=…&sig=…` and fetches the quote from the Worker client-side. That page is a Plan 3
deliverable — until it ships the link 404s, even though the API behind it
(`GET /api/quote/:id`) already works. The shape is pinned by a test
(`test/api/generate.test.ts`) because links already emailed **cannot be reissued**:
changing it later strands every quote sent before the change.

To change any of these, edit `wrangler.toml` and redeploy. **Do not** `wrangler secret put`
them: a secret shadows a var of the same name, so setting one silently overrides the
committed value and the override is invisible in the repo. `LLM_BASE_URL` in particular
must stay the OpenAI-format host exactly as it appears in `wrangler.toml`
(`https://api.deepseek.com`) — `src/llm/openai-compat.ts` appends `/chat/completions`
itself, and DeepSeek's `/anthropic` endpoint would need a different adapter.

Only these five are real secrets:

| Secret | Where it comes from |
| --- | --- |
| `LLM_API_KEY` | DeepSeek console |
| `RESEND_API_KEY` | Resend dashboard |
| `TURNSTILE_SECRET` | Cloudflare dashboard → Turnstile → your site → secret key |
| `IP_HASH_SALT` | generate once: `openssl rand -hex 32` |
| `QUOTE_LINK_SIGNING_KEY` | generate once: `openssl rand -hex 32` |

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

`LLM_API_KEY`, `TURNSTILE_SECRET`, `IP_HASH_SALT`, and `QUOTE_LINK_SIGNING_KEY` are
checked on every `/api/*` request — the Worker returns **503** while any is missing
rather than running with a degraded guardrail (an unsalted `ip_hash` is a reversible IP
address; an unset signing key HMACs every quote id under the empty string, which anyone
can reproduce, so every quote in the database becomes world-readable to anyone who can
guess an id).

`RESEND_API_KEY` is deliberately **not** on that list. An unset key stops delivery and
nothing else: the send path logs a `quote_email_failed` event and still returns the brief
and the quote, so a 503 for the whole API would be strictly worse than a quote the
visitor reads on screen but does not receive by mail.

Secrets cannot be read back from Cloudflare once set — 1Password stays the source of truth.

### ⚠️ `QUOTE_LINK_SIGNING_KEY` is a deploy blocker

**The 1Password entry does not exist yet.** Until it does, `/api/*` returns **503 on
every route** — not just the quote endpoints, because the check is a global middleware.
Create it and push it *before* the next `pnpm bot:deploy`:

```bash
op item edit ba_bot quote_link_signing_key="$(openssl rand -hex 32)"   # or create in the 1Password UI
./scripts/sync-secrets.sh
```

The reference `scripts/sync-secrets.sh` expects is
`op://application/ba_bot/quote_link_signing_key`.

Rotating this key **invalidates every quote link already emailed** — the signature is
`HMAC-SHA256(quoteId)` under the key, so previously-sent links start returning 403.

### Email delivery (Resend)

Quotes are delivered as **HTML only, with no attachment**, by a direct `fetch` to
`https://api.resend.com/emails` (`src/mail/resend.ts`). The `resend` SDK is not installed
and should not be — one POST does not justify a dependency in a Worker bundle.

The sender is `quotes@unodigit.com.au` (the `FROM` constant in `src/mail/resend.ts`).
**`unodigit.com.au` must be added as a domain in Resend and DNS-verified (SPF + DKIM, and
the return-path record Resend asks for) before any quote will deliver.** Until it is
verified, every send fails with a 422 and the Worker records a `quote_email_failed` event
— visibly, but only in the `events` table; the visitor still gets a 200 and their number
on screen. Changing the sender address means re-verifying.

Delivery failures never fail the request, by design: the brief and quote are already
persisted before the send is attempted. Check the `events` table for
`quote_email_failed` (payload carries the Resend status and message) versus
`quote_email_sent` (payload carries the provider id). Neither payload contains the
recipient address — that lives only in `leads`.
