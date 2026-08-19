# Uno Digit BA Bot — Requirements Elicitation Assistant

**Status:** Design — awaiting review
**Date:** 2026-08-18
**Author:** Bowen Li (with Claude)

---

## 1. Context and goal

Uno Digit's marketing site (`uno-digit`, Next.js 14 static export on Cloudflare
Pages) has no lead-capture mechanism beyond a contact form. This project adds an
embedded chatbot that conducts a structured business-analysis interview with a
visitor, then produces two artifacts:

1. A **project brief** — modelled on the BMAD method's Analyst agent output.
2. A **quote** — a cost estimate derived from the number of atomic tasks that
   claw-forge would decompose the project into.

Every conversation, brief, quote, and lead is persisted for sales follow-up and
funnel analysis, surfaced in an internal dashboard.

### Success criteria

- A visitor with a real project reaches a quote in under 10 minutes.
- The bot cannot be diverted into general-purpose chat.
- Inference cost per completed lead stays under A$0.05.
- Sales can see, for every abandoned conversation, which question caused the drop.

### Non-goals

- Running claw-forge itself. No `plan` execution, no task DAG, no agent runs.
  The estimate is an approximation produced from claw-forge's decomposition
  *rules*, not its output.
- Replacing the existing contact form.
- Client-facing authentication. Visitors are anonymous until the contact step.
- PDF generation. Quotes are delivered as HTML email plus a hosted page.

---

## 2. Architecture

The site remains a static export. Migrating `output: 'export'` to OpenNext to
gain one API route would be a large, high-risk change to a working deploy for no
benefit, so the bot backend is a **separate Worker**.

```
┌─────────────────────────────┐
│ uno-digit (Cloudflare Pages)│  static export, unchanged pipeline
│  components/BaBot/          │  'use client' widget, SSE
│  app/start/                 │  full-page variant
│  app/admin/                 │  dashboard (behind Cloudflare Access)
└──────────────┬──────────────┘
               │ fetch / SSE  →  api.unodigit.com
┌──────────────▼──────────────┐
│ apps/ba-bot-api (Worker)    │  Hono
│  graph/     elicitation FSM │
│  llm/       provider adapter│──→ DeepSeek (OpenAI-compatible)
│  estimator/ task decomposer │
│  guards/    turnstile, RL   │
│  mail/      Resend          │──→ Resend
└──────┬───────────────┬──────┘
       │               │
   ┌───▼───┐      ┌────▼────┐
   │  D1   │      │   KV    │
   │ leads │      │ session │
   │ briefs│      │  state  │
   │ quotes│      └─────────┘
   └───────┘
```

**Component boundaries.** Each unit below has one purpose, a typed interface, and
can be tested without the others:

| Unit | Does | Depends on |
|---|---|---|
| `graph/` | Owns conversation state and transitions | nothing (pure) |
| `llm/` | Provider adapter: one turn in, validated object out | secrets |
| `estimator/` | Brief → category decomposition → task counts | `llm/` |
| `pricing/` | Task counts → weighted total → banded quote | nothing (pure) |
| `guards/` | Turnstile, rate limit, consent | D1 |
| `mail/` | Renders and sends the quote email | Resend |
| `db/` | Typed queries | D1 |

`graph/` and `pricing/` are pure and deterministic — they carry most of the
business logic and all of the test coverage.

---

## 3. The elicitation graph

BMAD's Analyst builds a brief section by section, gating each on user feedback.
That gating is the guardrail: the bot always has a *current section* and a
*completion contract*, so any input that isn't a valid transition has an obvious
non-answer.

BMAD's 1–9 "advanced elicitation" menu (Pre-mortem, First Principles, Inversion,
Red Team/Blue Team, …) is **deliberately not adopted**. It targets a power user
in an IDE stress-testing their own thinking; a prospective client on a marketing
site will bounce off a nine-option reasoning menu. The section gating is kept;
the menu is reduced to a binary confirm.

### States

```
GREETING
  → PROJECT_IDENTITY   what / who / what problem      [BMAD: Exec Summary, Problem]
  → SOLUTION_SHAPE     what it does, differentiator   [BMAD: Proposed Solution]
  → USERS_AND_SCOPE    personas, MVP must / won't     [BMAD: Target Users, MVP Scope]
  → FEATURE_MAP        loop over claw-forge categories
  → CONSTRAINTS        stack, timeline, budget band, integrations
  → CONTACT            form component — NOT the LLM
  → GENERATE           brief + estimate + quote
  → DONE
```

`FEATURE_MAP` loops over claw-forge's seven categories, skipping any the project
clearly doesn't have:

Authentication & User Management · Core functionality · Data management ·
UI/UX · API layer · Admin features · Integrations

### State definition

```ts
type StateDef = {
  id: StateId
  systemAddendum: string        // appended to the frozen system prompt
  slotSchema: z.ZodObject<any>  // what this state must fill
  exitGate: (slots) => boolean
  maxTurns: number              // hard cap — force-advance or bail
  onExit?: (ctx) => void
}
```

`maxTurns` is not optional. Without it one confused visitor loops indefinitely on
your account. On exhaustion the state force-advances with whatever slots it has
and records `forced_advance` in `events`.

### Per-turn contract

Every turn returns:

```ts
{
  reply: string
  slots: Record<string, unknown>
  ready_to_advance: boolean
  off_topic: boolean
}
```

When `off_topic` is true, a canned deflection is returned **without a second
model call** — one API call per turn, always.

---

## 4. Guardrails

The original design relied on Anthropic's `output_config.format`, which
schema-constrains generation. **DeepSeek does not have this.** Its
`response_format: {type: "json_object"}` guarantees syntactically valid JSON
only — not schema conformance — and may return empty content. The schema is a
strong hint, not a contract.

Five mitigations, in order of the failure they catch:

1. **Zod `.strict()` parse** server-side. Reject unknown keys; do not trust
   `JSON.parse` alone.
2. **Strict tool calling for slots.** DeepSeek validates function arguments
   against a JSON Schema *before returning*. Use a `record_slots` tool for data
   that is depended on; keep JSON mode for the conversational `reply` only.
3. **Exactly one repair retry**, feeding the validation error back. Then fall
   back to a canned reply. Never retry twice — cost and latency both compound.
4. **Explicit handling of `finish_reason === "length"` and empty content.**
   Both are documented DeepSeek behaviours, not edge cases.
5. **Two tools total** (`record_slots`, `finalise_brief`). No search, no fetch,
   no filesystem. Server-side there is nothing else the model can do.

The word `json` must appear in the prompt — DeepSeek requires it for JSON mode.

### Failure modes

| Failure | Response |
|---|---|
| Invalid JSON after one repair | Canned reply, stay in state, log `llm_parse_failed` |
| Empty content | Same |
| Provider 5xx / timeout | Canned "one moment" reply, retry once with backoff, then apologise and offer the contact form |
| `maxTurns` hit | Force-advance, log `forced_advance` |
| Off-topic | Canned deflection, no extra call |
| Rate-limit hit at GENERATE | Brief still delivered; quote replaced with a book-a-call CTA |

---

## 5. The estimator

### 5.1 The unit

From `claw-forge/.claude/commands/create-spec.md`:

> produces 100-300+ granular feature bullets that become individual agent tasks

**One bullet = one agent task = one unit of cost.** Bullets are formulaic by
contract, enforced by `claw-forge validate-spec`:

1. Start with a recognised subject prefix (`User can` / `System` / `API` / `UI` /
   `Admin` / `Webhook` / …)
2. Contain one measurable outcome (`returns 201`, `saves to`, `displays`)
3. Exactly one action — compound bullets are a hard ERROR
4. Minimum 6 words

That formulaic-ness is what makes a cheap approximation defensible.

### 5.2 Estimate the shape, not the bullets

Generating 100–300 bullets costs ~18,000 output tokens per lead. Instead emit
only the decomposition shape:

```json
{
  "mode": "single",
  "categories": [
    { "name": "Authentication & User Management", "bullets": 14,
      "sample": "User can register with email and password (returns 201 with user_id)" },
    { "name": "Core functionality", "bullets": 52, "sample": "..." },
    { "name": "Integrations", "bullets": 21, "sample": "..." }
  ],
  "total_tasks": 137,
  "confidence": "medium",
  "drivers": ["3 third-party integrations", "multi-tenant", "no mobile app"]
}
```

~400 output tokens — a **45× reduction** — while still showing a credible
breakdown, because one sample bullet per category proves the granularity without
paying for all of them.

Calibration lives in the **cached system prompt**, not in a larger model:
claw-forge's category list, the four bullet rules verbatim, and three reference
decompositions from real past `plan` runs (~40, ~120, ~280 tasks). Few-shot
anchoring on a fixed rubric is what makes a small model's count stable.

### 5.3 Program mode

`create-spec` targets 100–300 bullets per spec. Beyond that, one claw-forge run
is unwieldy and the project should be decomposed into an umbrella system with
subsystem specs, each getting its own `create-spec` run.

When the first-pass estimate exceeds **300 tasks**, the estimator re-runs in
program mode:

```json
{
  "mode": "program",
  "umbrella": "Field Service Management Platform",
  "subsystems": [
    { "name": "Identity & Access",   "categories": [...], "total_tasks": 96,
      "depends_on": [] },
    { "name": "Job Scheduling",      "categories": [...], "total_tasks": 184,
      "depends_on": ["Identity & Access"] },
    { "name": "Mobile Technician App","categories": [...], "total_tasks": 142,
      "depends_on": ["Job Scheduling"] },
    { "name": "Billing & Reporting", "categories": [...], "total_tasks": 118,
      "depends_on": ["Job Scheduling"] }
  ],
  "total_tasks": 540,
  "confidence": "low"
}
```

Each subsystem targets 80–250 tasks. `depends_on` produces the delivery phase
order via topological sort.

This exists for a technical reason and pays off commercially: a A$45,000 total
makes a visitor close the tab, whereas "Phase 1 is A$11,000 over 5 weeks"
converts, without discounting anything.

---

## 6. Pricing and presentation

### 6.1 Weighted tasks

A flat per-task rate ignores complexity variance. Weight by category:

| Category | Weight |
|---|---|
| Integrations | 1.5 |
| Core functionality | 1.2 |
| API layer | 1.0 |
| Authentication & User Management | 1.0 |
| Data management | 1.0 |
| Admin features | 0.9 |
| UI/UX | 0.8 |

```
weighted_tasks = Σ (bullets_c × weight_c)
midpoint       = weighted_tasks × RATE_PER_TASK
```

### 6.2 Band, not point

Band width comes from the estimator's own confidence:

| Confidence | Band |
|---|---|
| high | ±25% |
| medium | ±35% |
| low | ±50% |

A band converts better than a point estimate and protects against estimation
error. A point estimate invites haggling over the decomposition.

### 6.3 Minimum engagement floor

Below `MINIMUM_ENGAGEMENT_AUD`, no quote is shown. The visitor is routed to a
fixed-price starter offer or a call. Quoting A$250 projects attracts leads that
must then be rejected, which is worse for the brand than not quoting.

### 6.4 Timeline

```
weeks = ceil(weighted_tasks / TASKS_PER_WEEK)
```

`TASKS_PER_WEEK` starts at a conservative configured value and **must be
recalibrated against real delivered projects** before the number is shown to
clients. It is a commitment, not a decoration.

### 6.5 What the visitor sees

In chat — headline only, leading with the differentiator:

> **~137 tasks · estimated A$14,000–18,500 · roughly 6 weeks**

The task count is proof of speed and method, not a cost basis to be audited. The
per-task rate is *not* shown in chat; it appears in the email as the explanation
of the number.

In the email — full per-category breakdown, weights, rate, band, assumptions,
exclusions, and validity date.

### 6.6 Quote validity

30 days, stated explicitly, with "indicative — subject to a scoping call"
prominent. This is an estimate produced from an approximation, and it must never
read as a fixed-price offer.

---

## 7. Contact capture

**Contact details are collected by a React form component, not through the
conversation.** The `CONTACT` state renders the form; it POSTs directly to the
Worker and into D1. These fields never enter the LLM message array.

**Email is the only required field.** `name`, `company`, and `role` are
optional, and a phone number is not collected at all. This is a deliberate
data-minimisation decision: the deliverable is a brief and quote sent by email,
so an email address is the one field with a purpose. A mobile number would be
PII held on the off-chance someone wants to call — extra breach surface, an
extra APP 11 obligation, and a form field that costs conversions. Collect only
what is needed.

Better on four axes at once:

- **Privacy** — DeepSeek's API is hosted in China. Under Australian Privacy Act
  **APP 8**, cross-border disclosure of personal information leaves Uno Digit
  accountable for the overseas recipient's handling of it. Keeping PII out of
  the transcript removes the exposure rather than managing it.
- **Reliability** — `type="email"` with real validation beats an LLM parsing an
  address from free text. A quote cannot be emailed to a hallucinated address.
- **Cost** — zero tokens.
- **UX** — mobile keyboards and autofill.

---

## 8. Privacy and compliance

The **project brief still goes to DeepSeek**, and briefs contain commercially
sensitive product concepts. Required before launch:

- **Consent checkbox** at `CONTACT`, with timestamp stored (`consent_marketing`,
  `consent_ts`).
- **Privacy policy disclosure**: "project descriptions are processed by a
  third-party AI provider located outside Australia."
- **Stated retention period** and a deletion path (`DELETE /api/lead/:id`,
  admin-only).
- **Verify DeepSeek's training-data terms for the API plan in use.** Consumer
  and platform terms differ on whether submitted data may be used for training.
  If a client's unreleased product concept can be trained on, that is a
  commercial risk to know before a client asks, not after.

---

## 9. Data model (D1)

```sql
CREATE TABLE leads (
  id                TEXT PRIMARY KEY,
  created_at        INTEGER NOT NULL,
  -- name is nullable and there is no mobile column: see §7, email is the only
  -- required contact field.
  name              TEXT,
  email             TEXT NOT NULL,
  company           TEXT,
  role              TEXT,
  ip_hash           TEXT NOT NULL,
  country           TEXT,
  asn               TEXT,
  user_agent        TEXT,
  utm_source        TEXT,
  utm_medium        TEXT,
  utm_campaign      TEXT,
  referrer          TEXT,
  landing_page      TEXT,
  consent_marketing INTEGER NOT NULL DEFAULT 0,
  consent_ts        INTEGER
);

CREATE TABLE conversations (
  id                 TEXT PRIMARY KEY,
  lead_id            TEXT REFERENCES leads(id),
  started_at         INTEGER NOT NULL,
  ended_at           INTEGER,
  state              TEXT NOT NULL,
  turn_count         INTEGER NOT NULL DEFAULT 0,
  tokens_in          INTEGER NOT NULL DEFAULT 0,
  tokens_out         INTEGER NOT NULL DEFAULT 0,
  cost_usd           REAL    NOT NULL DEFAULT 0,
  abandoned_at_state TEXT
);

CREATE TABLE messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  seq             INTEGER NOT NULL,
  role            TEXT NOT NULL,
  content         TEXT NOT NULL,
  slots_json      TEXT,
  off_topic       INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL
);

CREATE TABLE briefs (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  markdown        TEXT NOT NULL,
  sections_json   TEXT NOT NULL,
  created_at      INTEGER NOT NULL
);

CREATE TABLE quotes (
  id              TEXT PRIMARY KEY,
  brief_id        TEXT NOT NULL REFERENCES briefs(id),
  markdown        TEXT NOT NULL,
  mode            TEXT NOT NULL,          -- 'single' | 'program'
  total_tasks     INTEGER NOT NULL,
  weighted_tasks  REAL NOT NULL,
  rate_aud        REAL NOT NULL,
  low_aud         REAL NOT NULL,
  high_aud        REAL NOT NULL,
  weeks           INTEGER NOT NULL,
  confidence      TEXT NOT NULL,
  categories_json TEXT NOT NULL,
  subsystems_json TEXT,                   -- program mode only
  valid_until     INTEGER NOT NULL,
  created_at      INTEGER NOT NULL
);

CREATE TABLE rate_limit (
  ip_hash     TEXT NOT NULL,
  day         TEXT NOT NULL,
  quote_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, day)
);

CREATE TABLE events (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES conversations(id),
  type            TEXT NOT NULL,
  payload_json    TEXT,
  created_at      INTEGER NOT NULL
);
```

**Both artifacts are stored as markdown** — `briefs.markdown` and
`quotes.markdown` — rendered client-side in the dashboard and reused verbatim as
the email body source. Storing markdown rather than HTML keeps one canonical
representation for the dashboard, the email, and any later export to a
claw-forge `app_spec`.

`conversations.abandoned_at_state` is the highest-value column in the schema: it
identifies exactly which question kills the funnel.

---

## 10. Rate limiting

One completed quote per IP per day, with three qualifications.

**Layers:**

1. **Turnstile** on the first message. Free, Cloudflare-native, removes most
   automation.
2. **Hashed + salted `cf.connectingIp`** → `rate_limit` ledger.
3. **Email-domain dedupe** at contact capture.

**The limit applies to the quote, not the chat.** Carrier-grade NAT means one
IPv4 can be an entire office; blocking someone mid-conversation because a
colleague quoted yesterday burns a real lead for no security benefit. Visitors
always complete the interview and always receive the brief. A second quote from
the same IP within 24h is replaced by:

> Looks like your team already has a quote from us — book a call and we'll
> refine it together.

The limit becomes a conversion path rather than a wall.

---

## 11. Email (Resend)

HTML only, no attachment. Sent on `GENERATE` completion.

- Body rendered from `quotes.markdown` + `briefs.markdown` into an HTML email
  template (React Email or a plain template string).
- Includes a link to a hosted quote page. The hosted page gives view tracking,
  mobile rendering, and the ability to revise a quote without re-sending.

**Hosted quote page under static export.** The site is `output: 'export'`, so a
dynamic `/q/[id]` route cannot be pre-rendered for IDs that do not exist at build
time. Two workable options:

- **A static shell** at `app/q/page.tsx` that reads `?id=…&sig=…` from the query
  string and fetches the rendered quote from the Worker client-side. Keeps the
  page on the marketing domain and inside the existing deploy. **Preferred.**
- The Worker serves the page directly on its own hostname.

The signature is an HMAC of the quote id using `QUOTE_LINK_SIGNING_KEY`; the
Worker rejects any request whose signature does not verify, so quote ids are not
enumerable.
- Sender domain must be DNS-verified in Resend (SPF/DKIM) before launch, or
  quotes land in spam.
- Send failures are logged to `events` and retried once; a failed send must never
  block the chat from completing.

---

## 12. Dashboard

`app/admin/` on the existing static site, calling the Worker's admin API,
protected by **Cloudflare Access** (Zero Trust).

Access is free for up to 50 users and provides Google SSO or email OTP. No
password hashing, no session store, no reset flow, no credential to leak — for
an internal dashboard, hand-rolled auth would be the most likely source of a
security incident in the project.

**Two Access applications are required, not one.** Protecting only the Pages
route leaves the Worker's admin API open to anyone who knows the URL, since the
dashboard is a static page calling `api.unodigit.com` from the browser:

1. `unodigit.com/admin/*` — protects the dashboard UI.
2. `api.unodigit.com/admin/*` — protects the data. Access injects
   `Cf-Access-Jwt-Assertion` on requests to this hostname; the Worker verifies
   the JWT against the Access public keys and rejects anything unsigned.

Admin API routes must be under a distinct `/admin/*` prefix so the public chat
endpoints stay unauthenticated.

**Views:**

| View | Shows |
|---|---|
| Leads | name (optional), email, company, source, date, quote total |
| Conversation | full transcript, slots per turn, off-topic flags |
| Brief | rendered markdown from `briefs.markdown` |
| Quote | rendered markdown from `quotes.markdown` |
| Funnel | drop-off by `abandoned_at_state` |
| Costs | tokens and cost per conversation, rolling total |
| Export | CSV of leads |

---

## 13. Configuration and secrets

Set via `wrangler secret put`. `[vars]` in `wrangler.toml` is plaintext and
visible in the dashboard, so provider configuration is stored as secrets even
where not strictly confidential — this also allows swapping provider or model
without a code deploy.

```
LLM_BASE_URL           https://api.deepseek.com
LLM_MODEL              <V4-Flash id>     # chat turns
LLM_MODEL_HEAVY        <V4-Pro id>       # brief + estimator
LLM_API_KEY
RESEND_API_KEY
TURNSTILE_SECRET
IP_HASH_SALT
QUOTE_LINK_SIGNING_KEY
```

Non-secret tunables in `[vars]`:

```
RATE_PER_TASK_AUD
MINIMUM_ENGAGEMENT_AUD
TASKS_PER_WEEK
PROGRAM_MODE_THRESHOLD   = 300
QUOTE_VALID_DAYS         = 30
MAX_TURNS_TOTAL
```

The LLM client is written against the **OpenAI chat-completions shape** behind a
thin adapter interface, so DeepSeek, Groq, Together, and OpenAI need only a
secret change. Anthropic is not natively OpenAI-compatible; the adapter is what
keeps that option open.

**Secrets cannot be read back after `put`.** They must be recorded in a password
manager at the time of setting, never in the repo.

---

## 14. Cost model

DeepSeek applies automatic disk-based prefix caching — no `cache_control`
markers, no code changes. Cache hits are roughly 98% cheaper than misses.

| Item | Tokens | Cost |
|---|---|---|
| Chat, 12 turns, ~90% cache hit (V4-Flash) | ~83k in / 3k out | ~$0.002 |
| Brief + estimator (V4-Pro) | ~6k in / 3k out | ~$0.005 |
| **Per completed lead** | | **~$0.007** |

~$1.40/month at 200 leads. Off-peak billing halves it again.

The caching discipline matters *more* under automatic caching, not less: it is
still a **prefix** match, so a timestamp or session ID interpolated into the
system prompt silently drops every request to the expensive tier. The system
prompt must be byte-frozen; anything volatile goes at the end of the message
array.

Workers, D1, KV, Turnstile, and Cloudflare Access all sit within free tiers at
this volume.

---

## 15. Build order

1. Worker skeleton, D1 schema, `/health`
2. **Graph engine with fixture replies, no LLM** — proves transitions,
   `exitGate`, and `maxTurns` with zero inference spend
3. LLM adapter: JSON mode + strict tool calling + Zod + repair retry
4. **Estimator and calibration set** — the load-bearing work; the reference
   decompositions must come from real past claw-forge `plan` outputs
5. Pricing module (pure, fully unit-tested)
6. Brief and quote markdown generation
7. Widget, SSE streaming, contact form
8. Turnstile, rate limit, consent
9. Resend email + hosted quote page
10. Dashboard behind Cloudflare Access

Steps 2 and 5 are pure and deterministic and should be developed test-first.

---

## 16. Open questions

- `RATE_PER_TASK_AUD` — not yet fixed.
- `MINIMUM_ENGAGEMENT_AUD` — not yet fixed.
- `TASKS_PER_WEEK` — needs calibration from delivered projects before the
  timeline is shown to clients.
- Whether to include a "vs conventional team" comparison anchor in the quote.
  It is the strongest conversion lever available but is a marketing claim that
  must be defensible; deferred pending real delivery data.
- ~~Widget placement: floating on all pages, `/start` only, or both.~~ **Decided
  2026-08-18: floating on all pages.** `<BaBot />` mounts once in
  `apps/web/app/layout.tsx`, so the interview also survives client-side
  navigation between routes. `app/start/` was not built.
