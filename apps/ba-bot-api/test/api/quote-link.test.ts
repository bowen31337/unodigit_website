import { env, exports } from 'cloudflare:workers'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GenerateResponseSchema, type EstimateShape } from '@unodigit/ba-bot-contract'
import app from '../../src/index'
import { createConversation, insertLead, updateConversationState } from '../../src/db/queries'
import { recordQuote, utcDay } from '../../src/guards/ratelimit'
import { sessionKey } from '../../src/session'
import { hashIp } from '../../src/util/hash'
import { newId } from '../../src/util/ids'
import { verifyId } from '../../src/util/sign'

/** A lead field that must never leave the leads table during generation. */
const CANARY_PHONE = '+61 400 111 222'

/**
 * The signed download link is now the ONLY delivery mechanism.
 *
 * US-010 decommissioned email: `src/mail/` is gone and nothing is sent to the
 * lead, so a client who does not get `quoteUrl` back from POST /api/generate
 * never reaches their quote at all. That makes every property below — the query
 * shape, the signature actually verifying, and the honest `null` — load-bearing
 * in a way they were not when the email carried a second copy of the link.
 *
 * Same hazard as test/api/generate.test.ts: D1 persists across tests in this
 * file and `rate_limit` is keyed on (ip_hash, day), so a shared IP would leave
 * every test after the first silently rate-limited — producing no quote, hence
 * no link, and passing by asserting on a branch that never ran. ONE IP PER TEST.
 * A different /24 to generate.test.ts costs nothing.
 */
let ip = ''
let ipCounter = 0

// This fixture pins BOTH pricing knobs it depends on. Production values have
// already moved three times (rate 10 -> 25 -> 10, floor 6000 -> 2000,
// tasksPerWeek 25 -> 500); a fixture that drifts with them asserts nothing
// stable. Coherence of the SHIPPED values is pinned separately in
// test/pricing/quote.test.ts, which reads wrangler.toml on purpose.
const PRICING_ENV = { RATE_PER_TASK_AUD: '77', TASKS_PER_WEEK: '25' }

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
}

interface Call { url: string; init: RequestInit }

/**
 * Records every outbound call so "nothing left the Worker but the estimate" is
 * assertable, not assumed. The Response is built lazily inside the
 * implementation: an eagerly-constructed one is bound to the request that
 * created it and workerd rejects the read with "Cannot perform I/O on behalf of
 * a different request."
 */
function mockEstimator() {
  const calls: Call[] = []
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      calls.push({ url, init: init ?? {} })
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(shape) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 900, completion_tokens: 400 },
      }), { headers: { 'content-type': 'application/json' } })
    },
  )
  return { spy, calls }
}

/** Fails loudly if anything outbound happens at all. */
function forbidLlm() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    throw new Error('the LLM must not be called on this path')
  })
}

async function postGenerate(conversationId: string, overrides: Record<string, unknown> = {}) {
  const init = {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify({ conversationId }),
  }
  return await app.fetch(
    new Request('https://api.test/api/generate', init),
    { ...env, ...PRICING_ENV, ...overrides },
  )
}

async function seed(leadEmail: string | null = null, leadName: string | null = null): Promise<string> {
  const id = newId('conv')
  await createConversation(env.DB, id, Date.now())
  await updateConversationState(env.DB, id, 'GENERATE', 20)
  await env.SESSIONS.put(sessionKey(id), JSON.stringify({
    state: 'GENERATE', slots, turnsInState: 0, totalTurns: 20, forcedAdvances: [],
  }))

  if (leadEmail !== null) {
    const leadId = newId('lead')
    await insertLead(env.DB, {
      id: leadId, createdAt: Date.now(), name: leadName, email: leadEmail,
      company: 'Acme', role: null, phone: CANARY_PHONE, ipHash: 'x', country: null, asn: null, userAgent: null,
      utmSource: null, utmMedium: null, utmCampaign: null, referrer: null, landingPage: null,
      consentMarketing: true, consentTs: Date.now(),
    })
    // FK ordering: the lead row must exist before conversations.lead_id points at it.
    await env.DB.prepare('UPDATE conversations SET lead_id = ? WHERE id = ?').bind(leadId, id).run()
  }

  return id
}

const briefRow = (conversationId: string) =>
  env.DB.prepare('SELECT * FROM briefs WHERE conversation_id = ?').bind(conversationId)
    .first<{ id: string; markdown: string }>()

const quoteRowFor = (briefId: string) =>
  env.DB.prepare('SELECT * FROM quotes WHERE brief_id = ?').bind(briefId)
    .first<{ id: string; markdown: string }>()

const eventsOf = (conversationId: string) =>
  env.DB.prepare('SELECT type, payload_json FROM events WHERE conversation_id = ?')
    .bind(conversationId).all<{ type: string; payload_json: string }>()

interface Body {
  briefId: string
  quoteId: string | null
  quote: { totalTasks: number; belowFloor: boolean } | null
  quoteUrl: string | null
  headline: string
  state: string
}

beforeEach(() => {
  vi.restoreAllMocks()
  ipCounter += 1
  ip = `198.51.100.${ipCounter}`
})

describe('POST /api/generate — the signed quote link', () => {
  /**
   * The link shape is EFFECTIVELY PERMANENT. A link already shown to a client
   * cannot be reissued, so changing it later strands every quote produced
   * before the change — there is no migration and no redirect we control.
   *
   * Spec §11 marks the static shell at `app/q/page.tsx` reading `?id=…&sig=…`
   * as Preferred: the site is `output: 'export'` with `trailingSlash: true`, so
   * a dynamic `/q/[id]` route cannot be pre-rendered for ids that do not exist
   * at build time and the path form resolves to Cloudflare Pages' `404.html`.
   *
   * Parsed with `new URL`, never regex-matched: a regex over the whole string
   * passes on `/q/quote_abc?id=…` and on an id that merely appears somewhere in
   * the URL. Only a parse proves the id is the `id` QUERY parameter.
   */
  it('returns a /q/?id=&sig= query link, never the dead /q/<id> path form', async () => {
    mockEstimator()
    const conversationId = await seed()

    const res = await postGenerate(conversationId)
    expect(res.status).toBe(200)

    const json = await res.json<Body>()
    expect(GenerateResponseSchema.safeParse(json).success).toBe(true)
    expect(json.quoteId).not.toBeNull()
    expect(json.quoteUrl).not.toBeNull()

    const url = new URL(json.quoteUrl!)
    expect(url.origin).toBe(new URL(String(env.PUBLIC_SITE_URL)).origin)
    expect(url.pathname).toBe('/q/')
    expect(url.searchParams.get('id')).toBe(json.quoteId)
    expect(url.searchParams.get('sig')).toMatch(/^[0-9a-f]{64}$/)

    // The dead path form, spelled out. A quote id is always `quote_…`.
    expect(json.quoteUrl).not.toMatch(/\/q\/quote_/)
  })

  /**
   * The highest-value test in this story. Nothing else in the suite would catch
   * a signature built over the wrong input: the URL would still parse, still
   * carry a 64-hex `sig`, still name the right quote id — and GET
   * /api/quote/:id would answer 403 for every client, forever, because that
   * route deliberately makes a bad signature indistinguishable from an unknown
   * id. A link the client cannot open is worse than no link at all, because it
   * looks like delivery succeeded.
   *
   * So the signature is round-tripped through the real verifier under the real
   * binding, and a wrong id is checked to FAIL — otherwise a `verifyId` that
   * returned true unconditionally would satisfy the positive half.
   */
  it('returns a signature that verifies against the quote id under the signing key', async () => {
    mockEstimator()
    const conversationId = await seed()

    const json = await (await postGenerate(conversationId)).json<Body>()
    const url = new URL(json.quoteUrl!)
    const id = url.searchParams.get('id')!
    const sig = url.searchParams.get('sig')!

    expect(id).toBe(json.quoteId)
    expect(await verifyId(id, sig, env.QUOTE_LINK_SIGNING_KEY)).toBe(true)

    // Negative control: the signature is over THIS id, not over anything.
    expect(await verifyId(`${id}x`, sig, env.QUOTE_LINK_SIGNING_KEY)).toBe(false)
    expect(await verifyId(id, sig, 'not-the-signing-key')).toBe(false)
  })

  // A refresh, or a visitor who closed the widget and came back, must be able to
  // open their quote again. With email gone this response is the only copy of
  // the link there is, so the idempotent re-read has to rebuild it identically —
  // the signature is a deterministic HMAC over the id, so it can.
  it('returns the identical link on an idempotent repeat', async () => {
    const { spy } = mockEstimator()
    const conversationId = await seed()

    const first = await (await postGenerate(conversationId)).json<Body>()
    const second = await (await postGenerate(conversationId)).json<Body>()

    expect(second.quoteId).toBe(first.quoteId)
    expect(second.quoteUrl).toBe(first.quoteUrl)
    expect(second.quoteUrl).not.toBeNull()
    expect(await verifyId(
      new URL(second.quoteUrl!).searchParams.get('id')!,
      new URL(second.quoteUrl!).searchParams.get('sig')!,
      env.QUOTE_LINK_SIGNING_KEY,
    )).toBe(true)

    // No second estimate: the link is rebuilt, the quote is not.
    expect(spy).toHaveBeenCalledTimes(1)
  })

  // There is no quote behind a rate-limited request, so there is nothing to
  // link to. A fabricated URL would 403 on arrival and read to the client as a
  // broken promise rather than as the "book a call" conversation the limit is
  // meant to start. The brief is still delivered.
  it('returns quoteUrl null when the request is rate limited', async () => {
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

    const res = await postGenerate(conversationId)
    expect(res.status).toBe(200)

    const json = await res.json<Body>()
    expect(GenerateResponseSchema.safeParse(json).success).toBe(true)
    expect(json.quoteId).toBeNull()
    expect(json.quote).toBeNull()
    expect(json.quoteUrl).toBeNull()
    expect(json.headline.toLowerCase()).toContain('book a call')

    // The brief is still delivered — the limit gates the artifact, not the
    // interview — and the expensive call still never happens.
    expect((await briefRow(conversationId))!.markdown).toContain('PawBook')
    expect(spy).not.toHaveBeenCalled()
  })

  // Same reasoning on the other no-quote exit: the estimator failed, so no
  // quote row exists and no id can be signed.
  it('returns quoteUrl null when the estimator fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('boom', { status: 502 }))
    const conversationId = await seed()

    const res = await postGenerate(conversationId)
    expect(res.status).toBe(200)

    const json = await res.json<Body>()
    expect(GenerateResponseSchema.safeParse(json).success).toBe(true)
    expect(json.quoteId).toBeNull()
    expect(json.quoteUrl).toBeNull()
    expect((await briefRow(conversationId))!.markdown).toContain('PawBook')
  })

  /**
   * Retargeted from the deleted email suite's "still returns 200 when the send
   * fails / when the delivery path itself throws". The resilience property is
   * unchanged and still matters — only the downstream step it names has moved
   * from Resend to link construction.
   *
   * A missing PUBLIC_SITE_URL makes building the link throw, standing in for any
   * unexpected failure in the delivery path. The failure mode being guarded is
   * not only the 500: an escaping throw would also skip `finish()`, so the
   * session would never advance to DONE and the conversation row would never be
   * closed, despite both artifacts being committed.
   */
  it('still returns 200 with readable artifacts when the link cannot be built', async () => {
    mockEstimator()
    const conversationId = await seed()

    const res = await postGenerate(conversationId, { PUBLIC_SITE_URL: undefined })
    expect(res.status).toBe(200)

    const json = await res.json<Body>()
    expect(GenerateResponseSchema.safeParse(json).success).toBe(true)
    expect(json.quoteUrl).toBeNull()
    expect(json.quoteId).not.toBeNull()
    expect(json.quote!.totalTasks).toBe(137)
    expect(json.headline).toContain('137 tasks')
    expect(json.state).toBe('DONE')

    // Readable AFTERWARDS, not merely returned once: a delivery failure must
    // not roll back, orphan, or truncate what was written.
    const brief = await briefRow(conversationId)
    expect(brief!.markdown).toContain('PawBook')
    const quote = await quoteRowFor(brief!.id)
    expect(quote!.id).toBe(json.quoteId)
    expect(quote!.markdown).toContain('per task')

    const events = await eventsOf(conversationId)
    expect(events.results.filter((e) => e.type === 'quote_link_failed')).toHaveLength(1)
  })

  // Retargeted from "never emails when the conversation has no lead". The point
  // then was that a missing lead must not break generation; the point now is
  // stronger — the link does not depend on a lead existing at all, because
  // nothing addressed to the lead is produced any more.
  it('returns a working link for a conversation with no lead attached', async () => {
    const { calls } = mockEstimator()
    const conversationId = await seed(null)

    const json = await (await postGenerate(conversationId)).json<Body>()
    expect(json.quoteUrl).not.toBeNull()

    const url = new URL(json.quoteUrl!)
    expect(url.searchParams.get('id')).toBe(json.quoteId)
    expect(await verifyId(
      url.searchParams.get('id')!, url.searchParams.get('sig')!, env.QUOTE_LINK_SIGNING_KEY,
    )).toBe(true)

    // Exactly one outbound call, and it is the estimate.
    expect(calls).toHaveLength(1)
  })

  /**
   * Retargeted from the deleted email suite's PII canary, and strictly stronger.
   *
   * That test asserted the lead's address reached the Resend envelope AND
   * NOTHING ELSE. There is no envelope any more: `deliver()` and
   * `getLeadEmailByConversation` are gone, so no lead field is read anywhere in
   * the generate path. The address no longer leaves the `leads` table at all
   * during generation, which is the strongest Australian Privacy Act APP 8
   * posture this route can hold — DeepSeek is hosted in China, and a leak of a
   * lead field into a prompt is the worst outcome in the project.
   *
   * Asserted as an absence everywhere, plus a count of outbound calls: "absent
   * from the LLM body" alone would still pass on an implementation that shipped
   * the address to some second host.
   */
  it('reads no lead field anywhere in the generate path (PII canary)', async () => {
    const CANARY = 'canary-pii@example.invalid'
    const CANARY_NAME = 'Canary McPiiface'

    const { calls } = mockEstimator()
    const conversationId = await seed(CANARY, CANARY_NAME)

    const json = await (await postGenerate(conversationId)).json<Body>()

    // Exactly one outbound call — the estimate. There is no second destination
    // a lead field could have been sent to.
    expect(calls).toHaveLength(1)
    const llmBody = String(calls[0]!.init.body)
    expect(llmBody).not.toContain(CANARY)
    expect(llmBody).not.toContain(CANARY_NAME)
    expect(llmBody).not.toContain('canary-pii')
    // phone is PII on the same row (migration 0005) and must not leak either.
    expect(llmBody).not.toContain(CANARY_PHONE)

    const brief = await briefRow(conversationId)
    const quote = await quoteRowFor(brief!.id)
    for (const stored of [brief!.markdown, quote!.markdown, JSON.stringify(json)]) {
      expect(stored).not.toContain(CANARY)
      expect(stored).not.toContain(CANARY_NAME)
      expect(stored).not.toContain(CANARY_PHONE)
      expect(stored).not.toMatch(/@/)
    }

    // The event log is a support surface read by anyone with dashboard access.
    // Every event for this conversation, not just the ones this story writes.
    const events = await eventsOf(conversationId)
    for (const e of events.results) {
      expect(String(e.payload_json)).not.toContain(CANARY)
      expect(String(e.payload_json)).not.toContain(CANARY_NAME)
    }
    // No email event survives the decommission.
    expect(events.results.map((e) => e.type)).not.toContain('quote_email_sent')
    expect(events.results.map((e) => e.type)).not.toContain('quote_email_failed')
  })

  // `exports.default` is the pre-bound loopback stub, so this exercises the
  // route through the real wrangler.toml bindings rather than an override
  // object — PUBLIC_SITE_URL included. Pricing is irrelevant here: the
  // assertion is about the link, not the number.
  it('builds the link from the deployed PUBLIC_SITE_URL', async () => {
    mockEstimator()
    const conversationId = await seed()

    const res = await exports.default.fetch('https://api.test/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
      body: JSON.stringify({ conversationId }),
    })
    const json = await res.json<Body>()

    const base = String(env.PUBLIC_SITE_URL).replace(/\/$/, '')
    expect(json.quoteUrl!.startsWith(`${base}/q/?id=`)).toBe(true)
  })
})
