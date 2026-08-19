# BA Bot — Frontend, Admin API & Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two launch blockers carried out of Plans 1–2, put the emailed quote link somewhere real, and build the internal dashboard behind Cloudflare Access.

**Architecture:** Three surfaces. The Worker gains a guarded `/api/chat` and an
authenticated `/admin/*` API. The static site gains a public `/q/[id]` quote page
and an `/admin` dashboard. The BA bot widget — already written but uncommitted —
gets committed and wired.

**Tech Stack:** Hono 4 on Cloudflare Workers, D1, KV, Turnstile, Cloudflare
Access (Zero Trust), Next.js 16 static export, vitest 4 +
`@cloudflare/vitest-pool-workers`.

**Spec:** `docs/superpowers/specs/2026-08-18-ba-bot-design.md` (binding authority)

**Predecessors:** Plan 1 (conversation engine, merged), Plan 2
(`docs/superpowers/plans/2026-08-18-ba-bot-estimator-artifacts.md`, complete at
165 tests / 17 files).

---

## Global Constraints

Copied from the spec and from `progress.txt`. Every task's requirements
implicitly include this section.

- **PII / APP 8:** no lead field (`name`, `email`) may reach `src/llm/`,
  `src/graph/prompts.ts`, or `src/estimator/`, or appear in brief/quote
  markdown. DeepSeek is hosted in China. The only legitimate use of a lead's
  email is the Resend envelope in `src/mail/`. Guard:
  `grep -rnE "\b(name|email)\b" src/llm/ src/graph/prompts.ts src/estimator/`
  must return exactly the 4 known-adjudicated lines.
- **Raw IP is never stored.** Salted SHA-256 only, via the existing
  `hashIp()` in `src/guards/ratelimit.ts`.
- **Frozen prompts stay byte-identical.** No interpolation, timestamps, or ids
  in `src/estimator/prompt.ts` / `calibration.ts` — DeepSeek's prefix cache is a
  byte match, ~98% cheaper on hits, and a miss is silent.
- **Admin routes live under `/admin/*`** so public chat endpoints stay
  unauthenticated (spec §12).
- `zod` stays `^3.24.1`. Add no dependencies without stating why in the report.
- **One IP per test.** D1 persists within a test file and `rate_limit` is keyed
  on `(ip_hash, day)`; a shared IP silently rate-limits later tests.
- **Mocks build `Response` lazily:** `mockImplementation(async () => new Response(...))`.
  The eager form fails under workerd with "Cannot perform I/O on behalf of a
  different request".
- Tests: `import { env, exports } from 'cloudflare:workers'`, invoked via
  `exports.default.fetch(input, init?)`.
- Baseline **165 tests / 17 files**, zero warnings. Never regress.
- Never `git add -A`. Stage explicitly by path. `CLAUDE.md` and
  `apps/web/**` carry the user's uncommitted work — see Task 2.

---

## Prerequisites — user actions, not coding tasks

These gate specific tasks. **P1 blocks everything at runtime.**

| # | Action | Blocks | Why |
|---|---|---|---|
| **P1** | Create `QUOTE_LINK_SIGNING_KEY` (`openssl rand -hex 32`) in the `application` 1Password vault at `op://application/ba_bot/quote_link_signing_key`, then `scripts/sync-secrets.sh` | **Every `/api/*` route** — returns 503 until set | It is in `REQUIRED_SECRETS`. Fail-closed is deliberate: an unset key HMACs under the empty string, silently signing every quote with a guessable key |
| **P2** | Verify the sender domain in Resend (SPF + DKIM DNS records) | Email delivery only | Unverified senders 422. Visible only as a `quote_email_failed` row in `events` — sends fail silently otherwise |
| **P3** | Move `unodigit.com.au` nameservers from OnlyDomains to Cloudflare, then add the Worker Custom Domain | **Tasks 5–9** | See below |

### P3 is a hard architectural gate, not a convenience

Spec §12 requires **two** Access applications, and is explicit about why one is
not enough: the dashboard is a static page calling the Worker from the browser,
so protecting only the Pages route leaves the admin API open to anyone who knows
the URL.

The second application must front the Worker's hostname. **Cloudflare Access
cannot protect a `workers.dev` hostname** — it injects
`Cf-Access-Jwt-Assertion` only for hostnames it proxies, which requires an
active zone. `SETUP.md` records that `unodigit.com.au` is not one: its DNS is at
OnlyDomains, and a CNAME to `*.workers.dev` does not route to a Worker because
dispatch matches the Host header against a configured route.

So until P3 lands there is no way to authenticate the admin API that does not
contradict the spec's own reasoning ("hand-rolled auth would be the most likely
source of a security incident in the project"). **Do not** work around this with
a shared bearer secret, an allowlisted header, or a signed cookie. Tasks 1–4
are unblocked and carry most of the launch-critical value; stop before Task 5
if P3 is outstanding and report that the plan is gated.

---

## File Structure

**Worker** (`apps/ba-bot-api/`)

| Path | Responsibility |
|---|---|
| `src/api/chat.ts` | *modified* — Turnstile on first message, per-IP turn limit |
| `src/guards/ratelimit.ts` | *modified* — add `turnsToday` / `recordTurn` |
| `src/guards/access.ts` | **new** — Cloudflare Access JWT verification middleware |
| `src/api/admin.ts` | **new** — `/admin/*` list, read, delete, export |
| `src/db/queries.ts` | *modified* — admin read queries, cascade delete |
| `migrations/0002_rate_limit_turns.sql` | **new** — per-IP turn ledger |

**Site** (`apps/web/`)

| Path | Responsibility |
|---|---|
| `components/BaBot/` | *commit as-is* — widget, already written |
| `app/q/[id]/` | **new** — public quote page (the emailed link target) |
| `app/admin/` | **new** — dashboard, behind Access |

---

## Task 1: Turnstile and per-IP rate limiting on `/api/chat`

**This is the top launch blocker.** `MAX_TOTAL_TURNS` (40) caps a single
session, not how many sessions one attacker opens. Today an attacker can create
unlimited conversations, each spending up to 40 DeepSeek turns, with no
Turnstile and no per-IP throttle on the chat endpoint. Spend is unmetered.

**Files:**
- Modify: `apps/ba-bot-api/src/api/chat.ts`
- Modify: `apps/ba-bot-api/src/guards/ratelimit.ts`
- Create: `apps/ba-bot-api/migrations/0002_rate_limit_turns.sql`
- Modify: `packages/ba-bot-contract/src/index.ts` (add optional `turnstileToken` to the chat request)
- Test: `apps/ba-bot-api/test/api/chat-guards.test.ts`

**Interfaces:**
- Consumes: `verifyTurnstile(token, secret, ip)` from `src/guards/turnstile.ts`;
  `hashIp(ip, salt)`, `utcDay(now)` from `src/guards/ratelimit.ts`
- Produces: `turnsToday(db, ipHash, day): Promise<number>`,
  `recordTurn(db, ipHash, day): Promise<void>`

**Design decisions, settled — do not re-litigate:**

1. **Turnstile is required only on the FIRST message of a conversation**
   (spec §10.1), identified by `session.totalTurns === 0`. Requiring it every
   turn would make the widget re-challenge mid-interview.
2. **The per-IP daily turn cap is 120.** Three full 40-turn interviews from one
   IP per day. Store it as a var `MAX_TURNS_PER_IP_PER_DAY = "120"`, not a
   literal.
3. **Exceeding the cap returns 429**, not 403 — it is a rate limit, and the
   widget must be able to tell "slow down" from "rejected".
4. **The turn is recorded BEFORE the LLM call**, not after. Recording after
   means a burst of concurrent requests all read the pre-increment count and all
   proceed — the exact case the limit exists to stop.
5. **Turnstile failure is recorded as an event** (`turnstile_failed`), matching
   `src/api/contact.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/ba-bot-api/test/api/chat-guards.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { env, exports } from 'cloudflare:workers'

// One IP per test — D1 persists within a file and rate_limit is keyed on
// (ip_hash, day). A shared IP silently rate-limits later tests.
const IP_A = '203.0.113.11'
const IP_B = '203.0.113.12'
const IP_C = '203.0.113.13'
const IP_D = '203.0.113.14'

describe('POST /api/chat guards', () => {
  it('rejects a first message with no turnstile token', async () => {
    const { conversationId } = await startConversation(IP_A)
    const res = await post('/api/chat', { conversationId, message: 'hi' }, IP_A)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'turnstile_required' })
  })

  it('makes NO LLM call when the turnstile token is missing', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    const { conversationId } = await startConversation(IP_B)
    await post('/api/chat', { conversationId, message: 'hi' }, IP_B)
    // The point of rejecting early is not spending. Asserting the status alone
    // would pass on an implementation that called the model and then 403'd.
    expect(spy).not.toHaveBeenCalled()
  })

  it('does not require a turnstile token after the first turn', async () => {
    const { conversationId } = await startConversation(IP_C)
    await postWithToken('/api/chat', { conversationId, message: 'hi' }, IP_C)
    const res = await post('/api/chat', { conversationId, message: 'more' }, IP_C)
    expect(res.status).toBe(200)
  })

  it('429s once the per-IP daily turn cap is exceeded', async () => {
    const cap = Number(env.MAX_TURNS_PER_IP_PER_DAY)
    await seedTurns(IP_D, cap)
    const { conversationId } = await startConversation(IP_D)
    const res = await postWithToken('/api/chat', { conversationId, message: 'hi' }, IP_D)
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'rate_limited' })
  })

  it('makes NO LLM call when rate limited', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    const cap = Number(env.MAX_TURNS_PER_IP_PER_DAY)
    await seedTurns(IP_D, cap)
    const { conversationId } = await startConversation(IP_D)
    await postWithToken('/api/chat', { conversationId, message: 'hi' }, IP_D)
    expect(spy).not.toHaveBeenCalled()
  })

  it('records the turn before calling the model, not after', async () => {
    // A provider outage must still consume quota, otherwise a failing provider
    // is an unlimited free retry loop.
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockImplementation(async () => { throw new Error('provider down') })
    const before = await turnCount(IP_A)
    const { conversationId } = await startConversation(IP_A)
    await postWithToken('/api/chat', { conversationId, message: 'hi' }, IP_A)
    expect(await turnCount(IP_A)).toBe(before + 1)
    spy.mockRestore()
  })

  it('never stores a raw IP', async () => {
    const { results } = await env.DB.prepare('SELECT ip_hash FROM rate_limit').all()
    for (const row of results as Array<{ ip_hash: string }>) {
      expect(row.ip_hash).toMatch(/^[0-9a-f]{64}$/)
      expect(row.ip_hash).not.toContain('203.0.113')
    }
  })
})
```

- [ ] **Step 2: Run and confirm RED**

Run: `cd apps/ba-bot-api && pnpm test`
Expected: the guard tests fail with `expected 200 to be 403` / `expected 200 to be 429`
(the endpoint currently accepts everything). Confirm the 165 baseline tests still pass.

- [ ] **Step 3: Add the migration**

```sql
-- apps/ba-bot-api/migrations/0002_rate_limit_turns.sql
-- Turn-level ledger, separate from the quote-level one. A visitor may take many
-- turns but generate one quote per day, so the two limits have different
-- shapes and must not share a counter.
CREATE TABLE IF NOT EXISTS rate_limit_turns (
  ip_hash TEXT NOT NULL,
  day     TEXT NOT NULL,
  turns   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, day)
);
```

- [ ] **Step 4: Extend the guard**

```ts
// apps/ba-bot-api/src/guards/ratelimit.ts  (append)

export async function turnsToday(db: D1Database, ipHash: string, day: string): Promise<number> {
  const row = await db
    .prepare('SELECT turns FROM rate_limit_turns WHERE ip_hash = ? AND day = ?')
    .bind(ipHash, day)
    .first<{ turns: number }>()
  return row?.turns ?? 0
}

/** Incremented BEFORE the model call. Recording after would let a burst of
 *  concurrent requests all read the pre-increment count and all proceed. */
export async function recordTurn(db: D1Database, ipHash: string, day: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO rate_limit_turns (ip_hash, day, turns) VALUES (?, ?, 1)
       ON CONFLICT(ip_hash, day) DO UPDATE SET turns = turns + 1`,
    )
    .bind(ipHash, day)
    .run()
}
```

- [ ] **Step 5: Wire the guards into the chat route**

In `src/api/chat.ts`, after the session is loaded and before any LLM call:

```ts
const ip = c.req.header('cf-connecting-ip') ?? '0.0.0.0'
const ipHash = await hashIp(ip, c.env.IP_HASH_SALT)
const day = utcDay(Date.now())

// Turnstile guards the FIRST message only (spec 10.1). Re-challenging every
// turn would interrupt the interview.
if (session.totalTurns === 0) {
  if (!body.turnstileToken) {
    return c.json({ error: 'turnstile_required' }, 403)
  }
  if (!(await verifyTurnstile(body.turnstileToken, c.env.TURNSTILE_SECRET, ip))) {
    await recordEvent(c.env.DB, body.conversationId, 'turnstile_failed', {})
    return c.json({ error: 'turnstile_failed' }, 403)
  }
}

if ((await turnsToday(c.env.DB, ipHash, day)) >= Number(c.env.MAX_TURNS_PER_IP_PER_DAY)) {
  return c.json({ error: 'rate_limited' }, 429)
}
await recordTurn(c.env.DB, ipHash, day)
```

Add to `wrangler.toml` `[vars]`: `MAX_TURNS_PER_IP_PER_DAY = "120"`, and to
`Env` in `src/env.ts`.

- [ ] **Step 6: Run tests, confirm GREEN, then mutation-check**

Break two things and confirm a test catches each:
(a) move `recordTurn` to after the LLM call → the "records before" test must fail;
(b) return 403 instead of 429 on the cap → the rate-limit test must fail.
Report which test caught which.

- [ ] **Step 7: Commit**

```bash
git add apps/ba-bot-api/src/api/chat.ts apps/ba-bot-api/src/guards/ratelimit.ts \
        apps/ba-bot-api/migrations/0002_rate_limit_turns.sql \
        apps/ba-bot-api/src/env.ts apps/ba-bot-api/wrangler.toml \
        apps/ba-bot-api/test/api/chat-guards.test.ts \
        packages/ba-bot-contract/src/index.ts
git commit -m "feat(ba-bot): guard the chat endpoint with turnstile and a per-IP turn cap"
```

---

## Task 2: Commit the BA bot widget

`apps/web/components/BaBot/` (5 files, 673 lines) is written and working but
**untracked**. It is one `git clean -fdx` from gone, and CI builds from a fresh
checkout — so the deployed site currently ships with no widget at all.

**Files:**
- Commit: `apps/web/components/BaBot/{BaBot.tsx,ContactForm.tsx,Turnstile.tsx,useBaBot.ts,index.ts}`
- Commit: `apps/web/.env.development`, `apps/web/.env.production`
- Commit: `.gitignore` (the negations that re-include those two env files)
- Commit: `apps/web/app/layout.tsx`, `apps/web/app/globals.css`,
  `apps/web/next.config.js`, `apps/web/package.json`, `pnpm-lock.yaml`

**Do NOT commit `CLAUDE.md`** — it carries the user's own in-progress edit.

- [ ] **Step 1: Verify the env files hold only public values**

Run: `grep -E '^[A-Z]' apps/web/.env.production apps/web/.env.development`
Expected: every key is `NEXT_PUBLIC_*`. `NEXT_PUBLIC_TURNSTILE_SITE_KEY` must
start `0x4AAAAAAA`–`0x4AAAAAAZ` (the **site** key — the public half; the secret
half is a Worker secret). **If any key is not `NEXT_PUBLIC_*`, stop and report** —
it does not belong in a committed file.

- [ ] **Step 2: Verify the gitignore negations actually work**

```bash
git check-ignore -v apps/web/.env.production || echo "NOT ignored — correct"
```
Expected: "NOT ignored — correct". A global `~/.gitignore_global` may carry a
broad `.env*` pattern; repository rules apply after it, which is what the
negations are for.

- [ ] **Step 3: Confirm the widget builds**

Run: `pnpm build --force` from the repo root (`--force` defeats a Turbo
`FULL TURBO` cache hit, which would otherwise mask whether the source compiles).
Expected: static export in `apps/web/out`, 22+ pages, exit 0.

- [ ] **Step 4: Commit, staging by explicit path**

```bash
git add apps/web/components/BaBot apps/web/.env.development apps/web/.env.production \
        .gitignore apps/web/app/layout.tsx apps/web/app/globals.css \
        apps/web/next.config.js apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): add the BA bot widget and its build-time configuration"
git status --short   # CLAUDE.md MUST still show as modified-unstaged
```

---

## Task 3: Public quote page `/q/` — static shell, query params

US-009 emails a link to the hosted quote. That page does not exist, so every
link sent today 404s.

**The URL shape is `/q/?id=<id>&sig=<hex>` — BOTH values in the query.** This is
spec §11's *Preferred* option and it is not a style choice. The site is
`output: 'export'` with `trailingSlash: true`, so a dynamic `/q/[id]` route
cannot be pre-rendered for ids that do not exist at build time — the path form
resolves to Pages' `404.html`. `src/api/generate.ts:137` emitted the path form
and was corrected; do not reintroduce it.

**Files:**
- Create: `apps/web/app/q/page.tsx`, `apps/web/app/q/QuoteClient.tsx`
- Test: manual — `apps/web` has no test suite; `pnpm build` is its only gate

**Design decisions, settled:**

1. **The page is client-rendered.** The quote cannot be fetched at build time —
   the id does not exist yet. No `generateStaticParams`, because there is no
   dynamic segment: `/q/` is a single static page.
2. **Both `id` and `sig` come from `useSearchParams()`.**
3. **Render `quotes.markdown` verbatim.** It is the canonical artifact — the same
   string the client received by email. Do not re-derive or re-format it.
4. **A 403 renders "this link is not valid", never "not found".** The Worker
   deliberately returns 403 for both a bad signature and an unknown id so ids
   are not enumerable; the UI must not undo that by distinguishing them.
5. **A missing `id` or `sig` renders the same failure state** — do not call the
   Worker with an empty parameter.

- [ ] **Step 1: Route shell**

```tsx
// apps/web/app/q/page.tsx
import type { Metadata } from 'next'
import { Suspense } from 'react'
import QuoteClient from './QuoteClient'

export const metadata: Metadata = {
  title: 'Your indicative quote — Uno Digit',
  // A quote link is private-by-obscurity; keep it out of search results.
  robots: { index: false, follow: false },
}

export default function QuotePage() {
  // useSearchParams() requires a Suspense boundary during static export,
  // otherwise the build fails with a missing-suspense-with-csr-bailout error.
  return (
    <Suspense fallback={null}>
      <QuoteClient />
    </Suspense>
  )
}
```

- [ ] **Step 2: Client component**

Reads both `id` and `sig` from `useSearchParams()`, fetches
`${NEXT_PUBLIC_BA_BOT_URL}/api/quote/${id}?sig=${sig}`, and renders three
states: loading, the markdown body (`.prose-apple` — note
`@tailwindcss/typography` is NOT installed, so `prose` classes do nothing), and
a single failure state for any non-200 or any missing parameter. Follow the
existing `app/work/[slug]/` server/client split.

- [ ] **Step 3: Build and verify**

Run: `pnpm build --force`. Expected: exit 0, `apps/web/out/q/` emitted.

- [ ] **Step 4: Commit**

---

## Task 4: Cloudflare Access JWT verification

**Blocked on P3.** Read the P3 section before starting; if the zone has not
moved, stop and report rather than substituting another auth mechanism.

**Files:**
- Create: `apps/ba-bot-api/src/guards/access.ts`
- Test: `apps/ba-bot-api/test/guards/access.test.ts`

**Design decisions, settled:**

1. **Verify the JWT signature against the Access public keys**
   (`https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`), not merely its
   presence. An unverified header is trivially forged by anyone who can reach
   the Worker — which is the whole reason the second Access application exists.
2. **Check `aud` against the Access application AUD tag.** A JWT signed for a
   *different* application in the same team is otherwise accepted.
3. **Check `exp`.** Reject expired tokens.
4. **Cache the JWKS in KV with a TTL**, not per request — fetching certs on
   every admin call adds latency and a failure mode.
5. **Verification is a Hono middleware mounted on `/admin/*` only.** Public chat
   endpoints stay unauthenticated (spec §12).
6. Use WebCrypto (`crypto.subtle.importKey` / `verify`, RS256). **Add no JWT
   library** — the same constraint that governed `src/util/sign.ts`.

**Tests must cover:** valid token passes; missing header 403; malformed JWT 403;
wrong `aud` 403; expired `exp` 403; **signature signed by a different key 403**;
and — critically — that a token whose signature is not checked at all would be
rejected (mutation-check the verification step out and confirm a test fails).
Reuse the US-008 discipline: `===` on signature bytes survived 147 tests there.

---

## Task 5: Admin read API

**Blocked on P3.**

**Files:**
- Create: `apps/ba-bot-api/src/api/admin.ts`
- Modify: `apps/ba-bot-api/src/db/queries.ts`
- Test: `apps/ba-bot-api/test/api/admin.test.ts`

Endpoints, all behind the Task 4 middleware:

| Route | Returns |
|---|---|
| `GET /admin/leads` | paginated leads + joined quote total |
| `GET /admin/conversation/:id` | transcript, slots per turn, off-topic flags |
| `GET /admin/brief/:conversationId` | `briefs.markdown` |
| `GET /admin/quote/:id` | `quotes.markdown` + payload |
| `GET /admin/funnel` | counts grouped by `abandoned_at_state` |
| `GET /admin/costs` | tokens and cost per conversation, rolling total |
| `GET /admin/export/leads.csv` | CSV |

**Settled:** pagination is required on `/admin/leads` (default 50) — an
unbounded scan is a latent outage once the table grows. CSV export must quote
fields containing commas or quotes; a lead's company name will eventually
contain one.

---

## Task 6: `DELETE /admin/lead/:id` — Privacy Act deletion path

**Blocked on P3.** Spec §8 requires a deletion path. Note the spec writes it as
`DELETE /api/lead/:id` in §8 but §12 requires admin routes under `/admin/*`;
**`/admin/lead/:id` wins** — §12's prefix rule is the operative security
mechanism, since Access matches on path.

**Settled:**
1. **Deletion cascades** to conversations, messages, events, briefs, and quotes
   for that lead. A deletion that leaves the transcript behind has not deleted
   the personal information — the transcript contains what the visitor typed.
2. **`rate_limit` rows are NOT deleted.** They hold a salted hash, not personal
   information, and clearing them would hand an abuser a reset button.
3. **Deletion is logged** as an `events` row against a retained conversation id,
   recording that a deletion occurred without retaining what was deleted.
4. **Return 404 for an unknown lead**, not 403 — this endpoint is already
   behind Access, so enumeration is not a concern here and a truthful status
   helps the operator.

Tests must assert the cascade actually removed every dependent row, by querying
each table — not merely that the endpoint returned 200.

---

## Task 7: Dashboard — leads and conversation views

**Blocked on P3.** `apps/web/app/admin/`, behind Access application 1.

Leads table (sortable, paginated), and a conversation detail view showing the
transcript with slots per turn and off-topic flags. Follow the existing
server/client split and the `globals.css` token layer — never hardcode a hex,
size, radius, or duration.

---

## Task 8: Dashboard — brief, quote, funnel, costs, export

**Blocked on P3.** Renders `briefs.markdown` and `quotes.markdown` verbatim,
plus the funnel (drop-off by `abandoned_at_state`) and cost views, and a CSV
download.

---

## Task 9: Settle the placeholders before the first real client quote

Not code — a decision task, but a launch gate. `progress.txt` records these as
placeholders that must be settled before any client sees a quote:

- `RATE_PER_TASK_AUD = 10`
- `MINIMUM_ENGAGEMENT_AUD = 6000`
- `TASKS_PER_WEEK = 25` — **uncalibrated, and it is a delivery commitment**
- `src/estimator/calibration.ts` — plausible placeholders, **not** real
  `claw-forge plan` output. The entire estimate is only as good as this constant.

Also carried from Plan 2: `below_floor` is not a column, so the idempotent
re-read re-derives it from current env vars. Settle it (a column + migration)
**before** `MINIMUM_ENGAGEMENT_AUD` moves, or a re-read can disagree with the
markdown a client already read.

---

## Execution order

1. **Task 1** — launch blocker, unblocked, highest value
2. **Task 2** — protects existing work from loss; unblocked
3. **Task 3** — makes emailed links resolve; unblocked
4. *P3 gate* — stop here and report if the zone has not moved
5. **Tasks 4 → 5 → 6** — auth before the data it protects
6. **Tasks 7 → 8** — UI last, on a stable API
7. **Task 9** — before the first real client quote
