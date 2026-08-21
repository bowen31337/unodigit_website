import { env, exports } from 'cloudflare:workers'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  ErrorResponseSchema, GenerateResponseSchema, type EstimateShape,
} from '@unodigit/ba-bot-contract'
import app from '../../src/index'
import { endConversation } from '../../src/api/generate'
import { createConversation, insertLead, updateConversationState } from '../../src/db/queries'
import { recordQuote, utcDay } from '../../src/guards/ratelimit'
import { sessionKey } from '../../src/session'
import { hashIp } from '../../src/util/hash'
import { newId } from '../../src/util/ids'
import { ESTIMATE_SAMPLES } from '../../src/estimator/estimate'

/** A lead field that must never leave the leads table during generation. */
const CANARY_PHONE = '+61 400 111 222'

// The `rate_limit` ledger is keyed on (ip_hash, day) and D1 persists across
// tests in this file, so a shared IP would leave every test after the first
// happy path rate-limited — silently turning the rest of the suite into
// assertions about the wrong branch. One IP per test keeps the ledger honest.
let ip = ''
let ipCounter = 0

// This fixture pins BOTH pricing knobs it depends on, so the assertions below
// describe the headline's structure rather than whatever the business happens
// to be charging this week. Production values are deliberately not used here:
// they have already moved twice (rate 10 -> 25 -> 10, floor 6000 -> 2000,
// tasksPerWeek 25 -> 500), and a fixture that drifts with them asserts nothing
// stable. Coherence of the SHIPPED values is pinned separately, in
// test/pricing/quote.test.ts, which reads wrangler.toml on purpose.
//
// 77 is chosen so the rate cannot appear incidentally in any other number this
// fixture produces (137 tasks, A$8,691-14,486, 7 weeks) — which is what makes
// the "no rate in the headline" assertion an absence test rather than a guess.
const RATE = '77'

// 150.5 weighted / 25 = 6.02 -> ceil 7. Pinned because production is now 500,
// under which every single-mode project floors to "roughly 1 week" and the
// weeks assertion would stop distinguishing anything.
const TASKS_PER_WEEK = '25'

const PRICING_ENV = { RATE_PER_TASK_AUD: RATE, TASKS_PER_WEEK }

// Sums to 137 bullets, matching the spec's worked example. Weighted:
// 60*1.2 + 30*0.8 + 20*1.0 + 15*1.5 + 12*1.0 = 150.5.
const shape: EstimateShape = {
  mode: 'single',
  categories: [
    { name: 'Core functionality', bullets: 60, sample: 'Create a booking' },
    { name: 'UI/UX', bullets: 30, sample: 'Empty state for the calendar' },
    { name: 'Data management', bullets: 20, sample: 'Migrate the bookings table' },
    { name: 'Integrations', bullets: 15, sample: 'Retry a failed Stripe webhook' },
    { name: 'Authentication & User Management', bullets: 12, sample: 'Reset a password' },
  ],
  total_tasks: 137,
  confidence: 'high',
  drivers: ['Two-sided marketplace', 'Payments'],
}

const slots: Record<string, unknown> = {
  project_name: 'PawBook',
  audience: 'dog owners',
  problem: 'Booking a groomer takes six phone calls.',
  solution_summary: 'A marketplace that books grooming instantly.',
  personas: ['Dog owner', 'Groomer'],
  mvp_must: ['Search groomers', 'Book and pay'],
  mvp_wont: ['A native app'],
  timeline: 'three months',
  budget_band: '20-50k',
  integrations: ['Stripe'],
  lead_id: 'lead_seeded',
}

// Response bodies are I/O objects tied to the request context that created
// them, so the mock Response must be constructed lazily (inside the
// implementation, at call time) rather than eagerly via `mockResolvedValue` —
// otherwise workerd rejects the read with "Cannot perform I/O on behalf of a
// different request." Same mechanic as test/api/chat.test.ts.
function mockEstimator(content: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
    new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(content) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 900, completion_tokens: 400 },
    }), { headers: { 'content-type': 'application/json' } }),
  )
}

/** A spy that fails loudly if the estimator is reached at all. Asserting only
 *  the response shape would pass on an implementation that ran the estimate and
 *  then discarded it — the exact spend the rate limit exists to prevent. */
function forbidLlm() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    throw new Error('the LLM must not be called on this path')
  })
}

async function postGenerate(body: unknown, overrides?: Record<string, unknown>) {
  const init = {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify(body),
  }
  // `exports.default` is a pre-bound loopback stub: fetch(input, init?) only.
  // The override form needs the raw app so a binding can be replaced.
  if (!overrides) return await exports.default.fetch('https://api.test/api/generate', init)
  return await app.fetch(new Request('https://api.test/api/generate', init), { ...env, ...overrides })
}

async function seed(state = 'GENERATE', s: Record<string, unknown> = slots): Promise<string> {
  const id = newId('conv')
  await createConversation(env.DB, id, Date.now())
  await updateConversationState(env.DB, id, state, 20)
  await env.SESSIONS.put(sessionKey(id), JSON.stringify({
    state, slots: s, turnsInState: 0, totalTurns: 20, forcedAdvances: [],
  }))
  return id
}

/** A conversation whose D1 row says GENERATE but whose KV session is gone —
 *  the 86400s TTL expired, or KV is momentarily eventually-consistent.
 *  `loadSession` reseeds state and turn count from D1 but CANNOT recover slots,
 *  because slots live only in KV. */
async function seedWithoutKv(state = 'GENERATE'): Promise<string> {
  const id = newId('conv')
  await createConversation(env.DB, id, Date.now())
  await updateConversationState(env.DB, id, state, 20)
  return id
}

const briefRow = (conversationId: string) =>
  env.DB.prepare('SELECT * FROM briefs WHERE conversation_id = ?').bind(conversationId)
    .first<{ id: string; markdown: string; sections_json: string }>()

const quoteRowFor = (briefId: string) =>
  env.DB.prepare('SELECT * FROM quotes WHERE brief_id = ?').bind(briefId)
    .first<{ id: string; markdown: string; mode: string; total_tasks: number; rate_aud: number }>()

const convRow = (id: string) =>
  env.DB.prepare('SELECT * FROM conversations WHERE id = ?').bind(id)
    .first<{ state: string; turn_count: number; ended_at: number | null; abandoned_at_state: string | null; tokens_in: number; tokens_out: number }>()

interface Body {
  briefId: string
  quoteId: string | null
  quote: { totalTasks: number; rateAud: number; belowFloor: boolean } | null
  // The signed download link. Email delivery is gone (US-010), so this is the
  // client's only route to the full quote. Its shape, its signature and its
  // null cases are pinned in test/api/quote-link.test.ts.
  quoteUrl: string | null
  headline: string
  state: string
}

beforeEach(() => {
  vi.restoreAllMocks()
  ipCounter += 1
  ip = `203.0.113.${ipCounter}`
})

describe('POST /api/generate', () => {
  it('produces a brief, a quote, and a headline', async () => {
    const spy = mockEstimator(shape)
    const conversationId = await seed()

    const res = await postGenerate({ conversationId }, PRICING_ENV)
    expect(res.status).toBe(200)

    const json = await res.json<Body>()
    expect(GenerateResponseSchema.safeParse(json).success).toBe(true)
    expect(json.state).toBe('DONE')
    expect(json.quote!.totalTasks).toBe(137)
    expect(json.headline).toContain('137 tasks')
    expect(json.headline).toMatch(/A\$8,?691/)
    expect(json.headline).toMatch(/14,?486/)
    expect(json.headline).toContain('7 weeks')

    const brief = await briefRow(conversationId)
    expect(brief!.id).toBe(json.briefId)
    expect(brief!.markdown).toContain('PawBook')
    expect(brief!.markdown).toContain('## Problem')

    const quote = await quoteRowFor(json.briefId)
    expect(quote!.id).toBe(json.quoteId)
    expect(quote!.mode).toBe('single')
    expect(quote!.total_tasks).toBe(137)

    // The heavy model is the most expensive call in the app; its spend must
    // land in the same columns that track the cheap one.
    const conv = await convRow(conversationId)
    // Every draw is paid for, so the counters sum all of them — see
    // ESTIMATE_SAMPLES in estimator/estimate.
    expect(conv!.tokens_in).toBe(900 * ESTIMATE_SAMPLES)
    expect(conv!.tokens_out).toBe(400 * ESTIMATE_SAMPLES)

    // One estimate PASS, drawn ESTIMATE_SAMPLES times and reduced to the
    // median — no repair retry and no program pass at 137 tasks.
    expect(spy).toHaveBeenCalledTimes(ESTIMATE_SAMPLES)
  })

  it('never puts the per-task rate in the headline', async () => {
    mockEstimator(shape)
    const conversationId = await seed()

    const res = await postGenerate({ conversationId }, PRICING_ENV)
    const json = await res.json<Body>()

    // Absence, not "some other field is present". The rate is internal pricing
    // mechanics: the chat shows a total, the linked quote shows the breakdown.
    expect(json.headline).not.toContain(RATE)
    expect(json.headline.toLowerCase()).not.toContain('per task')

    // Positive control — the rate is genuinely produced and stored, so the
    // absence above is a suppression rather than a value that never existed.
    const brief = await briefRow(conversationId)
    const quote = await quoteRowFor(brief!.id)
    expect(quote!.rate_aud).toBe(77)
    expect(quote!.markdown).toContain('per task')
    expect(quote!.markdown).toContain(`A$${RATE}`)
  })

  // Highest-consequence constraint in the project: DeepSeek is hosted in China
  // and lead fields are covered by Australian Privacy Act APP 8. This is the
  // first code with both a lead and the estimator in scope at once.
  it('never sends or renders a lead field', async () => {
    const spy = mockEstimator(shape)
    const conversationId = await seed()

    const leadId = newId('lead')
    await insertLead(env.DB, {
      id: leadId, createdAt: Date.now(), name: 'Jane Doe', email: 'jane@acme.com',
      company: 'Acme', role: null, phone: CANARY_PHONE, ipHash: 'x', country: null, asn: null, userAgent: null,
      utmSource: null, utmMedium: null, utmCampaign: null, referrer: null, landingPage: null,
      consentMarketing: true, consentTs: Date.now(),
    })
    await env.DB.prepare('UPDATE conversations SET lead_id = ? WHERE id = ?')
      .bind(leadId, conversationId).run()

    const res = await postGenerate({ conversationId }, PRICING_ENV)
    const json = await res.json<Body>()

    const sent = String((spy.mock.calls[0]![1] as RequestInit).body)
    expect(sent).not.toContain('Jane Doe')
    expect(sent).not.toContain('jane@acme.com')

    const brief = await briefRow(conversationId)
    const quote = await quoteRowFor(json.briefId)
    for (const md of [brief!.markdown, quote!.markdown, json.headline]) {
      expect(md).not.toContain('Jane Doe')
      expect(md).not.toContain('jane@acme.com')
      expect(md).not.toMatch(/@/)
    }
  })

  it('rejects an unknown conversation with 404', async () => {
    const spy = forbidLlm()
    const res = await postGenerate({ conversationId: 'conv_nope' })

    expect(res.status).toBe(404)
    // The body matters: Hono's own not-found handler also returns 404, so a
    // status-only assertion passes on an unregistered route.
    expect(await res.json()).toEqual({ error: 'not_found' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('rejects a conversation that has not reached GENERATE with 409', async () => {
    const spy = forbidLlm()
    const conversationId = await seed('CONSTRAINTS')

    const res = await postGenerate({ conversationId })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'wrong_state', state: 'CONSTRAINTS' })
    expect(spy).not.toHaveBeenCalled()

    expect(await briefRow(conversationId)).toBeNull()
    expect((await convRow(conversationId))!.state).toBe('CONSTRAINTS')
  })

  it('is idempotent: a repeat returns the same brief without a second estimate', async () => {
    const spy = mockEstimator(shape)
    const conversationId = await seed()

    const first = await (await postGenerate({ conversationId }, PRICING_ENV)).json<Body>()
    expect(spy).toHaveBeenCalledTimes(ESTIMATE_SAMPLES)

    const second = await postGenerate({ conversationId }, PRICING_ENV)
    expect(second.status).toBe(200)
    const body = await second.json<Body>()

    expect(body.briefId).toBe(first.briefId)
    expect(body.quoteId).toBe(first.quoteId)
    expect(body.quote).toEqual(first.quote)

    // Count the calls. Matching responses would also hold on an implementation
    // that re-ran the estimate and happened to get the same stub back.
    expect(spy).toHaveBeenCalledTimes(ESTIMATE_SAMPLES)

    const briefs = await env.DB.prepare('SELECT COUNT(*) AS n FROM briefs WHERE conversation_id = ?')
      .bind(conversationId).first<{ n: number }>()
    const quotes = await env.DB.prepare('SELECT COUNT(*) AS n FROM quotes WHERE brief_id = ?')
      .bind(first.briefId).first<{ n: number }>()
    expect(briefs!.n).toBe(1)
    expect(quotes!.n).toBe(1)
  })

  // A brief with no quote used to be permanent: the idempotency check returned
  // before the estimator, so a conversation rate-limited today could never
  // produce a quote, even after the allowance reset. Seen on a real lead.
  it('retries the estimate when a brief exists but no quote does', async () => {
    const cap = Number(env.MAX_QUOTES_PER_IP_PER_DAY)
    for (let i = 0; i < cap; i += 1) {
      await recordQuote(env.DB, await hashIp(ip, env.IP_HASH_SALT), utcDay(Date.now()))
    }
    const conversationId = await seed()

    // First pass: rate limited, so a brief lands with no quote.
    forbidLlm()
    const first = await (await postGenerate({ conversationId })).json<Body>()
    expect(first.quoteId).toBeNull()
    expect(first.briefId).toBeTruthy()

    // Allowance resets; the same conversation must now be able to get priced.
    await env.DB.prepare('DELETE FROM rate_limit').run()
    mockEstimator(shape)
    const second = await (await postGenerate({ conversationId })).json<Body>()

    expect(second.quoteId).toBeTruthy()
    expect(second.quoteUrl).toContain('/q/?id=')
    // The SAME brief is reused — a second one would orphan the first and break
    // what quotes.brief_id means.
    expect(second.briefId).toBe(first.briefId)
  })

  it('returns the brief with no quote and makes no LLM call when rate limited', async () => {
    const spy = forbidLlm()
    const conversationId = await seed()
    // Fill the allowance rather than assuming it is 1 — the cap is configurable
    // (MAX_QUOTES_PER_IP_PER_DAY) precisely because one-per-IP is one per
    // NETWORK, and a hardcoded 1 here would silently stop testing the limit the
    // day that value changes.
    const cap = Number(env.MAX_QUOTES_PER_IP_PER_DAY)
    for (let i = 0; i < cap; i += 1) {
      await recordQuote(env.DB, await hashIp(ip, env.IP_HASH_SALT), utcDay(Date.now()))
    }

    const res = await postGenerate({ conversationId })
    expect(res.status).toBe(200)

    const json = await res.json<Body>()
    expect(GenerateResponseSchema.safeParse(json).success).toBe(true)
    expect(json.quote).toBeNull()
    expect(json.quoteId).toBeNull()
    expect(json.headline.toLowerCase()).toContain('book a call')

    // The whole point of gating the artifact rather than the conversation is
    // that the expensive call never happens.
    expect(spy).not.toHaveBeenCalled()

    const brief = await briefRow(conversationId)
    expect(brief!.markdown).toContain('PawBook')

    // A refresh must not turn into a spend either.
    const again = await postGenerate({ conversationId })
    const repeat = await again.json<Body>()
    expect(repeat.briefId).toBe(json.briefId)
    expect(repeat.quote).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })

  it('still returns the brief when the estimator fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('boom', { status: 502 }))
    const conversationId = await seed()

    const res = await postGenerate({ conversationId })
    // The interview happened; the visitor gets what it produced. Never a 500.
    expect(res.status).toBe(200)

    const json = await res.json<Body>()
    expect(GenerateResponseSchema.safeParse(json).success).toBe(true)
    expect(json.quote).toBeNull()
    expect(json.quoteId).toBeNull()
    expect(json.headline.length).toBeGreaterThan(0)
    expect(json.headline.toLowerCase()).not.toContain('error')

    const brief = await briefRow(conversationId)
    expect(brief!.markdown).toContain('PawBook')

    const event = await env.DB
      .prepare("SELECT type FROM events WHERE conversation_id = ? AND type = 'estimate_failed'")
      .bind(conversationId).first<{ type: string }>()
    expect(event!.type).toBe('estimate_failed')
  })

  it('writes ended_at and leaves abandoned_at_state null once the session reaches DONE', async () => {
    mockEstimator(shape)
    const conversationId = await seed()
    await postGenerate({ conversationId }, PRICING_ENV)

    const conv = await convRow(conversationId)
    expect(conv!.ended_at).toBeGreaterThan(0)
    expect(conv!.abandoned_at_state).toBeNull()
  })

  // The spec calls abandoned_at_state the highest-value column in the schema
  // and nothing in this codebase has ever written it. Assert the column value,
  // not that the branch ran.
  it('writes abandoned_at_state when a session ends before DONE', async () => {
    const conversationId = await seed('CONTACT')
    await endConversation(env.DB, conversationId, 'CONTACT', 1_700_000_000_000)

    const conv = await convRow(conversationId)
    expect(conv!.abandoned_at_state).toBe('CONTACT')
    expect(conv!.ended_at).toBe(1_700_000_000_000)
  })

  it('advances the session to DONE in KV and D1 together', async () => {
    mockEstimator(shape)
    const conversationId = await seed()
    await postGenerate({ conversationId }, PRICING_ENV)

    const conv = await convRow(conversationId)
    const session = JSON.parse((await env.SESSIONS.get(sessionKey(conversationId)))!) as
      { state: string; totalTurns: number }

    expect(session.state).toBe('DONE')
    expect(conv!.state).toBe(session.state)
    expect(conv!.turn_count).toBe(session.totalTurns)
  })

  it('replaces the band with a starter-engagement headline below the floor', async () => {
    mockEstimator(shape)
    const conversationId = await seed()

    // Default RATE_PER_TASK_AUD of "10" puts this fixture's midpoint (1505) far
    // under MINIMUM_ENGAGEMENT_AUD (6000).
    const res = await postGenerate({ conversationId })
    const json = await res.json<Body>()

    expect(json.quote!.belowFloor).toBe(true)
    expect(json.headline.toLowerCase()).toMatch(/smaller|starter/)

    // Replaces, not accompanies — quoting a figure the business cannot service
    // profitably is the harm this branch exists to prevent.
    expect(json.headline).not.toMatch(/1,?129/)
    expect(json.headline).not.toMatch(/1,?881/)
  })

  /**
   * Slots live ONLY in KV, under an 86400s TTL. `loadSession` falls back to the
   * durable D1 row for `state` and `turn_count`, but the slots are gone — it
   * returns `initialState()`'s empty slot bag while carrying `GENERATE` from
   * D1. Without a guard, `buildBriefSections({})` renders every section as
   * "_Not captured during the interview._", and that empty brief is persisted,
   * sent to DeepSeek, priced, stored, and HANDED TO THE CLIENT as a dollar
   * commitment derived from nothing.
   */
  it('409s session_expired when the KV session is gone, and quotes nothing', async () => {
    const spy = forbidLlm()
    const conversationId = await seedWithoutKv()

    const res = await postGenerate({ conversationId }, PRICING_ENV)

    // 409, not 404 and not 500: the conversation exists and the request is
    // well-formed — the visitor's interview state is gone, which is a
    // wrong-state condition.
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body).toEqual({ error: 'session_expired' })
    // A new code is worthless to a Plan 3 client if the contract cannot parse it.
    expect(ErrorResponseSchema.safeParse(body).success).toBe(true)

    // Zero outbound calls. The spy covers every host, so this is both "the
    // expensive call never happened" and "nothing left the Worker at all" —
    // the estimate is the one call that would turn an empty brief into a
    // priced artifact.
    expect(spy).not.toHaveBeenCalled()

    // No degraded artifact of any kind. Quotes are counted globally because
    // with no brief there is no brief_id to join on, and this file's other
    // tests have already written rows.
    expect(await briefRow(conversationId)).toBeNull()
    const quotes = await env.DB.prepare('SELECT COUNT(*) AS n FROM quotes')
      .first<{ n: number }>()

    // A retry must not creep past the guard either.
    const retry = await postGenerate({ conversationId }, PRICING_ENV)
    expect(retry.status).toBe(409)
    expect(await briefRow(conversationId)).toBeNull()
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM quotes').first<{ n: number }>())!.n)
      .toBe(quotes!.n)
  })

  it('409s session_expired when the session carries a name but no problem', async () => {
    const spy = forbidLlm()
    // Present in KV, so this is not the expiry path — it pins that the guard
    // reads more than `project_name`. A brief whose "## Problem" section is a
    // placeholder is not something to quote a number against.
    const conversationId = await seed('GENERATE', { project_name: 'PawBook' })

    const res = await postGenerate({ conversationId }, PRICING_ENV)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'session_expired' })
    expect(spy).not.toHaveBeenCalled()
    expect(await briefRow(conversationId)).toBeNull()
  })

  // The guard must not be over-broad. A terse but genuine interview still gets
  // its quote: the graph decides whether enough was asked, not this route.
  it('still generates for a session carrying only the required slots', async () => {
    const spy = mockEstimator(shape)
    const conversationId = await seed('GENERATE', {
      project_name: 'PawBook',
      problem: 'Booking a groomer takes six phone calls.',
    })

    const res = await postGenerate({ conversationId }, PRICING_ENV)
    expect(res.status).toBe(200)

    const json = await res.json<Body>()
    expect(GenerateResponseSchema.safeParse(json).success).toBe(true)
    expect(json.quote!.totalTasks).toBe(137)
    expect(spy).toHaveBeenCalledTimes(ESTIMATE_SAMPLES)
    expect((await briefRow(conversationId))!.markdown).toContain('PawBook')
  })

  it('rejects an invalid body with 400', async () => {
    const spy = forbidLlm()
    expect((await postGenerate({})).status).toBe(400)
    expect(spy).not.toHaveBeenCalled()
  })
})
