# BA Bot — Estimator & Artifacts Implementation Plan (Plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `GENERATE` from a wired-but-inert state into the step that produces a project brief, an indicative quote, and an email — the commercial output of the whole product.

**Architecture:** An estimator asks the model for the *shape* of a claw-forge decomposition (categories and counts) rather than 100–300 individual bullets, cutting output tokens ~45×. A pure pricing module turns that shape into a banded figure. Two pure renderers emit markdown, which is the canonical stored form for both the dashboard and the email. One orchestration route ties them together behind a rate-limit check.

**Tech Stack:** TypeScript, Cloudflare Workers, Hono 4, Zod 3, D1, KV, Resend, Vitest + `@cloudflare/vitest-pool-workers`, Turbo 2, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-18-ba-bot-design.md`

**Builds on Plan 1** (`docs/superpowers/plans/2026-08-18-ba-bot-conversation-engine.md`), which is complete and merged: 68 tests, the state machine, the LLM adapter, and the `briefs`/`quotes`/`rate_limit` tables that this plan is the first to write to.

## Global Constraints

- Monorepo: Worker at `apps/ba-bot-api`, shared wire types at `packages/ba-bot-contract`. Package manager **pnpm**; run Worker commands from `apps/ba-bot-api`.
- `zod` pinned `^3.24.1` everywhere. Add no dependency except the Resend HTTP call, which uses `fetch` — **do not install the Resend SDK.**
- `pnpm test -- <name>` does not narrow under vitest 4. Run the full suite (~2s).
- Tests must construct `Response` **lazily** (`mockImplementation(async () => new Response(...))`). The eager `mockResolvedValue(new Response(...))` form fails under workerd with "Cannot perform I/O on behalf of a different request".
- Test invocation is `import { env, exports } from 'cloudflare:workers'` and `exports.default.fetch(input, init?)` — a pre-bound stub taking no `env`/`ctx`. `cloudflare:test` is deprecated for `env`.
- **No lead field (`name`, `email`) may reach `src/llm/` or `src/graph/prompts.ts`.** The provider is DeepSeek, hosted in China; under Australian Privacy Act APP 8 this is the highest-consequence constraint in the project. The estimator sees the project description only. Guard: `grep -rnE "\b(name|email)\b" src/llm/ src/graph/prompts.ts src/estimator/` must return only the prompt line instructing the model *not* to ask.
- **The frozen system prompt must stay byte-identical across requests.** No timestamps, ids, or interpolation. DeepSeek's prefix cache is a byte match and ~98% cheaper on hits.
- `step()` returns `slots`/`forcedAdvances` **by reference** when unchanged. Never `push()` or assign into them; always spread.
- Existing suite is **68 tests / 8 files, zero warnings**. Every task states its expected new total; output must stay pristine.

---

## File Structure

```
packages/ba-bot-contract/src/
  index.ts                    ← extended (Task 1)

apps/ba-bot-api/src/
  estimator/
    categories.ts             the 7 claw-forge categories + weights (pure data)
    calibration.ts            frozen reference decompositions for the prompt
    prompt.ts                 frozen estimator system prompt
    estimate.ts               runEstimate(): brief -> shape, single + program
  pricing/
    quote.ts                  shape -> weighted tasks -> banded quote (pure)
  render/
    brief.ts                  slots -> brief markdown (pure)
    quote.ts                  quote -> quote markdown (pure)
  api/
    generate.ts               POST /api/generate orchestration
    quote.ts                  GET  /api/quote/:id (HMAC-signed)
  mail/
    resend.ts                 fetch-based Resend client
  util/
    sign.ts                   HMAC sign/verify for quote links
  db/
    queries.ts                ← extended: brief/quote insert + read
```

**Boundary rationale.** `pricing/` and `render/` are pure and deterministic — they hold the commercially-sensitive logic and carry the heaviest tests. `estimator/` owns the only new LLM call. `api/generate.ts` is orchestration with no business logic, so pricing changes never touch a route.

---

### Task 1: Contract additions

**Files:**
- Modify: `packages/ba-bot-contract/src/index.ts`
- Test: none (types only; consumed and thereby tested by every later task)

**Interfaces produced:**
- `CategoryNameSchema` / `CategoryName` — the 7 claw-forge categories
- `ConfidenceSchema` / `Confidence` — `'high' | 'medium' | 'low'`
- `EstimateCategorySchema` — `{ name, bullets, sample }`
- `SubsystemSchema` — `{ name, categories, total_tasks, depends_on }`
- `EstimateShapeSchema` / `EstimateShape` — the estimator's output, single or program
- `QuoteSchema` / `Quote` — the priced result
- `GenerateResponseSchema` / `GenerateResponse` — what `POST /api/generate` returns

- [ ] **Step 1: Append to `packages/ba-bot-contract/src/index.ts`**

```ts
/** The seven categories claw-forge's create-spec walks. Order is stable and
 *  load-bearing: the estimator prompt lists them in this order, and the
 *  pricing weights are keyed off these exact strings. */
export const CategoryNameSchema = z.enum([
  'Authentication & User Management',
  'Core functionality',
  'Data management',
  'UI/UX',
  'API layer',
  'Admin features',
  'Integrations',
])
export type CategoryName = z.infer<typeof CategoryNameSchema>

export const ConfidenceSchema = z.enum(['high', 'medium', 'low'])
export type Confidence = z.infer<typeof ConfidenceSchema>

/** One category's share of the decomposition. `sample` is a single example
 *  bullet — enough to show the visitor the granularity without paying output
 *  tokens for all 100-300 of them. */
export const EstimateCategorySchema = z
  .object({
    name: CategoryNameSchema,
    bullets: z.number().int().min(0).max(400),
    sample: z.string().min(1).max(300),
  })
  .strict()
export type EstimateCategory = z.infer<typeof EstimateCategorySchema>

export const SubsystemSchema = z
  .object({
    name: z.string().min(1).max(120),
    categories: z.array(EstimateCategorySchema).min(1),
    total_tasks: z.number().int().min(1).max(400),
    depends_on: z.array(z.string()).default([]),
  })
  .strict()
export type Subsystem = z.infer<typeof SubsystemSchema>

/** Estimator output. `single` is one claw-forge spec; `program` splits a large
 *  project into subsystems because create-spec targets 100-300 bullets per spec
 *  and beyond that one run is unwieldy. */
export const EstimateShapeSchema = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('single'),
      categories: z.array(EstimateCategorySchema).min(1),
      total_tasks: z.number().int().min(1).max(400),
      confidence: ConfidenceSchema,
      drivers: z.array(z.string().max(200)).default([]),
    })
    .strict(),
  z
    .object({
      mode: z.literal('program'),
      umbrella: z.string().min(1).max(160),
      subsystems: z.array(SubsystemSchema).min(2),
      total_tasks: z.number().int().min(1),
      confidence: ConfidenceSchema,
      drivers: z.array(z.string().max(200)).default([]),
    })
    .strict(),
])
export type EstimateShape = z.infer<typeof EstimateShapeSchema>

export const QuoteSchema = z
  .object({
    mode: z.enum(['single', 'program']),
    totalTasks: z.number().int(),
    weightedTasks: z.number(),
    rateAud: z.number(),
    lowAud: z.number().int(),
    highAud: z.number().int(),
    weeks: z.number().int(),
    confidence: ConfidenceSchema,
    belowFloor: z.boolean(),
  })
  .strict()
export type Quote = z.infer<typeof QuoteSchema>

/** POST /api/generate. `quote` is absent when the rate limit was hit or the
 *  project priced below the engagement floor — the brief is still delivered. */
export const GenerateResponseSchema = z
  .object({
    briefId: z.string(),
    quoteId: z.string().nullable(),
    quote: QuoteSchema.nullable(),
    headline: z.string(),
    state: StateIdSchema,
  })
  .strict()
export type GenerateResponse = z.infer<typeof GenerateResponseSchema>
```

- [ ] **Step 2: Typecheck**

Run from `packages/ba-bot-contract`: `pnpm typecheck`
Expected: exit 0, no output.

- [ ] **Step 3: Confirm the Worker still typechecks against it**

Run from `apps/ba-bot-api`: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/ba-bot-contract/src/index.ts
git commit -m "feat(contract): add estimator, quote, and generate wire types"
```

---

### Task 2: Pricing module (pure)

The commercially load-bearing module. Fully deterministic — no I/O, no LLM.

**Files:**
- Create: `apps/ba-bot-api/src/estimator/categories.ts`
- Create: `apps/ba-bot-api/src/pricing/quote.ts`
- Test: `apps/ba-bot-api/test/pricing/quote.test.ts`

**Interfaces:**
- Consumes: `EstimateShape`, `Quote`, `CategoryName` (Task 1)
- Produces:
  - `CATEGORY_WEIGHTS: Record<CategoryName, number>`
  - `interface PricingConfig { rateAud: number; minimumAud: number; tasksPerWeek: number; quoteValidDays: number }`
  - `function weightedTasks(shape: EstimateShape): number`
  - `function priceQuote(shape: EstimateShape, cfg: PricingConfig): Quote`

- [ ] **Step 1: Write the failing test**

`test/pricing/quote.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { CATEGORY_WEIGHTS } from '../../src/estimator/categories'
import { weightedTasks, priceQuote, type PricingConfig } from '../../src/pricing/quote'
import type { EstimateShape } from '@unodigit/ba-bot-contract'

const cfg: PricingConfig = {
  rateAud: 10,
  minimumAud: 6000,
  tasksPerWeek: 25,
  quoteValidDays: 30,
}

const single = (cats: Array<[string, number]>, confidence: 'high' | 'medium' | 'low' = 'high'): EstimateShape => ({
  mode: 'single',
  categories: cats.map(([name, bullets]) => ({ name: name as never, bullets, sample: 'User can do a thing (returns 201)' })),
  total_tasks: cats.reduce((n, [, b]) => n + b, 0),
  confidence,
  drivers: [],
})

describe('CATEGORY_WEIGHTS', () => {
  it('covers all seven categories', () => {
    expect(Object.keys(CATEGORY_WEIGHTS)).toHaveLength(7)
  })

  it('weights integrations above UI/UX', () => {
    expect(CATEGORY_WEIGHTS['Integrations']).toBeGreaterThan(CATEGORY_WEIGHTS['UI/UX'])
  })
})

describe('weightedTasks', () => {
  it('applies the per-category weight', () => {
    // 10 Integrations @1.5 = 15; 10 UI/UX @0.8 = 8 -> 23
    const shape = single([['Integrations', 10], ['UI/UX', 10]])
    expect(weightedTasks(shape)).toBeCloseTo(23, 5)
  })

  it('sums across subsystems in program mode', () => {
    const shape: EstimateShape = {
      mode: 'program',
      umbrella: 'Platform',
      subsystems: [
        { name: 'A', categories: [{ name: 'Integrations', bullets: 10, sample: 'x' }], total_tasks: 10, depends_on: [] },
        { name: 'B', categories: [{ name: 'UI/UX', bullets: 10, sample: 'x' }], total_tasks: 10, depends_on: ['A'] },
      ],
      total_tasks: 20,
      confidence: 'low',
      drivers: [],
    }
    expect(weightedTasks(shape)).toBeCloseTo(23, 5)
  })
})

describe('priceQuote', () => {
  it('bands +/-25% at high confidence', () => {
    const q = priceQuote(single([['API layer', 100]], 'high'), cfg)
    // 100 tasks @1.0 weight @ $10 = $1000 midpoint
    expect(q.weightedTasks).toBeCloseTo(100, 5)
    expect(q.lowAud).toBe(750)
    expect(q.highAud).toBe(1250)
  })

  it('widens the band at medium and low confidence', () => {
    expect(priceQuote(single([['API layer', 100]], 'medium'), cfg).lowAud).toBe(650)
    expect(priceQuote(single([['API layer', 100]], 'low'), cfg).lowAud).toBe(500)
  })

  it('flags projects below the engagement floor', () => {
    // 100 tasks -> $1000 midpoint, under the $6000 minimum
    expect(priceQuote(single([['API layer', 100]]), cfg).belowFloor).toBe(true)
  })

  it('does not flag projects at or above the floor', () => {
    expect(priceQuote(single([['API layer', 600]]), cfg).belowFloor).toBe(false)
  })

  it('derives a whole number of weeks, rounding up', () => {
    // 100 weighted / 25 per week = 4
    expect(priceQuote(single([['API layer', 100]]), cfg).weeks).toBe(4)
    // 101 weighted -> 4.04 -> 5
    expect(priceQuote(single([['API layer', 101]]), cfg).weeks).toBe(5)
  })

  it('always reports at least one week', () => {
    expect(priceQuote(single([['API layer', 1]]), cfg).weeks).toBe(1)
  })

  it('returns whole-dollar band bounds', () => {
    const q = priceQuote(single([['Integrations', 37]], 'medium'), cfg)
    expect(Number.isInteger(q.lowAud)).toBe(true)
    expect(Number.isInteger(q.highAud)).toBe(true)
  })

  it('carries mode, totalTasks and confidence through', () => {
    const q = priceQuote(single([['API layer', 100]], 'medium'), cfg)
    expect(q.mode).toBe('single')
    expect(q.totalTasks).toBe(100)
    expect(q.confidence).toBe('medium')
    expect(q.rateAud).toBe(10)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — cannot resolve `../../src/pricing/quote`.

- [ ] **Step 3: Write `src/estimator/categories.ts`**

```ts
import type { CategoryName } from '@unodigit/ba-bot-contract'

/**
 * Per-category cost multipliers.
 *
 * A flat per-task rate ignores real complexity variance: an Integrations task
 * (third-party auth, webhooks, retries) is not a UI/UX task (a loading state).
 * These weights are deliberate commercial policy, not measurements — change
 * them when delivery data says to, not to make a number look better.
 */
export const CATEGORY_WEIGHTS: Record<CategoryName, number> = {
  'Integrations': 1.5,
  'Core functionality': 1.2,
  'API layer': 1.0,
  'Authentication & User Management': 1.0,
  'Data management': 1.0,
  'Admin features': 0.9,
  'UI/UX': 0.8,
}
```

- [ ] **Step 4: Write `src/pricing/quote.ts`**

```ts
import type { EstimateShape, Quote, Confidence } from '@unodigit/ba-bot-contract'
import { CATEGORY_WEIGHTS } from '../estimator/categories'

export interface PricingConfig {
  rateAud: number
  minimumAud: number
  tasksPerWeek: number
  quoteValidDays: number
}

/**
 * Band width by estimator confidence. A band converts better than a point
 * estimate and protects against estimation error; a point estimate invites
 * haggling over the decomposition rather than the outcome.
 */
const BAND: Record<Confidence, number> = {
  high: 0.25,
  medium: 0.35,
  low: 0.5,
}

export function weightedTasks(shape: EstimateShape): number {
  const cats =
    shape.mode === 'single'
      ? shape.categories
      : shape.subsystems.flatMap((s) => s.categories)

  return cats.reduce((sum, c) => sum + c.bullets * CATEGORY_WEIGHTS[c.name], 0)
}

export function priceQuote(shape: EstimateShape, cfg: PricingConfig): Quote {
  const weighted = weightedTasks(shape)
  const midpoint = weighted * cfg.rateAud
  const band = BAND[shape.confidence]

  return {
    mode: shape.mode,
    totalTasks: shape.total_tasks,
    weightedTasks: weighted,
    rateAud: cfg.rateAud,
    lowAud: Math.round(midpoint * (1 - band)),
    highAud: Math.round(midpoint * (1 + band)),
    // Never report zero weeks — a quote promising delivery in no time reads as
    // a bug, not as speed.
    weeks: Math.max(1, Math.ceil(weighted / cfg.tasksPerWeek)),
    confidence: shape.confidence,
    belowFloor: midpoint < cfg.minimumAud,
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS. Suite total **80 tests / 9 files**, zero warnings.

- [ ] **Step 6: Commit**

```bash
git add apps/ba-bot-api/src/estimator/categories.ts apps/ba-bot-api/src/pricing apps/ba-bot-api/test/pricing
git commit -m "feat(ba-bot): add category-weighted banded pricing"
```

---

### Task 3: Estimator — single mode

**Files:**
- Create: `apps/ba-bot-api/src/estimator/calibration.ts`
- Create: `apps/ba-bot-api/src/estimator/prompt.ts`
- Create: `apps/ba-bot-api/src/estimator/estimate.ts`
- Test: `apps/ba-bot-api/test/estimator/estimate.test.ts`

**Interfaces:**
- Consumes: `LlmClient`, `ChatMessage` (`src/llm/types.ts`); `EstimateShapeSchema` (Task 1)
- Produces:
  - `const ESTIMATOR_SYSTEM_PROMPT: string` (frozen)
  - `const CALIBRATION: string` (frozen)
  - `type EstimateResult = { ok: true; shape: EstimateShape; promptTokens: number; completionTokens: number } | { ok: false; reason: 'parse' | 'empty' | 'truncated' | 'provider' }`
  - `function runEstimate(client: LlmClient, args: { model: string; briefText: string; programThreshold: number }): Promise<EstimateResult>`

- [ ] **Step 1: Write the failing test**

`test/estimator/estimate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { runEstimate } from '../../src/estimator/estimate'
import { ESTIMATOR_SYSTEM_PROMPT } from '../../src/estimator/prompt'
import type { LlmClient, ChatResponse } from '../../src/llm/types'

function stub(responses: Array<Partial<ChatResponse>>): LlmClient & { calls: number; lastMessages: unknown } {
  let i = 0
  const c = {
    calls: 0,
    lastMessages: null as unknown,
    async chat(req: { messages: unknown }): Promise<ChatResponse> {
      c.calls += 1
      c.lastMessages = req.messages
      const r = responses[Math.min(i++, responses.length - 1)]!
      return {
        content: r.content ?? '',
        finishReason: r.finishReason ?? 'stop',
        promptTokens: r.promptTokens ?? 500,
        completionTokens: r.completionTokens ?? 200,
      }
    },
  }
  return c as never
}

const validSingle = JSON.stringify({
  mode: 'single',
  categories: [
    { name: 'Core functionality', bullets: 52, sample: 'User can create a booking (returns 201 with booking_id)' },
    { name: 'API layer', bullets: 20, sample: 'API returns 422 with a field-level errors array' },
  ],
  total_tasks: 72,
  confidence: 'medium',
  drivers: ['two integrations'],
})

const args = { model: 'test-heavy', briefText: 'A booking system for dog groomers.', programThreshold: 300 }

describe('runEstimate', () => {
  it('returns a validated single-mode shape', async () => {
    const client = stub([{ content: validSingle }])
    const r = await runEstimate(client, args)

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.shape.mode).toBe('single')
    expect(r.shape.total_tasks).toBe(72)
    expect(client.calls).toBe(1)
  })

  it('sends the frozen prompt as the first message, unmodified', async () => {
    const client = stub([{ content: validSingle }])
    await runEstimate(client, args)

    const msgs = client.lastMessages as Array<{ role: string; content: string }>
    expect(msgs[0]!.role).toBe('system')
    expect(msgs[0]!.content).toBe(ESTIMATOR_SYSTEM_PROMPT)
  })

  it('rejects unknown keys (strict schema)', async () => {
    const bad = JSON.stringify({ ...JSON.parse(validSingle), injected: true })
    const client = stub([{ content: bad }, { content: bad }])
    const r = await runEstimate(client, args)

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('parse')
  })

  it('retries exactly once on malformed JSON, then succeeds', async () => {
    const client = stub([{ content: 'not json' }, { content: validSingle }])
    const r = await runEstimate(client, args)

    expect(r.ok).toBe(true)
    expect(client.calls).toBe(2)
  })

  it('never retries more than once', async () => {
    const client = stub([{ content: 'nope' }, { content: 'still nope' }])
    const r = await runEstimate(client, args)

    expect(r.ok).toBe(false)
    expect(client.calls).toBe(2)
  })

  it('reports truncation without retrying', async () => {
    const client = stub([{ content: '{"mode":"sing', finishReason: 'length' }])
    const r = await runEstimate(client, args)

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('truncated')
    expect(client.calls).toBe(1)
  })

  it('reports provider failure when the client throws', async () => {
    const client: LlmClient = { async chat() { throw new Error('502') } }
    const r = await runEstimate(client, args)

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('provider')
  })

  it('rejects a shape whose category counts contradict total_tasks', async () => {
    const inconsistent = JSON.stringify({
      mode: 'single',
      categories: [{ name: 'API layer', bullets: 10, sample: 'x' }],
      total_tasks: 999,
      confidence: 'high',
      drivers: [],
    })
    const client = stub([{ content: inconsistent }, { content: inconsistent }])
    const r = await runEstimate(client, args)

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('parse')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — cannot resolve `../../src/estimator/estimate`.

- [ ] **Step 3: Write `src/estimator/calibration.ts`**

```ts
/**
 * FROZEN. Reference decompositions that anchor the estimator's counts.
 *
 * A small model gives stable numbers when it has worked examples to interpolate
 * between, and drifts badly without them. These three span the realistic range.
 *
 * REPLACE THESE with real `claw-forge plan` outputs before trusting a quote in
 * front of a client. They are plausible placeholders, not measurements, and the
 * whole estimate is only as calibrated as this constant.
 */
export const CALIBRATION = `Reference decompositions, for scale:

A. Single-user expense tracker. CRUD, CSV export, one auth method, no integrations.
   Authentication & User Management 6, Core functionality 14, Data management 8,
   UI/UX 9, API layer 5, Admin features 0, Integrations 0. Total 42. Confidence high.

B. Multi-tenant booking platform. Roles, calendar, Stripe, email + SMS reminders.
   Authentication & User Management 14, Core functionality 38, Data management 18,
   UI/UX 20, API layer 14, Admin features 8, Integrations 16. Total 128. Confidence medium.

C. Field-service management suite. Dispatch, mobile technician app, inventory,
   invoicing, three third-party integrations, offline sync.
   Authentication & User Management 20, Core functionality 96, Data management 42,
   UI/UX 46, API layer 30, Admin features 18, Integrations 32. Total 284. Confidence low.`
```

- [ ] **Step 4: Write `src/estimator/prompt.ts`**

```ts
import { CALIBRATION } from './calibration'

/**
 * FROZEN. Never interpolate a timestamp, id, or per-request value — DeepSeek's
 * prefix cache is a byte match and one volatile character drops every request to
 * the uncached tier. `CALIBRATION` is itself a frozen constant, so composing it
 * here is safe.
 *
 * The literal word "json" must remain: DeepSeek requires it whenever
 * response_format is json_object.
 */
export const ESTIMATOR_SYSTEM_PROMPT = `You estimate how much software a project needs, using the decomposition rules of a coding harness called claw-forge.

claw-forge breaks a project into granular feature bullets, each of which becomes one agent task. Bullets are formulaic:
- each starts with a subject: "User can", "User cannot", "System", "API", "UI", "Admin", "Service", "Webhook", "Background"
- each contains exactly one action, never two joined by "and then" or "and also"
- each states one measurable outcome: returns 201, saves to a table, displays a message, emits an event
- each is at least six words

Bullets are grouped into exactly these seven categories, and you must use these names verbatim:
Authentication & User Management, Core functionality, Data management, UI/UX, API layer, Admin features, Integrations

A typical greenfield project produces 100 to 300 bullets in total. Simple tools are smaller; platforms are larger.

${CALIBRATION}

Your job: given a project brief, estimate the SHAPE of the decomposition — how many bullets each category would contain — WITHOUT writing the bullets themselves. Give one representative sample bullet per category so the reader can see the granularity.

Rules:
- Omit a category entirely if the project genuinely has none of it.
- total_tasks must equal the sum of every bullets value you give.
- confidence is "high" when the brief is specific and the domain is familiar, "medium" when there are open questions, "low" when the brief is vague or the project is unusually large.
- drivers lists the two or three things that most affect the size, in a few words each.

Reply with a single json object and nothing else. No markdown fences.

{
  "mode": "single",
  "categories": [{ "name": string, "bullets": number, "sample": string }],
  "total_tasks": number,
  "confidence": "high" | "medium" | "low",
  "drivers": [string]
}`

/**
 * Appended when a first pass exceeded the program threshold. claw-forge's
 * create-spec targets 100-300 bullets per spec, so a larger project must be
 * split into subsystems that each get their own spec and their own run.
 */
export const PROGRAM_MODE_ADDENDUM = `This project is too large for one claw-forge spec. Split it into 2 to 6 subsystems, each between 80 and 250 tasks, and give each one its own category breakdown.

depends_on names the other subsystems that must be built first; use the exact subsystem names you chose, and leave it empty for a subsystem with no prerequisites. Do not create a cycle.

Reply with a single json object and nothing else:

{
  "mode": "program",
  "umbrella": string,
  "subsystems": [{ "name": string, "categories": [{ "name": string, "bullets": number, "sample": string }], "total_tasks": number, "depends_on": [string] }],
  "total_tasks": number,
  "confidence": "high" | "medium" | "low",
  "drivers": [string]
}`
```

- [ ] **Step 5: Write `src/estimator/estimate.ts`**

```ts
import { EstimateShapeSchema, type EstimateShape } from '@unodigit/ba-bot-contract'
import type { ChatMessage, LlmClient } from '../llm/types'
import { ESTIMATOR_SYSTEM_PROMPT } from './prompt'

export type EstimateResult =
  | { ok: true; shape: EstimateShape; promptTokens: number; completionTokens: number }
  | { ok: false; reason: 'parse' | 'empty' | 'truncated' | 'provider' }

const REPAIR =
  'Your previous message was not valid against the required json object. ' +
  'Reply again with a single json object matching the schema exactly, with no ' +
  'extra keys and no markdown fences.'

/** The model is asked for both a per-category breakdown and a total; a shape
 *  where they disagree is not a shape we can price, so treat it as unparseable
 *  rather than silently trusting either number. */
function totalsAgree(shape: EstimateShape): boolean {
  const sum =
    shape.mode === 'single'
      ? shape.categories.reduce((n, c) => n + c.bullets, 0)
      : shape.subsystems.reduce((n, s) => n + s.categories.reduce((m, c) => m + c.bullets, 0), 0)
  return sum === shape.total_tasks
}

function parse(content: string): EstimateShape | null {
  try {
    const result = EstimateShapeSchema.safeParse(JSON.parse(content))
    if (!result.success) return null
    return totalsAgree(result.data) ? result.data : null
  } catch {
    return null
  }
}

export async function runEstimate(
  client: LlmClient,
  args: { model: string; briefText: string; programThreshold: number },
): Promise<EstimateResult> {
  const messages: ChatMessage[] = [
    { role: 'system', content: ESTIMATOR_SYSTEM_PROMPT },
    { role: 'user', content: args.briefText },
  ]

  for (let attempt = 0; attempt < 2; attempt++) {
    let res
    try {
      res = await client.chat({ model: args.model, messages, jsonMode: true, maxTokens: 1600 })
    } catch {
      return { ok: false, reason: 'provider' }
    }

    // Neither is repairable by re-prompting: a truncated or empty generation is
    // a capacity problem, not a formatting one. Retrying doubles the cost of a
    // known failure.
    if (res.finishReason === 'length') return { ok: false, reason: 'truncated' }
    if (res.content.trim() === '') return { ok: false, reason: 'empty' }

    const shape = parse(res.content)
    if (shape) {
      return {
        ok: true,
        shape,
        promptTokens: res.promptTokens,
        completionTokens: res.completionTokens,
      }
    }

    if (attempt === 0) {
      messages.push({ role: 'assistant', content: res.content })
      messages.push({ role: 'user', content: REPAIR })
    }
  }

  return { ok: false, reason: 'parse' }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS. Suite total **88 tests / 10 files**, zero warnings.

- [ ] **Step 7: Verify the PII boundary still holds**

Run: `grep -rnE "\b(name|email)\b" src/llm/ src/graph/prompts.ts src/estimator/`
Expected: the only match is the `prompts.ts` line instructing the model *not* to ask for them. Any match under `src/estimator/` is a spec violation — stop and report.

- [ ] **Step 8: Commit**

```bash
git add apps/ba-bot-api/src/estimator apps/ba-bot-api/test/estimator
git commit -m "feat(ba-bot): add shape estimator with frozen calibration prompt"
```

---

### Task 4: Estimator — program mode

**Files:**
- Modify: `apps/ba-bot-api/src/estimator/estimate.ts`
- Test: `apps/ba-bot-api/test/estimator/program.test.ts`

**Interfaces:**
- Consumes: everything from Task 3
- Produces: `runEstimate` gains a second pass — when a `single` result's `total_tasks` exceeds `programThreshold`, it re-asks in program mode and returns that instead.

- [ ] **Step 1: Write the failing test**

`test/estimator/program.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { runEstimate } from '../../src/estimator/estimate'
import type { LlmClient, ChatResponse } from '../../src/llm/types'

function stub(responses: Array<Partial<ChatResponse>>) {
  let i = 0
  const c = {
    calls: 0,
    async chat(): Promise<ChatResponse> {
      c.calls += 1
      const r = responses[Math.min(i++, responses.length - 1)]!
      return {
        content: r.content ?? '',
        finishReason: r.finishReason ?? 'stop',
        promptTokens: 500,
        completionTokens: 200,
      }
    },
  }
  return c as unknown as LlmClient & { calls: number }
}

const bigSingle = JSON.stringify({
  mode: 'single',
  categories: [{ name: 'Core functionality', bullets: 540, sample: 'User can do a thing (returns 200)' }],
  total_tasks: 540,
  confidence: 'low',
  drivers: ['very large scope'],
})

const smallSingle = JSON.stringify({
  mode: 'single',
  categories: [{ name: 'Core functionality', bullets: 80, sample: 'User can do a thing (returns 200)' }],
  total_tasks: 80,
  confidence: 'high',
  drivers: [],
})

const program = JSON.stringify({
  mode: 'program',
  umbrella: 'Field Service Platform',
  subsystems: [
    { name: 'Identity', categories: [{ name: 'Authentication & User Management', bullets: 96, sample: 'User can register (returns 201)' }], total_tasks: 96, depends_on: [] },
    { name: 'Scheduling', categories: [{ name: 'Core functionality', bullets: 184, sample: 'System assigns a job (saves to jobs)' }], total_tasks: 184, depends_on: ['Identity'] },
  ],
  total_tasks: 280,
  confidence: 'low',
  drivers: ['multi-subsystem'],
})

const args = { model: 'test-heavy', briefText: 'A huge platform.', programThreshold: 300 }

describe('runEstimate program mode', () => {
  it('re-asks in program mode when the first pass exceeds the threshold', async () => {
    const client = stub([{ content: bigSingle }, { content: program }])
    const r = await runEstimate(client, args)

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.shape.mode).toBe('program')
    expect(client.calls).toBe(2)
  })

  it('does not re-ask when the first pass is under the threshold', async () => {
    const client = stub([{ content: smallSingle }])
    const r = await runEstimate(client, args)

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.shape.mode).toBe('single')
    expect(client.calls).toBe(1)
  })

  it('keeps the oversized single result if the program pass fails', async () => {
    const client = stub([{ content: bigSingle }, { content: 'garbage' }, { content: 'garbage' }])
    const r = await runEstimate(client, args)

    // A large but valid estimate beats no estimate at all.
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.shape.mode).toBe('single')
    expect(r.shape.total_tasks).toBe(540)
  })

  it('sums token usage across both passes', async () => {
    const client = stub([{ content: bigSingle }, { content: program }])
    const r = await runEstimate(client, args)

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.promptTokens).toBe(1000)
    expect(r.completionTokens).toBe(400)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — program-mode assertions fail; `runEstimate` currently makes one pass.

- [ ] **Step 3: Extend `src/estimator/estimate.ts`**

Refactor the existing body into a private `askOnce(client, model, messages)` returning `EstimateResult`, then make `runEstimate`:

```ts
export async function runEstimate(
  client: LlmClient,
  args: { model: string; briefText: string; programThreshold: number },
): Promise<EstimateResult> {
  const first = await askOnce(client, args.model, [
    { role: 'system', content: ESTIMATOR_SYSTEM_PROMPT },
    { role: 'user', content: args.briefText },
  ])

  if (!first.ok) return first
  if (first.shape.total_tasks <= args.programThreshold) return first

  // Over the threshold: one claw-forge spec targets 100-300 bullets, so ask for
  // a subsystem split. This is also the better commercial artifact — a phased
  // first-subsystem price converts where one large total does not.
  const second = await askOnce(client, args.model, [
    { role: 'system', content: ESTIMATOR_SYSTEM_PROMPT },
    { role: 'system', content: PROGRAM_MODE_ADDENDUM },
    { role: 'user', content: args.briefText },
  ])

  // A valid oversized estimate beats no estimate. Fall back rather than fail.
  if (!second.ok) return first

  return {
    ok: true,
    shape: second.shape,
    promptTokens: first.promptTokens + second.promptTokens,
    completionTokens: first.completionTokens + second.completionTokens,
  }
}
```

Import `PROGRAM_MODE_ADDENDUM` from `./prompt`. Keep the frozen prompt as the **first** system message in both passes so the cached prefix is shared between them.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS. Suite total **92 tests / 11 files**, zero warnings.

- [ ] **Step 5: Commit**

```bash
git add apps/ba-bot-api/src/estimator/estimate.ts apps/ba-bot-api/test/estimator/program.test.ts
git commit -m "feat(ba-bot): add program mode for projects over the spec threshold"
```

---

### Task 5: Brief and quote markdown renderers (pure)

**Files:**
- Create: `apps/ba-bot-api/src/render/brief.ts`
- Create: `apps/ba-bot-api/src/render/quote.ts`
- Test: `apps/ba-bot-api/test/render/render.test.ts`

**Interfaces:**
- Consumes: `Slots` (`src/graph/states.ts`), `EstimateShape`, `Quote` (Task 1)
- Produces:
  - `interface BriefSections { executiveSummary: string; problem: string; solution: string; users: string; scope: string; constraints: string }`
  - `function buildBriefSections(slots: Slots): BriefSections`
  - `function renderBrief(sections: BriefSections, projectName: string): string`
  - `function renderQuote(input: { quote: Quote; shape: EstimateShape; projectName: string; validUntil: number; rateShown: boolean }): string`

- [ ] **Step 1: Write the failing test**

`test/render/render.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildBriefSections, renderBrief } from '../../src/render/brief'
import { renderQuote } from '../../src/render/quote'
import type { EstimateShape, Quote } from '@unodigit/ba-bot-contract'

const slots = {
  project_name: 'PawBook',
  audience: 'Independent dog groomers in Sydney',
  problem: 'Bookings are managed by phone and double-booked constantly',
  solution_summary: 'A mobile-first booking calendar with SMS reminders',
  differentiator: 'Built for solo operators, not salons',
  personas: ['Groomer', 'Pet owner'],
  mvp_must: ['Online booking', 'SMS reminder'],
  mvp_wont: ['Payments'],
  covered_categories: ['Core functionality', 'UI/UX', 'Integrations'],
  features: ['User can book a slot', 'System sends an SMS reminder'],
  timeline: 'Before spring',
  budget_band: 'Under 20k',
  stack_preference: 'No preference',
  integrations: ['Twilio'],
}

const shape: EstimateShape = {
  mode: 'single',
  categories: [
    { name: 'Core functionality', bullets: 52, sample: 'User can book a slot (returns 201 with booking_id)' },
    { name: 'Integrations', bullets: 20, sample: 'System sends an SMS via Twilio (emits sms_sent)' },
  ],
  total_tasks: 72,
  confidence: 'medium',
  drivers: ['one integration'],
}

const quote: Quote = {
  mode: 'single', totalTasks: 72, weightedTasks: 92.4, rateAud: 10,
  lowAud: 601, highAud: 1247, weeks: 4, confidence: 'medium', belowFloor: true,
}

describe('buildBriefSections', () => {
  it('fills every section from slots', () => {
    const s = buildBriefSections(slots)
    expect(s.problem).toContain('double-booked')
    expect(s.users).toContain('Groomer')
    expect(s.scope).toContain('Online booking')
  })

  it('degrades gracefully when a slot is missing', () => {
    const s = buildBriefSections({ project_name: 'X' })
    expect(s.problem.length).toBeGreaterThan(0)
    expect(s.problem.toLowerCase()).toContain('not captured')
  })
})

describe('renderBrief', () => {
  it('emits markdown with the expected headings', () => {
    const md = renderBrief(buildBriefSections(slots), 'PawBook')
    expect(md).toMatch(/^# /m)
    expect(md).toContain('## Problem')
    expect(md).toContain('## Proposed solution')
    expect(md).toContain('## MVP scope')
  })

  it('never contains a lead field', () => {
    const md = renderBrief(buildBriefSections(slots), 'PawBook')
    expect(md).not.toMatch(/@/)
  })
})

describe('renderQuote', () => {
  const base = { quote, shape, projectName: 'PawBook', validUntil: Date.UTC(2026, 8, 17) }

  it('shows the band and the task count', () => {
    const md = renderQuote({ ...base, rateShown: true })
    expect(md).toContain('72')
    expect(md).toMatch(/601/)
    expect(md).toMatch(/1,?247/)
  })

  it('breaks down every category', () => {
    const md = renderQuote({ ...base, rateShown: true })
    expect(md).toContain('Core functionality')
    expect(md).toContain('Integrations')
  })

  it('includes the per-task rate only when rateShown is true', () => {
    expect(renderQuote({ ...base, rateShown: true })).toContain('per task')
    expect(renderQuote({ ...base, rateShown: false })).not.toContain('per task')
  })

  it('states that the figure is indicative and when it expires', () => {
    const md = renderQuote({ ...base, rateShown: true })
    expect(md.toLowerCase()).toContain('indicative')
    expect(md).toContain('2026')
  })

  it('flags a project below the engagement floor rather than quoting it', () => {
    const md = renderQuote({ ...base, rateShown: true })
    expect(md.toLowerCase()).toMatch(/smaller than|minimum|starter/)
  })

  it('lists subsystems and phase order in program mode', () => {
    const prog: EstimateShape = {
      mode: 'program', umbrella: 'Platform',
      subsystems: [
        { name: 'Identity', categories: [{ name: 'Authentication & User Management', bullets: 96, sample: 'x' }], total_tasks: 96, depends_on: [] },
        { name: 'Scheduling', categories: [{ name: 'Core functionality', bullets: 184, sample: 'y' }], total_tasks: 184, depends_on: ['Identity'] },
      ],
      total_tasks: 280, confidence: 'low', drivers: [],
    }
    const md = renderQuote({ ...base, shape: prog, quote: { ...quote, mode: 'program' }, rateShown: true })
    expect(md).toContain('Identity')
    expect(md).toContain('Scheduling')
    expect(md).toMatch(/Phase 1/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — cannot resolve `../../src/render/brief`.

- [ ] **Step 3: Write `src/render/brief.ts`**

```ts
import type { Slots } from '../graph/states'

export interface BriefSections {
  executiveSummary: string
  problem: string
  solution: string
  users: string
  scope: string
  constraints: string
}

/** A brief with a visible gap is more useful to sales than one that hides it —
 *  the gap tells them what to ask on the call. */
const MISSING = '_Not captured during the interview._'

const str = (s: Slots, k: string): string =>
  typeof s[k] === 'string' && (s[k] as string).trim() ? (s[k] as string).trim() : ''

const list = (s: Slots, k: string): string[] =>
  Array.isArray(s[k]) ? (s[k] as unknown[]).filter((x): x is string => typeof x === 'string') : []

const bullets = (items: string[]): string =>
  items.length ? items.map((i) => `- ${i}`).join('\n') : MISSING

const para = (text: string): string => (text ? text : MISSING)

export function buildBriefSections(slots: Slots): BriefSections {
  const name = str(slots, 'project_name') || 'the project'
  const audience = str(slots, 'audience')
  const problem = str(slots, 'problem')
  const solution = str(slots, 'solution_summary')
  const differentiator = str(slots, 'differentiator')

  const summary =
    solution && audience
      ? `${name} is ${solution.charAt(0).toLowerCase()}${solution.slice(1)} for ${audience}.`
      : ''

  return {
    executiveSummary: para(summary),
    problem: para(problem),
    solution: para([solution, differentiator && `Differentiator: ${differentiator}`].filter(Boolean).join('\n\n')),
    users: bullets(list(slots, 'personas')),
    scope: [
      '**Must have**',
      bullets(list(slots, 'mvp_must')),
      '',
      '**Explicitly out of scope**',
      bullets(list(slots, 'mvp_wont')),
    ].join('\n'),
    constraints: bullets(
      [
        str(slots, 'timeline') && `Timeline: ${str(slots, 'timeline')}`,
        str(slots, 'budget_band') && `Budget expectation: ${str(slots, 'budget_band')}`,
        str(slots, 'stack_preference') && `Stack preference: ${str(slots, 'stack_preference')}`,
        list(slots, 'integrations').length && `Integrations: ${list(slots, 'integrations').join(', ')}`,
      ].filter((x): x is string => typeof x === 'string' && x.length > 0),
    ),
  }
}

export function renderBrief(sections: BriefSections, projectName: string): string {
  return [
    `# ${projectName} — Project Brief`,
    '',
    '## Executive summary',
    sections.executiveSummary,
    '',
    '## Problem',
    sections.problem,
    '',
    '## Proposed solution',
    sections.solution,
    '',
    '## Target users',
    sections.users,
    '',
    '## MVP scope',
    sections.scope,
    '',
    '## Constraints',
    sections.constraints,
    '',
  ].join('\n')
}
```

- [ ] **Step 4: Write `src/render/quote.ts`**

```ts
import type { EstimateShape, Quote, Subsystem } from '@unodigit/ba-bot-contract'
import { CATEGORY_WEIGHTS } from '../estimator/categories'

const aud = (n: number): string => `A$${n.toLocaleString('en-AU')}`

const day = (ts: number): string =>
  new Date(ts).toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })

/**
 * Orders subsystems so prerequisites come first, producing the delivery phases.
 * A malformed `depends_on` (cycle, unknown name) must not lose the quote — fall
 * back to declaration order rather than throwing.
 */
export function phaseOrder(subsystems: Subsystem[]): Subsystem[] {
  const byName = new Map(subsystems.map((s) => [s.name, s]))
  const done = new Set<string>()
  const out: Subsystem[] = []

  let progressed = true
  while (out.length < subsystems.length && progressed) {
    progressed = false
    for (const s of subsystems) {
      if (done.has(s.name)) continue
      const ready = s.depends_on.every((d) => !byName.has(d) || done.has(d))
      if (ready) {
        out.push(s)
        done.add(s.name)
        progressed = true
      }
    }
  }

  // Cycle: append whatever is left, in declaration order.
  for (const s of subsystems) if (!done.has(s.name)) out.push(s)
  return out
}

function categoryTable(cats: EstimateShape extends never ? never : { name: string; bullets: number; sample: string }[]): string {
  return [
    '| Area | Tasks | Weight | Example',
    '|---|---:|---:|---|',
    ...cats.map(
      (c) => `| ${c.name} | ${c.bullets} | ${CATEGORY_WEIGHTS[c.name as keyof typeof CATEGORY_WEIGHTS]}× | ${c.sample} |`,
    ),
  ].join('\n')
}

export function renderQuote(input: {
  quote: Quote
  shape: EstimateShape
  projectName: string
  validUntil: number
  rateShown: boolean
}): string {
  const { quote: q, shape, projectName, validUntil, rateShown } = input
  const out: string[] = [`# ${projectName} — Indicative Quote`, '']

  if (q.belowFloor) {
    // Quoting a figure the business cannot service profitably attracts leads it
    // must then reject — worse for the brand than not quoting.
    out.push(
      `This looks like a **smaller piece of work than our usual engagements** — around **${q.totalTasks} tasks**, roughly **${q.weeks} week${q.weeks === 1 ? '' : 's'}**.`,
      '',
      'Rather than quote a figure that would not serve you well, let us talk about a fixed-price starter engagement that fits the scope.',
      '',
    )
  } else {
    out.push(
      `**~${q.totalTasks} tasks · estimated ${aud(q.lowAud)}–${aud(q.highAud)} · roughly ${q.weeks} week${q.weeks === 1 ? '' : 's'}**`,
      '',
      `Confidence: ${q.confidence}.`,
      '',
    )
  }

  if (shape.mode === 'single') {
    out.push('## Breakdown', '', categoryTable(shape.categories), '')
  } else {
    out.push(`## ${shape.umbrella} — delivery phases`, '')
    phaseOrder(shape.subsystems).forEach((s, i) => {
      out.push(
        `### Phase ${i + 1} — ${s.name} (${s.total_tasks} tasks)`,
        s.depends_on.length ? `_Depends on: ${s.depends_on.join(', ')}_` : '',
        '',
        categoryTable(s.categories),
        '',
      )
    })
  }

  if (shape.drivers.length) {
    out.push('## What drives the size', '', ...shape.drivers.map((d) => `- ${d}`), '')
  }

  if (rateShown && !q.belowFloor) {
    out.push(
      '## How this is calculated',
      '',
      `Each task is one unit of work our agent harness executes and verifies. Tasks are weighted by area — integration work costs more than interface work — giving **${q.weightedTasks.toFixed(1)} weighted tasks** at **${aud(q.rateAud)} per task**.`,
      '',
    )
  }

  out.push(
    '## Assumptions and exclusions',
    '',
    '- Scope is as described in the accompanying project brief.',
    '- Third-party service costs (hosting, APIs, licences) are not included.',
    '- Content, branding, and copywriting are not included unless stated.',
    '',
    `_This is an **indicative** estimate produced from a short interview, not a fixed-price offer. It is valid until **${day(validUntil)}** and is subject to a scoping call._`,
    '',
  )

  return out.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n')
}
```

Note `rateShown`: in chat the visitor sees the band and the differentiator, never the cost basis. The rate appears only in the email, where it *explains* the figure rather than inviting a line-item negotiation.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS. Suite total **104 tests / 12 files**, zero warnings.

- [ ] **Step 6: Commit**

```bash
git add apps/ba-bot-api/src/render apps/ba-bot-api/test/render
git commit -m "feat(ba-bot): add brief and quote markdown renderers"
```

---

### Task 6: Persistence for briefs and quotes

**Files:**
- Modify: `apps/ba-bot-api/src/db/queries.ts`
- Test: `apps/ba-bot-api/test/db/artifacts.test.ts`

**Interfaces:**
- Produces:
  - `interface BriefInsert { id, conversationId, markdown, sectionsJson, createdAt }`
  - `interface QuoteInsert { id, briefId, markdown, mode, totalTasks, weightedTasks, rateAud, lowAud, highAud, weeks, confidence, categoriesJson, subsystemsJson, validUntil, createdAt }`
  - `insertBrief(db, row): Promise<void>`
  - `insertQuote(db, row): Promise<void>`
  - `getQuoteById(db, id): Promise<QuoteRow | null>`
  - `getBriefByConversation(db, conversationId): Promise<BriefRow | null>`

- [ ] **Step 1: Write the failing test**

`test/db/artifacts.test.ts` — cover: insert then read back a brief; insert then read back a quote; `getQuoteById` returns null for an unknown id; a quote insert with a `brief_id` that does not exist **throws** (foreign keys are enforced — `PRAGMA foreign_keys` is 1); `subsystems_json` round-trips as null for single mode.

Use `env` from `cloudflare:workers` and `newId()` for ids, matching `test/db/queries.test.ts`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test` — FAIL, `insertBrief` is not exported.

- [ ] **Step 3: Append to `src/db/queries.ts`**

```ts
export interface BriefRow {
  id: string
  conversation_id: string
  markdown: string
  sections_json: string
  created_at: number
}

export interface QuoteRow {
  id: string
  brief_id: string
  markdown: string
  mode: string
  total_tasks: number
  weighted_tasks: number
  rate_aud: number
  low_aud: number
  high_aud: number
  weeks: number
  confidence: string
  categories_json: string
  subsystems_json: string | null
  valid_until: number
  created_at: number
}

export interface BriefInsert {
  id: string
  conversationId: string
  markdown: string
  sectionsJson: string
  createdAt: number
}

export interface QuoteInsert {
  id: string
  briefId: string
  markdown: string
  mode: string
  totalTasks: number
  weightedTasks: number
  rateAud: number
  lowAud: number
  highAud: number
  weeks: number
  confidence: string
  categoriesJson: string
  subsystemsJson: string | null
  validUntil: number
  createdAt: number
}

export async function insertBrief(db: D1Database, row: BriefInsert): Promise<void> {
  await db
    .prepare(
      `INSERT INTO briefs (id, conversation_id, markdown, sections_json, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(row.id, row.conversationId, row.markdown, row.sectionsJson, row.createdAt)
    .run()
}

// 15 columns / 15 placeholders / 15 binds. Count all three before changing this:
// every value is string|number, so a transposition type-checks, passes any test
// that does not assert the swapped fields, and silently corrupts every quote.
export async function insertQuote(db: D1Database, row: QuoteInsert): Promise<void> {
  await db
    .prepare(
      `INSERT INTO quotes (
         id, brief_id, markdown, mode, total_tasks, weighted_tasks, rate_aud,
         low_aud, high_aud, weeks, confidence, categories_json, subsystems_json,
         valid_until, created_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      row.id, row.briefId, row.markdown, row.mode, row.totalTasks,
      row.weightedTasks, row.rateAud, row.lowAud, row.highAud, row.weeks,
      row.confidence, row.categoriesJson, row.subsystemsJson, row.validUntil,
      row.createdAt,
    )
    .run()
}

export async function getQuoteById(db: D1Database, id: string): Promise<QuoteRow | null> {
  return await db.prepare('SELECT * FROM quotes WHERE id = ?').bind(id).first<QuoteRow>()
}

export async function getBriefByConversation(
  db: D1Database,
  conversationId: string,
): Promise<BriefRow | null> {
  return await db
    .prepare('SELECT * FROM briefs WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1')
    .bind(conversationId)
    .first<BriefRow>()
}
```

**In your report, state the three counts for `insertQuote` explicitly** (columns / placeholders / binds). Writing the number down is what makes you check it.

- [ ] **Step 4: Run the tests**

Run: `pnpm test`
Expected: PASS. Suite total **~110 tests / 13 files**, zero warnings.

- [ ] **Step 5: Commit**

```bash
git add apps/ba-bot-api/src/db/queries.ts apps/ba-bot-api/test/db/artifacts.test.ts
git commit -m "feat(ba-bot): add brief and quote persistence"
```

---

### Task 7: `POST /api/generate` orchestration

**Files:**
- Create: `apps/ba-bot-api/src/api/generate.ts`
- Modify: `apps/ba-bot-api/src/index.ts` (register the route)
- Modify: `apps/ba-bot-api/src/env.ts` (add `QUOTE_LINK_SIGNING_KEY`, `RESEND_API_KEY`)
- Test: `apps/ba-bot-api/test/api/generate.test.ts`

**Interfaces:**
- Consumes: `runEstimate` (T3/4), `priceQuote` (T2), renderers (T5), persistence (T6), `loadSession`/`persistSession`, `quotesToday`/`recordQuote`/`utcDay`, `hashIp`
- Produces: `registerGenerateRoutes(app, deps?)`; response is `GenerateResponse` (Task 1)

**Behaviour, in order:**

1. Body: `{ conversationId: string }`. Unknown conversation → **404**.
2. Session must be at `GENERATE`, else **409** `wrong_state`. (`CONTACT` cannot force-advance, so reaching `GENERATE` means a lead exists.)
3. If a brief already exists for this conversation, return it idempotently — never bill a second estimate for a retry or a double-click.
4. Build brief sections from slots, render, `insertBrief`.
5. **Rate-limit check, quote only.** `quotesToday(db, ipHash, utcDay(now)) >= 1` → skip the estimate entirely, return the brief with `quote: null` and a book-a-call headline. Per spec §10 the limit gates the artifact, not the conversation, and skipping the estimate is also what makes the limit worth having: it is the expensive call.
6. Otherwise `runEstimate` with `LLM_MODEL_HEAVY`. On failure: persist the brief, return `quote: null` and a graceful headline, record an event. **Never 500 a visitor because the estimator failed.**
7. `priceQuote`, render, `insertQuote`, `recordQuote`.
8. Advance the session to `DONE` via `step()` + `persistSession`.
9. Set `conversations.ended_at`. If the session ended before `DONE`, set `abandoned_at_state` — the spec calls this the highest-value column and nothing writes it yet.
10. Return `GenerateResponse`. `headline` is the chat-visible line: `~137 tasks · estimated A$14,000–18,500 · roughly 6 weeks`, or the below-floor / book-a-call / estimator-failed variant. **The per-task rate never appears in `headline`.**

- [ ] **Step 1: Write the failing tests** — at minimum: happy path returns a headline and persists both rows; idempotent on repeat; 404 unknown conversation; 409 wrong state; rate-limited returns brief with `quote: null` **and makes no LLM call** (assert the fetch spy was not called); estimator failure still returns the brief; `ended_at` is set.

- [ ] **Step 2: Run to verify failure.** `pnpm test` — route 404s.

- [ ] **Step 3: Implement `src/api/generate.ts`.** Orchestration only — no pricing arithmetic, no markdown, no prompt text in this file.

- [ ] **Step 4: Register in `src/index.ts`** alongside the existing chat and contact routes. Add `RESEND_API_KEY` and `QUOTE_LINK_SIGNING_KEY` to `Env`, and to the missing-secret 503 guard only once Task 8/9 actually use them.

- [ ] **Step 5: Run the full suite and `pnpm typecheck`.**

- [ ] **Step 6: Commit**

```bash
git add apps/ba-bot-api/src/api/generate.ts apps/ba-bot-api/src/index.ts apps/ba-bot-api/src/env.ts apps/ba-bot-api/test/api/generate.test.ts
git commit -m "feat(ba-bot): add generate endpoint producing brief and quote"
```

---

### Task 8: Signed quote links and `GET /api/quote/:id`

**Files:**
- Create: `apps/ba-bot-api/src/util/sign.ts`
- Create: `apps/ba-bot-api/src/api/quote.ts`
- Modify: `apps/ba-bot-api/src/index.ts`
- Test: `apps/ba-bot-api/test/util/sign.test.ts`, `apps/ba-bot-api/test/api/quote.test.ts`

**Interfaces:**
- `signId(id: string, key: string): Promise<string>` — HMAC-SHA256, hex
- `verifyId(id: string, sig: string, key: string): Promise<boolean>` — **constant-time comparison**
- `registerQuoteRoutes(app)` — `GET /api/quote/:id?sig=...` returns `{ markdown, quote }` or **403** on a bad signature

Quote ids must not be enumerable: a wrong or missing signature is 403, and an unknown id is **also** 403 rather than 404, so the endpoint does not confirm which ids exist.

- [ ] **Step 1: Write the failing tests** — signature round-trips; a tampered id fails; a tampered signature fails; a different key fails; verification is length-safe against a truncated signature; the route 403s on bad signature; 403s on unknown id; 200s with markdown on a valid pair.

- [ ] **Step 2–4:** implement, register, run the full suite and typecheck.

- [ ] **Step 5: Commit**

```bash
git add apps/ba-bot-api/src/util/sign.ts apps/ba-bot-api/src/api/quote.ts apps/ba-bot-api/src/index.ts apps/ba-bot-api/test/util apps/ba-bot-api/test/api/quote.test.ts
git commit -m "feat(ba-bot): add HMAC-signed quote retrieval endpoint"
```

---

### Task 9: Resend email delivery

**Files:**
- Create: `apps/ba-bot-api/src/mail/resend.ts`
- Create: `apps/ba-bot-api/src/mail/template.ts`
- Modify: `apps/ba-bot-api/src/api/generate.ts` (send after persisting)
- Test: `apps/ba-bot-api/test/mail/resend.test.ts`

**Interfaces:**
- `sendQuoteEmail(args: { apiKey, to, projectName, briefMarkdown, quoteMarkdown, quoteUrl }): Promise<{ ok: boolean; id?: string; error?: string }>`
- `renderEmailHtml(args: { projectName, briefMarkdown, quoteMarkdown, quoteUrl }): string`

**Constraints:**
- **HTML only, no attachment.** Per the product decision: the full cost breakdown goes in the email body, and the hosted quote page carries the rest.
- Use `fetch` against `https://api.resend.com/emails`. **Do not install the Resend SDK** — one POST does not justify a dependency in a Worker bundle.
- A send failure **must not** fail the request. Log an event, return the brief and quote anyway. The visitor already has their number on screen; losing the email is a follow-up problem, not a request failure.
- The recipient address comes from the `leads` row, read at send time. It must not pass through the estimator, the renderers, or any prompt.

- [ ] **Step 1: Write the failing tests** — success returns `{ok:true}` with the Resend id; a non-2xx returns `{ok:false}` and does not throw; a network throw returns `{ok:false}`; the HTML contains the quote link and the project name; `generate` still returns 200 when the send fails, and records a `quote_email_failed` event.

- [ ] **Step 2–4:** implement, wire into `generate.ts`, run the full suite and typecheck.

- [ ] **Step 5: Update `SETUP.md`** — `RESEND_API_KEY` and `QUOTE_LINK_SIGNING_KEY` are now required secrets, and the sender domain must be DNS-verified (SPF/DKIM) in Resend before any quote will deliver.

- [ ] **Step 6: Add both to `scripts/sync-secrets.sh`.** `RESEND_API_KEY` already exists at `op://application/resend/api_key`. `QUOTE_LINK_SIGNING_KEY` needs a new 1Password entry — generate with `openssl rand -hex 32` and document the reference.

- [ ] **Step 7: Commit**

```bash
git add apps/ba-bot-api/src/mail apps/ba-bot-api/src/api/generate.ts apps/ba-bot-api/SETUP.md apps/ba-bot-api/scripts/sync-secrets.sh apps/ba-bot-api/test/mail
git commit -m "feat(ba-bot): deliver quote by email via Resend"
```

---

## Definition of done for Plan 2

- Full suite green, zero warnings; `pnpm typecheck` clean in both `apps/ba-bot-api` and `packages/ba-bot-contract`.
- Root `pnpm build` still emits `apps/web/out` with 22 pages — proving the workspace was not disturbed.
- A conversation reaching `GENERATE` produces a `briefs` row and a `quotes` row, both with markdown.
- A second quote from the same IP within 24h returns the brief with `quote: null` and **makes no LLM call**.
- An estimator failure returns the brief with a graceful headline, never a 500.
- The per-task rate appears in the emailed quote and **never** in the chat headline.
- `grep -rnE "\b(name|email)\b" src/llm/ src/graph/prompts.ts src/estimator/ src/render/` returns only the prompt line telling the model not to ask.
- `conversations.ended_at` is written; `abandoned_at_state` is written when a session ends before `DONE`.

## Open questions — resolve before quoting a real client

- **`RATE_PER_TASK_AUD` is `10` and `MINIMUM_ENGAGEMENT_AUD` is `6000`** — both placeholders in `wrangler.toml`. Confirm before launch.
- **`TASKS_PER_WEEK` is `25`, uncalibrated.** It drives the timeline shown to clients and is therefore a delivery commitment. Calibrate against real projects before the number is displayed.
- **`CALIBRATION` holds plausible placeholders, not real `claw-forge plan` output.** The entire estimate is only as good as this constant. Replace it before a quote is sent to anyone.
- **Category weights are policy, not measurement.** Revisit once delivery data exists.

## What Plan 3 picks up

The widget and SSE streaming, the contact form UI, the `/q` static shell that reads `GET /api/quote/:id`, `packages/ba-bot-ui` (React, zero host imports, `--babot-*` token contract), and the Access-protected dashboard.

Two items carried forward as **launch blockers**, both deferred for legitimate sequencing reasons and therefore easy to lose:

- **Turnstile + rate limiting on `POST /api/chat`** (spec §10). Enforcement needs a client-supplied token, which does not exist until the widget does. Without it, `/api/chat` is open to unmetered DeepSeek spend.
- **`DELETE /admin/lead/:id`** (spec §8). The Privacy Act deletion path must sit behind Cloudflare Access, which does not exist until the dashboard does.
