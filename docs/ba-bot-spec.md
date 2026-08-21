# BA Bot — System Specification

The requirements-elicitation assistant on unodigit.com.au: a floating chat widget
that interviews a prospective client, writes a project brief, prices it, and hands
the visitor a signed link to an indicative quote.

This document describes **what is built and deployed**, not what was planned. Where
a design looks odd, the reason is usually a measured failure — those are called out,
because removing the oddity reintroduces the bug.

- **Status:** live
- **Last verified against the deployed system:** 21 Aug 2026
- **Audience:** whoever maintains this next

---

## 1. Shape of the system

```
Browser  ──►  Cloudflare Pages (static export + _worker.js)
                      │  /api/*  proxied at the edge, same-origin
                      ▼
              Worker: unodigit-ba-bot          ──►  DeepSeek (chat + estimator)
                      │                        ──►  Cloudflare Turnstile
                      ├── D1   ba_bot            (durable record)
                      └── KV   SESSIONS          (live interview state)

admin.claw-forge.net ──►  same Worker, behind Cloudflare Access
```

Two independently deployed units:

| Unit | What | Deploys via |
|---|---|---|
| `apps/web` | Next.js 16 static export, includes the widget | GitHub Actions → Cloudflare Pages |
| `apps/ba-bot-api` | Hono Worker — API, estimator, admin dashboard | `pnpm bot:deploy` (manual) |
| `packages/ba-bot-contract` | Zod schemas shared by both | — |

**The browser never calls the Worker directly.** `apps/web/public/_worker.js` is a
Pages Advanced Mode proxy serving `/api/*` on the site's own origin. Same-origin
means no CORS and no preflight, and the Worker's hostname never reaches the client
bundle. `public/_routes.json` restricts invocation to `/api/*`; without it, Advanced
Mode routes *every* request through the Worker and each static hit becomes a
billable invocation.

Consequence worth remembering: `NEXT_PUBLIC_BA_BOT_URL` is **empty** in production,
and empty is correct — it means same-origin. Any `if (!BOT_API)` check reads that
correct value as "unconfigured". That mistake has shipped twice (it hid the whole
widget once, and broke every quote link once), which is why the constant now lives
in one place, `apps/web/lib/botApi.ts`.

---

## 2. The interview graph

A deterministic finite-state machine in `src/graph/`. The model fills slots; the
**code** decides when to advance. `transitions.ts` is pure and unit-tested.

### 2.1 States and exit gates

Advancement requires `exitGate(slots) && ready_to_advance` — both the code's
judgement and the model's. If a state reaches `maxTurns` without its gate opening it
force-advances (except `CONTACT`).

| State | Exit gate | maxTurns | Next |
|---|---|---|---|
| `GREETING` | always true | 2 | `PROJECT_IDENTITY` |
| `PROJECT_IDENTITY` | `project_name` ∧ `audience` ∧ `problem` | 6 | `SOLUTION_SHAPE` |
| `SOLUTION_SHAPE` | `solution_summary` ∧ `differentiator` | 5 | `USERS_AND_SCOPE` |
| `USERS_AND_SCOPE` | ≥2 `personas` ∧ ≥3 `mvp_must` ∧ ≥1 `mvp_wont` | 7 | `FEATURE_MAP` |
| `FEATURE_MAP` | ≥5 of 7 `covered_categories` | 12 | `CONSTRAINTS` |
| `CONSTRAINTS` | `timeline` ∧ (`budget_band` ∨ `stack_preference`) | 6 | `CONTACT` |
| `CONTACT` | `lead_id` present | 3, **never forces** | `GENERATE` |
| `GENERATE` | always true | 1 | `DONE` |
| `DONE` | terminal | 1 | — |

`CONTACT` must never force-advance: doing so pushes a visitor into `GENERATE` with
no lead row. A visitor who ignores the form stays there until `MAX_TOTAL_TURNS`, and
is correctly recorded as `abandoned_at_state = 'CONTACT'`.

**The gates are the depth control, not `maxTurns`.** States exit at the gate, never
near the cap — with the original gates, interviews finished in 7–8 turns against 36
turns of available budget. Raising `maxTurns` alone changes nothing. Gates and the
prompt addenda must be raised *together*, or the state stalls to its cap.

### 2.2 Slot accumulation

`step()` merges array slots by **union**; scalars overwrite. A plain spread replaces
arrays, and the model reports what it learned *this turn* — so every turn discarded
the areas covered before it and no array gate could ever be satisfied. Measured:
`FEATURE_MAP` ran its full 12-turn budget and force-advanced having recorded zero
categories, while the visitor had walked all seven areas.

Trade-off taken deliberately: a retraction ("drop the weekly report") cannot shrink a
list. That is rarer in a scoping interview than incremental disclosure, and a brief
that over-lists is safer than one that silently forgets.

### 2.3 Slot validation

Each state declares a `.strict()` Zod schema naming exactly the slots it may write.
Validation is **per key**, not per object: one malformed value must not discard its
valid siblings. The all-or-nothing version stalled `PROJECT_IDENTITY` permanently.

This is what keeps `lead_id` unforgeable — no state's schema declares it, so only
`POST /api/contact` can put it in the session.

### 2.4 The closing turn

Every visible reply is written by the state the conversation is **leaving**, so the
model does not know it is writing the last message. On advancing into `CONTACT` the
widget swaps the composer for the form, stranding whatever it wrote — observed as
both an unanswerable question and a promise of a "next topic" that never came.

`graph/handoff.ts` strips trailing questions and continuation promises and appends a
fixed closing line. Continuation keywords are matched **only at the end** of the
reply, so "the next financial year" mid-sentence survives.

The `CONTACT` addendum in `prompts.ts` is therefore unreachable for a visible reply.
It is kept (the `ADDENDA` map must be total over `StateId`) and annotated as such.

---

## 3. Public API

Base path `/api`, served same-origin via the Pages proxy. All responses JSON.

Error codes: `invalid_body`, `challenge_failed`, `turnstile_required`,
`turnstile_failed`, `rate_limited`, `forbidden`, `not_found`, `wrong_state`,
`session_expired`, `internal_error`, `not_configured`.

### `POST /api/chat`

One interview turn.

```jsonc
// request
{ "conversationId": "conv_…",   // omit to start a new interview
  "message": "We need stock tracking across three sites.",
  "turnstileToken": "…" }       // required on the FIRST turn only

// 200
{ "conversationId": "conv_…", "reply": "…", "state": "PROJECT_IDENTITY",
  "finished": false }
```

| Status | Body | When |
|---|---|---|
| 400 | `invalid_body` | fails `ChatRequestSchema` |
| 403 | `turnstile_required` | first turn, no token |
| 403 | `turnstile_failed` | token rejected |
| 404 | `not_found` | unknown `conversationId` |
| 429 | `rate_limited` | over `MAX_TURNS_PER_IP_PER_DAY` |

Order of operations, each step load-bearing:

1. Resolve or create the conversation. **The row is created before the Turnstile
   check**, so a rejected challenge still leaves a conversation row — these appear in
   the funnel's `GREETING` bucket and inflate apparent drop-off. Known, unfixed.
2. Turnstile on turn zero only. Re-challenging mid-interview would interrupt it.
3. Rate limit, recorded *before* the model call — recording after lets a burst all
   read the pre-increment count, and makes a provider outage a free retry loop.
4. Read history, persist the visitor message, run the turn, validate slots, `step()`,
   persist the reply.

### `POST /api/contact`

Captures the lead. Requires explicit `consent: true` — `z.literal(true)`, so an
absent or `false` value is a validation failure, never a default. Under the
Australian Privacy Act implied consent is not consent.

```jsonc
{ "conversationId": "conv_…", "email": "a@b.com", "consent": true,
  "turnstileToken": "…",
  "name": "…", "company": "…", "role": "…", "phone": "…",   // all optional
  "utm": { "source": "…", "medium": "…", "campaign": "…" },
  "referrer": "…", "landingPage": "…" }
→ { "leadId": "lead_…", "state": "GENERATE" }
```

Only `email`, `consent`, `turnstileToken` and `conversationId` are required. `phone`
is not pattern-validated: international formats vary more than a regex captures, and
rejecting a real number on a lead-capture form costs more than storing an odd one.

### `POST /api/generate`

Writes the brief, runs the estimator, prices the quote, returns the signed link.
**Idempotent for a completed generate** — a refresh or double-click returns the
existing artefacts rather than minting new ones, and the check runs *before* the state
gate so a visitor whose brief exists gets it back rather than a 409.

A brief **without** a quote is a different case and is retried. The estimate was
skipped (rate limit) or failed, and returning early regardless turned a transient
condition into a permanent one — observed on a real lead whose network had already
spent the day's quote allowance: it completed a 31-turn interview, wrote its brief,
and could never be priced again. The retry skips the state and slot gates (the brief
proves the interview completed; its session reads `DONE` and its slots may have
expired from KV) and reuses the same brief rather than orphaning it.

```jsonc
{ "conversationId": "conv_…" }
→ { "briefId": "brief_…", "quoteId": "quote_…" | null,
    "quote": { … } | null,
    "quoteUrl": "https://www.unodigit.com.au/q/?id=…&sig=…" | null,
    "headline": "~110 tasks · estimated A$…", "state": "DONE" }
```

409 `wrong_state` if the graph is not at `GENERATE`; 409 `session_expired` if the KV
session lapsed and the durable row cannot supply `project_name` + `problem` (without
those the brief would render "not captured" throughout and be priced from nothing).

Three no-quote exits, each returning a brief and a truthful headline rather than an
error: rate limited (`MAX_QUOTES_PER_IP_PER_DAY`), estimator failed, or below floor.
Only the third is terminal — the first two are retried on a later call.

**Latency: 45–120 s.** It is the slowest call in the product. The widget shows a
progress indicator for the whole window (§5.3).

### `GET /api/quote/:id?sig=…`

Returns the stored quote markdown. The signature is HMAC-SHA256 over the quote id,
hex, verified with `crypto.subtle.verify` (constant-time). **Every failure returns
the same `403 forbidden`** — a bad signature and an unknown id must be
indistinguishable, or the status code alone enumerates which quote ids exist.

Both id and signature go in the **query**, never the path: the site is
`output: 'export'`, so a dynamic `/q/[id]` route cannot be pre-rendered for ids that
do not exist at build time and would resolve to Pages' 404. Do not "tidy" this.

### `GET /health`

Liveness only.

---

## 4. Estimator and pricing

### 4.1 Estimator

`LLM_MODEL_HEAVY` (`deepseek-v4-pro`) is asked for the *shape* of a claw-forge
decomposition — how many feature bullets each of seven categories would contain,
with one sample bullet each — never the bullets themselves.

Two passes. If the first exceeds `PROGRAM_MODE_THRESHOLD` (300 tasks) it re-asks for
a 2–6 subsystem split. A valid oversized single estimate beats no estimate, so a
failed second pass falls back to the first.

**Token ceilings must cover reasoning tokens.** This is the single most repeated
mistake in this codebase — it has appeared four times. Measured against the real
prompts, 5 runs each:

| pass | ceiling | completion tokens | result |
|---|---|---|---|
| single | 8000 | 2429–4618 | 5/5 ok |
| program | 8000 | 7358–8000+ | **4/5 truncated** |
| program | 16000 | 6083–11481 | 5/5 ok |
| program | 24000 | 6701–11647 | 5/5 (no better) |

At the original 1600 the estimator truncated **5 of 5** and `truncated` returned
immediately — so no quote row was ever written and the entire quote feature was dead
in production from launch until 20 Aug 2026.

A truncated *program* pass is the quiet one: `runEstimate` falls back to the single
estimate, so a quote still appears and only the better phased artefact vanishes.

`totalsAgree` rejects a shape whose category counts do not sum to `total_tasks`, and
in program mode each subsystem must also agree with itself — checking only the
umbrella lets one subsystem overstate while another understates.

### 4.2 Pricing

```
weighted   = Σ (bullets × CATEGORY_WEIGHT)
midpoint   = weighted × RATE_PER_TASK_AUD          (A$10)
low / high = midpoint × (1 ∓ band)
weeks      = max(1, ceil(weighted / TASKS_PER_WEEK))
belowFloor = midpoint < MINIMUM_ENGAGEMENT_AUD     (A$2,000)
```

| Category | Weight | | Confidence | Band |
|---|---|---|---|---|
| Integrations | 1.5 | | high | ±25% |
| Core functionality | 1.2 | | medium | ±35% |
| Auth & User Management | 1.0 | | low | ±50% |
| Data management | 1.0 | | | |
| API layer | 1.0 | | | |
| Admin features | 0.9 | | | |
| UI/UX | 0.8 | | | |

**The per-task rate never appears in chat.** It is internal mechanics, shown only in
the quote artefact where the weighting explains it; a rate in the chat invites
negotiation about the decomposition rather than the outcome.

**Below floor replaces the band, it does not accompany it.** Quoting a figure the
business cannot service profitably attracts leads it must then reject.

`belowFloor` is stored on the quote row and read back, never recomputed — the env
vars are documented placeholders that have changed before, and a re-read could
contradict the markdown the client already read.

> **Calibration note.** The floor is 200 weighted tasks (A$2,000 ÷ A$10) while the
> estimator's own prompt describes a typical greenfield project as 100–300 bullets.
> A median genuine enquiry therefore lands near the line and shows no price. Worth
> revisiting as a pricing decision, independently of the software.

---

## 5. Web UI

### 5.1 Widget

`apps/web/components/BaBot/` — mounted **once** in `app/layout.tsx` so the interview
survives client-side navigation.

| File | Role |
|---|---|
| `BaBot.tsx` | Panel, transcript, composer, open/expand/close, attribution capture |
| `useBaBot.ts` | Conversation state, all API calls, `sessionStorage` persistence |
| `ContactForm.tsx` | Replaces the composer at `CONTACT` |
| `Turnstile.tsx` | Explicit-render challenge wrapper |

State persists to `sessionStorage` (`ba-bot:v1`) — single-sitting semantics; a
half-finished interview should not resurface days later.

Sizing lives in `globals.css` as `.babot-panel`, not in the component: adaptive to
`dvh` with a `visualViewport` fallback for mobile keyboards, plus a maximise toggle.

The panel is the translucent layer; **message bubbles are deliberately opaque**.
Stacking two glass surfaces double-blurs both.

### 5.2 First-message queueing

Turnstile takes ~5 s to issue a token. A fast typist could submit before it arrived
and get `turnstile_required`. The widget queues that first message and releases it
when the token lands, with a 15 s timeout fallback.

### 5.3 Generation progress

Between submitting the form and the estimator returning (45–120 s) **neither** the
contact form nor the done block renders — `done` is `finished && state !== 'CONTACT'`
and during generation the state is `GENERATE` with `finished` still false. The panel
sat silently empty and looked broken.

`useBaBot` exposes `generating`, set around the whole call and cleared in `finally`
(the function returns early on a non-OK body, which would otherwise spin forever).
The indicator reuses the transcript's own thinking dots so the wait reads as the same
kind of work.

### 5.4 Contact form

Required: email, consent. Optional: name, company, role, mobile. Stated once —
"Only your email address is required" — rather than tagging four of five fields,
which is how Company came to read as required while being optional in three layers
of code.

Every input carries an `aria-label` stating its optionality; a placeholder is not a
reliable accessible name and vanishes once the field has content.

### 5.5 Quote page — `/q/`

A static shell reading `?id=&sig=`, fetching `GET /api/quote/:id`, rendering the
stored markdown with a small purpose-built renderer, and printing via
`window.print()` — no PDF library, no server round trip.

`renderInline` **recurses**. The quote footer is italic wrapping bold
(`_… **indicative** …_`), and `_[^_]+_` matches across `*`, so a non-recursive pass
emitted the inner `**` markers as literal text.

The renderer never touches `innerHTML`. The markdown contains visitor-supplied text
that flowed through an LLM and is treated as untrusted despite being Worker-generated.

### 5.6 Attribution

`apps/web/lib/attribution.ts` captures at **landing**, not at submit.

Measured: UTM tags do **not** survive client-side navigation. Landing on
`/?utm_source=linkedin` and clicking an in-site link lands on `/work/` with an empty
query string. Since the widget exists to survive navigation, reading the URL at
submit lost the campaign for every visitor who browsed first — all recorded `direct`.

- Stored in `sessionStorage`; last-non-direct wins; an untagged load never overwrites
  a tagged one.
- `document.referrer` is recorded on first capture only — after a client-side
  navigation it reports the previous in-site page.
- Falls back to reading the URL if storage is unavailable.

To attribute a campaign, tag the posted link:

```
https://www.unodigit.com.au/?utm_source=linkedin&utm_medium=social&utm_campaign=launch
```

LinkedIn wraps outbound links in `lnkd.in`; UTM parameters survive the redirect, the
referrer may arrive as `lnkd.in` — another reason to tag rather than rely on referrer.

---

## 6. Admin dashboard

`https://admin.claw-forge.net/` — same Worker, served only on `ADMIN_HOSTNAME`.

### 6.1 Access control

Two gates, in order:

1. **Hostname.** A request for `/admin*` on any other host returns **404, not 403** —
   403 confirms the surface exists.
2. **Cloudflare Access JWT.** RS256 only (`none` and `HS256` rejected), `aud` and
   `iss` checked, `exp` with no grace, 60 s skew on `nbf`/`iat`. JWKS cached per
   isolate for 1 h with a 60 s refetch floor. **Fails closed** if
   `ACCESS_TEAM_DOMAIN` or `ACCESS_AUD` is unset.

All admin responses: `no-store`, `Referrer-Policy: no-referrer`,
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`. The page is a single
self-contained HTML string with `default-src 'none'` CSP; every node is built with
`textContent`, never `innerHTML`.

### 6.2 Endpoints

| Route | Purpose |
|---|---|
| `GET /admin/api/summary?days=` | Overview tiles, funnel, daily series, event counts |
| `GET /admin/api/leads?days=&limit=&q=` | Lead list with quote totals and signed quote URLs |
| `GET /admin/api/events?days=&limit=&type=` | Recent events |
| `GET /admin/api/conversation?id=` | Full transcript for one conversation |
| `GET /admin/api/lead/impact?id=` | Deletion dry run — per-table row counts |
| `POST /admin/api/lead/delete` | Permanent deletion (§6.4) |
| `GET /admin/api/whoami` | Verified Access identity |

### 6.3 Metrics semantics

**All timestamps in this schema are milliseconds** (`Date.now()`). `since(days)`
returns a millisecond bound. It returned *seconds* until 20 Aug 2026, which made
every `created_at >= ?` comparison trivially true — every window silently returned
all time. The same confusion independently broke the daily chart
(`date(ms,'unixepoch')` is out of range and yields NULL) and both dashboard date
columns (year 58602). **Never multiply a timestamp by 1000 here.**

The funnel buckets by `abandoned_at_state`, else the current `state` when `ended_at`
is NULL, else `(completed)`. `abandoned_at_state` is only written by
`/api/generate`, so a visitor who closes the widget leaves it NULL forever —
bucketing on it alone reported 30 conversations as "not abandoned" at 100%, which
reads as "nothing to see" while almost everyone was dropping out at the first
question.

`overview` reports `completed`, `abandoned` and `unfinished` — the third exists
because the first two were both 0 against 30 conversations.

Empty states name the real cause: a filter is active, leads exist outside the window
(with the count), or there are genuinely none yet. A single generic "Nothing in this
window" was *wrong* on the leads table — which took no window at all — and sent
operators to widen a filter that changed nothing.

### 6.4 Lead deletion

The Privacy Act path, mirroring `scripts/admin/delete-lead.sh`, which remains the
reference implementation — divergence between the two is a bug.

Exposing a writer over HTTP reversed a documented decision, so the safeguards were
rebuilt rather than dropped:

- **POST, never GET** — a destructive GET can be fired by a prefetch or crawler.
- **Type the lead's email**, checked server-side so it cannot be bypassed by calling
  the endpoint directly. This is the script's "type the id, not y" translated to a
  browser: a habitual click is how the wrong lead gets deleted.
- **The dry run is the real plan** — the confirmation shows per-table counts from the
  same query that drives the deletion.

Deletion order is children before parents — `quotes → briefs → messages → events →
conversations → leads` — for **reachability**, not FK enforcement: once the
conversations rows are gone there is no way left to find that lead's messages, and
they would be orphaned forever.

`rate_limit` and `rate_limit_turns` are **not** touched. They hold a salted SHA-256
of an IP — not personal information — and are the only thing standing between the bot
and an unmetered provider bill. Clearing them would make "delete my data" double as a
quota reset an abuser could request daily.

The audit event records **that** a deletion happened, never who: no lead id, email or
conversation id. An audit row that identifies the subject defeats the deletion it
records.

---

## 7. Data model

D1 database `ba_bot`. Migrations `0001`–`0005`.

```
leads ──< conversations ──< messages
                        ├─< events
                        └─< briefs ──< quotes

rate_limit         (ip_hash, day, quote_count)     — quotes per IP per day
rate_limit_turns   (ip_hash, day, turns)           — chat turns per IP per day
```

| Table | Notes |
|---|---|
| `leads` | PII. `phone` added in `0005`. `ip_hash` is salted SHA-256, not reversible |
| `conversations` | `state`, `turn_count`, token/cost totals, `abandoned_at_state` |
| `messages` | `content` is the **visitor-facing reply**, not the JSON envelope. `ready_to_advance` added in `0004` |
| `briefs` | Markdown + structured sections |
| `quotes` | Markdown is the canonical artefact; `below_floor` added in `0003` |
| `events` | Every failure signal; `conversation_id` nullable for deletion audits |

KV `SESSIONS` holds the live `ConversationState` (slots included) for 24 h.
`loadSession` falls back to the durable D1 row when the key is gone — KV is a cache,
not the record — but D1 holds only `state` and `turn_count`, which is why
`/api/generate` gates on having real slots.

### 7.1 History replay — the most breakable invariant

`messages.content` stores the visitor-facing reply, because that is what the widget
and dashboard render. But the model is called with `response_format: json_object`,
and replaying bare prose put it in a contradiction: the grammar requires the next
token to open an object while every one of its own prior turns is plain text.

With reasoning off it answered with **whitespace** and `finish_reason: "stop"`, far
under the token ceiling. Dose-dependent in the number of prose assistant turns:

| assistant turns | replayed as | blank |
|---|---|---|
| 0 | — | 0/8 |
| 1 | prose | 3/8 |
| 2 | prose | 13/16 |
| 2 | **envelope** | **0/10** |

`llm/history.ts` rebuilds assistant turns as the four-key JSON envelope. That is why
`ready_to_advance` is stored: it is one of the four keys, and it cannot be faked as a
constant because `step()` advances only on `exitGate(slots) && readyToAdvance`.

Reasoning is now **off** for chat turns (~2.8 s/turn against ~6.9 s) and **on** for
the estimator, the one genuinely analytical call — whose repair path adds an
assistant turn, the exact context shape that makes `thinking: disabled` return
whitespace.

---

## 8. Configuration

Vars in `wrangler.toml`; secrets via `wrangler secret` (synced from 1Password by
`scripts/sync-secrets.sh`).

| Var | Value | Meaning |
|---|---|---|
| `LLM_MODEL` | `deepseek-v4-flash` | Chat turns |
| `LLM_MODEL_HEAVY` | `deepseek-v4-pro` | Estimator |
| `RATE_PER_TASK_AUD` | `10` | Pricing rate |
| `MINIMUM_ENGAGEMENT_AUD` | `2000` | Below-floor threshold |
| `TASKS_PER_WEEK` | `500` | Delivery velocity |
| `PROGRAM_MODE_THRESHOLD` | `300` | Tasks above which a subsystem split is requested |
| `QUOTE_VALID_DAYS` | `30` | Quote validity |
| `MAX_TOTAL_TURNS` | `40` | Per conversation |
| `MAX_TURNS_PER_IP_PER_DAY` | `120` | Chat-turn abuse cap |
| `MAX_QUOTES_PER_IP_PER_DAY` | `3` | Quotes per IP per day — see note below |
| `PUBLIC_SITE_URL` | `https://www.unodigit.com.au` | Base for signed quote links |
| `ADMIN_HOSTNAME` | `admin.claw-forge.net` | Dashboard host gate |

Secrets: `LLM_API_KEY`, `TURNSTILE_SECRET`, `IP_HASH_SALT`,
`QUOTE_LINK_SIGNING_KEY`.

> **Per-IP is per-network.** An office, VPN or mobile carrier egress is a single
> `ip_hash`, so every visitor behind it shares one bucket. The quote cap was 1, which
> made the second genuine enquiry from a company indistinguishable from abuse — and
> did exactly that to a real lead. Raise it rather than lower it if enquiries cluster.

---

## 9. Testing and verification

293 tests via `@cloudflare/vitest-pool-workers` (`pnpm bot:test`). `apps/web` has no
test framework — `pnpm build` is its only automated gate, so UI changes are verified
in a real browser.

Two lessons worth keeping:

- **Verify the surface, not just the store.** "Leads are recorded" was true while the
  portal displayed them under a message blaming a time filter it did not apply. Only
  loading the page found it.
- **Measure the provider, don't reason about it.** Every LLM-layer bug here —
  blank completions, truncated estimates, reasoning-off behaviour — was diagnosed by
  running arms against the real API and counting, and each looked like something else
  from the code alone.

---

## 10. Known gaps

| Gap | Impact |
|---|---|
| A Turnstile-rejected first message still creates a conversation row | Inflates the funnel's `GREETING` bucket; failed challenges look like drop-offs |
| No lint | Next 16 removed `next lint`; `eslint@9` installed but unconfigured. TypeScript is the only static check |
| `apps/web` has no tests | UI regressions are caught by eye |
| Minimum engagement may be miscalibrated | 200 weighted tasks to clear the floor against a 100–300 bullet typical project (§4.2) |
| Worker deploys are manual | Only Pages is in CI. A schema migration must be applied *before* the Worker that depends on it |
