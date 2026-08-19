import { env, exports } from 'cloudflare:workers'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GenerateResponseSchema, type EstimateShape } from '@unodigit/ba-bot-contract'
import app from '../../src/index'
import { createConversation, insertLead, updateConversationState } from '../../src/db/queries'
import { renderEmailHtml } from '../../src/mail/template'
import { sendQuoteEmail } from '../../src/mail/resend'
import { sessionKey } from '../../src/session'
import { newId } from '../../src/util/ids'
import { verifyId } from '../../src/util/sign'

// Same hazard as test/api/generate.test.ts: D1 persists across tests in this
// file and `rate_limit` is keyed on (ip_hash, day), so a shared IP would leave
// every test after the first silently rate-limited — and a rate-limited request
// produces no quote, hence no email, so these tests would pass by asserting on
// a branch that never ran. One IP per test. A different /24 to generate.test.ts
// costs nothing and removes any doubt about cross-file storage.
let ip = ''
let ipCounter = 0

// Chosen so the fixture prices above MINIMUM_ENGAGEMENT_AUD ("6000") and lands
// on the band-showing branch; identical reasoning to generate.test.ts.
const RATE = '77'

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
 * One spy for both outbound calls, routed on host. Responses are built lazily
 * inside the implementation: an eagerly-constructed Response is bound to the
 * request that created it and workerd rejects the read with "Cannot perform I/O
 * on behalf of a different request."
 */
function mockFetch(resend: { status?: number; body?: unknown; throws?: boolean } = {}) {
  const calls: Call[] = []
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      calls.push({ url, init: init ?? {} })

      if (url.includes('api.resend.com')) {
        if (resend.throws) throw new Error('network down')
        return new Response(JSON.stringify(resend.body ?? { id: 'a1b2c3d4-resend-id' }), {
          status: resend.status ?? 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(shape) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 900, completion_tokens: 400 },
      }), { headers: { 'content-type': 'application/json' } })
    },
  )

  return {
    spy,
    calls,
    llm: () => calls.filter((c) => !c.url.includes('api.resend.com')),
    resend: () => calls.filter((c) => c.url.includes('api.resend.com')),
  }
}

async function postGenerate(conversationId: string, overrides: Record<string, unknown> = {}) {
  const init = {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify({ conversationId }),
  }
  return await app.fetch(
    new Request('https://api.test/api/generate', init),
    { ...env, RATE_PER_TASK_AUD: RATE, ...overrides },
  )
}

async function seed(leadEmail: string | null, leadName: string | null = null): Promise<string> {
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
      company: 'Acme', role: null, ipHash: 'x', country: null, asn: null, userAgent: null,
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

const eventsOfType = (conversationId: string, type: string) =>
  env.DB.prepare('SELECT * FROM events WHERE conversation_id = ? AND type = ?')
    .bind(conversationId, type).all<{ type: string; payload_json: string }>()

interface Body {
  briefId: string
  quoteId: string | null
  quote: { totalTasks: number; belowFloor: boolean } | null
  headline: string
  state: string
}

const bodyOf = (call: Call): Record<string, unknown> =>
  JSON.parse(String(call.init.body)) as Record<string, unknown>

beforeEach(() => {
  vi.restoreAllMocks()
  ipCounter += 1
  ip = `198.51.100.${ipCounter}`
})

describe('renderEmailHtml', () => {
  const args = {
    projectName: 'PawBook',
    briefMarkdown: '# PawBook — Project Brief\n\n## Problem\n\nBooking takes six calls.\n',
    quoteMarkdown: [
      '# PawBook — Indicative Quote',
      '',
      '**~137 tasks · estimated A$8,691–A$14,486**',
      '',
      '## Breakdown',
      '',
      '| Area | Tasks | Weight | Example',
      '|---|---:|---:|---|',
      '| Core functionality | 60 | 1.2× | Create a booking |',
      '',
      '## What drives the size',
      '',
      '- Two-sided marketplace',
      '',
      '_Indicative only._',
      '',
    ].join('\n'),
    quoteUrl: 'https://www.unodigit.com.au/q/quote_abc?sig=deadbeef',
  }

  it('carries the project name and a clickable quote link', () => {
    const html = renderEmailHtml(args)
    expect(html).toContain('PawBook')
    expect(html).toContain(`href="${args.quoteUrl}"`)
  })

  it('renders the full cost breakdown, not just a link', () => {
    const html = renderEmailHtml(args)
    // The product decision is that the detail lives in the email body. A page
    // that only linked out would pass a "contains the URL" assertion while
    // shipping none of the substance.
    expect(html).toContain('8,691')
    expect(html).toContain('14,486')
    expect(html).toContain('Core functionality')
    expect(html).toContain('<table')
    expect(html).toContain('<h2')
    expect(html).toContain('<li>')
    expect(html).toContain('<strong>')
    expect(html).toContain('Booking takes six calls.')
  })

  it('escapes markup in a visitor-supplied project name', () => {
    const html = renderEmailHtml({ ...args, projectName: '<script>alert(1)</script>' })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('sendQuoteEmail', () => {
  const args = {
    apiKey: 'test-resend-key',
    to: 'client@example.invalid',
    projectName: 'PawBook',
    briefMarkdown: '# Brief',
    quoteMarkdown: '# Quote',
    quoteUrl: 'https://www.unodigit.com.au/q/quote_abc?sig=deadbeef',
  }

  it('posts to the Resend API and returns the provider id', async () => {
    const m = mockFetch()
    const result = await sendQuoteEmail(args)

    expect(result).toEqual({ ok: true, id: 'a1b2c3d4-resend-id' })
    expect(m.resend()).toHaveLength(1)

    const call = m.resend()[0]!
    expect(call.url).toBe('https://api.resend.com/emails')
    expect(call.init.method).toBe('POST')
    expect(new Headers(call.init.headers).get('authorization')).toBe('Bearer test-resend-key')

    const sent = bodyOf(call)
    expect(sent.to).toEqual(['client@example.invalid'])
    expect(String(sent.subject)).toContain('PawBook')
    expect(String(sent.html)).toContain(args.quoteUrl)
  })

  // Asserting `html` is present would also pass on a body that shipped a PDF
  // alongside it. The product decision is no attachment, so assert its absence.
  it('sends HTML only — the request body carries no attachments', async () => {
    const m = mockFetch()
    await sendQuoteEmail(args)

    const sent = bodyOf(m.resend()[0]!)
    expect(Object.keys(sent)).not.toContain('attachments')
    expect(sent.attachments).toBeUndefined()
    expect(String(JSON.stringify(sent))).not.toContain('application/pdf')
    expect(sent.html).toBeTruthy()
  })

  it('returns ok:false on a non-2xx without throwing', async () => {
    mockFetch({ status: 422, body: { message: 'domain not verified' } })
    const result = await sendQuoteEmail(args)

    expect(result.ok).toBe(false)
    expect(String(result.error)).toContain('422')
  })

  it('returns ok:false when the network throws', async () => {
    mockFetch({ throws: true })
    const result = await sendQuoteEmail(args)

    expect(result.ok).toBe(false)
    expect(String(result.error)).toContain('network down')
  })

  it('makes no request at all when the api key is unset', async () => {
    const m = mockFetch()
    const result = await sendQuoteEmail({ ...args, apiKey: '' })

    expect(result.ok).toBe(false)
    // An unset key guarantees a 401. Spending a request to discover that on
    // every quote is noise in the logs and latency on the response.
    expect(m.resend()).toHaveLength(0)
  })
})

describe('POST /api/generate — email delivery', () => {
  it('emails the lead a signed link to the hosted quote', async () => {
    const m = mockFetch()
    const conversationId = await seed('client@example.invalid')

    const res = await postGenerate(conversationId)
    expect(res.status).toBe(200)
    const json = await res.json<Body>()

    expect(m.resend()).toHaveLength(1)
    const sent = bodyOf(m.resend()[0]!)
    expect(sent.to).toEqual(['client@example.invalid'])

    const html = String(sent.html)
    expect(html).toContain('PawBook')

    // The link must be the real signed one, not a bare id: GET /api/quote/:id
    // rejects an unsigned or wrongly-signed request with 403, so an unverified
    // link is a dead link in the client's inbox.
    const match = html.match(/https:\/\/[^"']*\/q\/([^?"']+)\?sig=([0-9a-fA-F]+)/)
    expect(match).not.toBeNull()
    expect(match![1]).toBe(json.quoteId)
    expect(await verifyId(match![1]!, match![2]!, env.QUOTE_LINK_SIGNING_KEY)).toBe(true)

    const events = await eventsOfType(conversationId, 'quote_email_sent')
    expect(events.results).toHaveLength(1)
  })

  it('never emails when the conversation has no lead', async () => {
    const m = mockFetch()
    const conversationId = await seed(null)

    const res = await postGenerate(conversationId)
    expect(res.status).toBe(200)

    expect(m.resend()).toHaveLength(0)
    expect(m.llm()).toHaveLength(1)
  })

  it('still returns 200 with a readable brief and quote when the send fails', async () => {
    const m = mockFetch({ status: 500, body: { message: 'resend is down' } })
    const conversationId = await seed('client@example.invalid')

    const res = await postGenerate(conversationId)

    // The brief and the quote are already persisted. Losing the email must not
    // cost the visitor their artifacts or turn a success into a 500.
    expect(res.status).toBe(200)
    const json = await res.json<Body>()
    expect(GenerateResponseSchema.safeParse(json).success).toBe(true)
    expect(json.quoteId).not.toBeNull()
    expect(json.quote!.totalTasks).toBe(137)
    expect(json.headline).toContain('137 tasks')
    expect(json.state).toBe('DONE')

    // Readable AFTERWARDS, not merely returned once: a failed send must not
    // roll back, orphan, or truncate what was written.
    const brief = await briefRow(conversationId)
    expect(brief!.markdown).toContain('PawBook')
    const quote = await quoteRowFor(brief!.id)
    expect(quote!.id).toBe(json.quoteId)
    expect(quote!.markdown).toContain('per task')

    expect(m.resend()).toHaveLength(1)

    const failed = await eventsOfType(conversationId, 'quote_email_failed')
    expect(failed.results).toHaveLength(1)
    expect(String(failed.results[0]!.payload_json)).toContain('500')
    // A failure must not also be logged as a success.
    expect((await eventsOfType(conversationId, 'quote_email_sent')).results).toHaveLength(0)
  })

  it('still returns 200 when the Resend call throws outright', async () => {
    mockFetch({ throws: true })
    const conversationId = await seed('client@example.invalid')

    const res = await postGenerate(conversationId)
    expect(res.status).toBe(200)

    const json = await res.json<Body>()
    expect(json.quoteId).not.toBeNull()
    expect((await eventsOfType(conversationId, 'quote_email_failed')).results).toHaveLength(1)
  })

  it('still returns 200 when the delivery path itself throws', async () => {
    mockFetch()
    const conversationId = await seed('client@example.invalid')

    // A misconfigured PUBLIC_SITE_URL makes building the link throw — standing
    // in for any unexpected failure in the delivery path. The failure mode this
    // guards against is not only the 500: an escaping throw also skips finish(),
    // so the session would never advance to DONE and the conversation row would
    // never be closed, despite both artifacts being committed.
    const res = await postGenerate(conversationId, { PUBLIC_SITE_URL: undefined })
    expect(res.status).toBe(200)

    const json = await res.json<Body>()
    expect(json.state).toBe('DONE')
    expect(json.quoteId).not.toBeNull()

    const brief = await briefRow(conversationId)
    expect((await quoteRowFor(brief!.id))!.id).toBe(json.quoteId)
    expect((await eventsOfType(conversationId, 'quote_email_failed')).results).toHaveLength(1)
  })

  // The highest-value test in this story. A lead's email address is deliberately
  // read here for the first time; DeepSeek is hosted in China and Australian
  // Privacy Act APP 8 makes any leak of it the worst outcome in the project.
  // It must reach the Resend envelope and NOTHING else.
  it('sends the lead address to Resend and nowhere else (PII canary)', async () => {
    const CANARY = 'canary-pii@example.invalid'
    const CANARY_NAME = 'Canary McPiiface'

    const m = mockFetch()
    const conversationId = await seed(CANARY, CANARY_NAME)

    const res = await postGenerate(conversationId)
    const json = await res.json<Body>()

    // 1. Present where it belongs: the Resend envelope.
    const resendBody = bodyOf(m.resend()[0]!)
    expect(resendBody.to).toEqual([CANARY])

    // 2. Absent from the outbound LLM request body.
    expect(m.llm()).toHaveLength(1)
    const llmBody = String(m.llm()[0]!.init.body)
    expect(llmBody).not.toContain(CANARY)
    expect(llmBody).not.toContain(CANARY_NAME)
    expect(llmBody).not.toContain('canary-pii')

    // 3. Absent from the stored brief markdown.
    const brief = await briefRow(conversationId)
    expect(brief!.markdown).not.toContain(CANARY)
    expect(brief!.markdown).not.toContain(CANARY_NAME)

    // 4. Absent from the stored quote markdown.
    const quote = await quoteRowFor(brief!.id)
    expect(quote!.markdown).not.toContain(CANARY)
    expect(quote!.markdown).not.toContain(CANARY_NAME)

    // 5. Absent from the generate response the browser receives.
    expect(JSON.stringify(json)).not.toContain(CANARY)
    expect(JSON.stringify(json)).not.toContain(CANARY_NAME)

    // The event log is a support surface read by anyone with dashboard access;
    // the address is already in `leads`, so repeating it here is gratuitous.
    const sent = await eventsOfType(conversationId, 'quote_email_sent')
    expect(String(sent.results[0]!.payload_json)).not.toContain(CANARY)
  })
})
