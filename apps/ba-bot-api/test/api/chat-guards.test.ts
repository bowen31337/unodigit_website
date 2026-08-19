import { env, exports } from 'cloudflare:workers'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createConversation } from '../../src/db/queries'
import { utcDay } from '../../src/guards/ratelimit'
import { hashIp } from '../../src/util/hash'
import { newId } from '../../src/util/ids'

// One IP per test — D1 persists within a file and rate_limit_turns is keyed on
// (ip_hash, day). A shared IP silently rate-limits later tests, and they then
// fail for a reason unrelated to what they were testing.
const IP_A = '203.0.113.11'
const IP_B = '203.0.113.12'
const IP_C = '203.0.113.13'
const IP_D = '203.0.113.14'
const IP_E = '203.0.113.15'
const IP_F = '203.0.113.16'
const IP_G = '203.0.113.17'

const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
// vitest.config.ts binds LLM_BASE_URL to this. Every model call goes here, so
// counting calls against it is a direct measure of spend — which is the whole
// point of these guards.
const LLM_URL = 'https://llm.test'

function urlOf(input: unknown): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return (input as Request).url
}

/** Turnstile verification is itself a `fetch`, so a mock that answers every
 *  request with the LLM body would make `verifyTurnstile` read `success:
 *  undefined` and reject. Route by URL instead.
 *
 *  Responses are built lazily (inside the implementation, at call time) rather
 *  than eagerly via `mockResolvedValue` — a Response is an I/O object tied to
 *  the request context that created it, and workerd rejects the read with
 *  "Cannot perform I/O on behalf of a different request" otherwise. */
function mockFetch(opts: {
  turnstile?: boolean
  onLlm?: () => Promise<Response>
} = {}) {
  const { turnstile = true } = opts
  return vi.spyOn(globalThis, 'fetch').mockImplementation((async (input: unknown) => {
    if (urlOf(input).startsWith(TURNSTILE_URL)) {
      return new Response(JSON.stringify({ success: turnstile }), {
        headers: { 'content-type': 'application/json' },
      })
    }
    if (opts.onLlm) return await opts.onLlm()
    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            reply: 'ok', slots: {}, ready_to_advance: false, off_topic: false,
          }),
        },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }), { headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch)
}

/** Calls to the model only. `expect(spy).not.toHaveBeenCalled()` is too coarse
 *  once Turnstile verification also goes through `fetch`: a rate-limited
 *  request legitimately makes the siteverify call and must still make zero
 *  model calls. Asserting the status alone would pass on an implementation
 *  that called the model and then returned 429. */
function llmCalls(spy: { mock: { calls: unknown[][] } }): number {
  return spy.mock.calls.filter((call) => urlOf(call[0]).startsWith(LLM_URL)).length
}

// `exports.default` is a pre-bound loopback stub: fetch(input, init?) only —
// no env/ctx arguments, and no execution context to await.
async function post(body: unknown, ip: string) {
  return await exports.default.fetch('https://api.test/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify(body),
  })
}

const postWithToken = (body: Record<string, unknown>, ip: string) =>
  post({ ...body, turnstileToken: 'tok' }, ip)

/** A conversation row with no KV session: `loadSession` reseeds from D1, so
 *  the session arrives at GREETING with `totalTurns` 0 — a genuine first
 *  message, which is the only turn Turnstile guards. */
async function startConversation(): Promise<{ conversationId: string }> {
  const conversationId = newId('conv')
  await createConversation(env.DB, conversationId, Date.now())
  return { conversationId }
}

async function turnCount(ip: string): Promise<number> {
  const row = await env.DB
    .prepare('SELECT turns FROM rate_limit_turns WHERE ip_hash = ? AND day = ?')
    .bind(await hashIp(ip, env.IP_HASH_SALT), utcDay(Date.now()))
    .first<{ turns: number }>()
  return row?.turns ?? 0
}

/** Sets the ledger to an absolute value, so a test that seeds the cap twice
 *  does not end up at twice the cap. */
async function seedTurns(ip: string, turns: number): Promise<void> {
  await env.DB
    .prepare('INSERT OR REPLACE INTO rate_limit_turns (ip_hash, day, turns) VALUES (?, ?, ?)')
    .bind(await hashIp(ip, env.IP_HASH_SALT), utcDay(Date.now()), turns)
    .run()
}

beforeEach(() => vi.restoreAllMocks())

describe('POST /api/chat guards', () => {
  it('rejects a first message with no turnstile token', async () => {
    mockFetch()
    const { conversationId } = await startConversation()
    const res = await post({ conversationId, message: 'hi' }, IP_A)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'turnstile_required' })
  })

  it('makes NO LLM call when the turnstile token is missing', async () => {
    const spy = mockFetch()
    const { conversationId } = await startConversation()
    await post({ conversationId, message: 'hi' }, IP_B)
    // The point of rejecting early is not spending. Asserting the status alone
    // would pass on an implementation that called the model and then 403'd.
    expect(llmCalls(spy)).toBe(0)
    // Nothing at all should go out: with no token there is not even a
    // siteverify call to make.
    expect(spy).not.toHaveBeenCalled()
  })

  // An empty string is not a token. `z.string().optional()` accepts it, so the
  // route — not the schema — has to reject it, and it must be rejected
  // identically to an omitted field or the guard has a bypass.
  it('rejects an empty turnstile token exactly as it rejects a missing one', async () => {
    const spy = mockFetch()
    const { conversationId } = await startConversation()
    const res = await post({ conversationId, message: 'hi', turnstileToken: '' }, IP_F)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'turnstile_required' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('rejects a first message whose turnstile token fails verification', async () => {
    const spy = mockFetch({ turnstile: false })
    const { conversationId } = await startConversation()
    const res = await postWithToken({ conversationId, message: 'hi' }, IP_G)

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'turnstile_failed' })
    expect(llmCalls(spy)).toBe(0)

    const event = await env.DB
      .prepare("SELECT type FROM events WHERE conversation_id = ? AND type = 'turnstile_failed'")
      .bind(conversationId).first<{ type: string }>()
    expect(event?.type).toBe('turnstile_failed')
  })

  it('does not require a turnstile token after the first turn', async () => {
    mockFetch()
    const { conversationId } = await startConversation()
    const first = await postWithToken({ conversationId, message: 'hi' }, IP_C)
    expect(first.status).toBe(200)

    const res = await post({ conversationId, message: 'more' }, IP_C)
    expect(res.status).toBe(200)
  })

  it('429s once the per-IP daily turn cap is exceeded', async () => {
    mockFetch()
    const cap = Number(env.MAX_TURNS_PER_IP_PER_DAY)
    expect(cap).toBeGreaterThan(0)
    await seedTurns(IP_D, cap)

    const { conversationId } = await startConversation()
    const res = await postWithToken({ conversationId, message: 'hi' }, IP_D)
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'rate_limited' })
  })

  it('makes NO LLM call when rate limited', async () => {
    const spy = mockFetch()
    const cap = Number(env.MAX_TURNS_PER_IP_PER_DAY)
    await seedTurns(IP_D, cap)

    const { conversationId } = await startConversation()
    await postWithToken({ conversationId, message: 'hi' }, IP_D)
    expect(llmCalls(spy)).toBe(0)
  })

  it('records the turn before calling the model, not after', async () => {
    // A provider outage must still consume quota, otherwise a failing provider
    // is an unlimited free retry loop. `observed` is read from D1 at the moment
    // the model call is made, so any placement of recordTurn after that call —
    // including one immediately after `runTurn`, before its error branch — is
    // caught, not just a placement at the end of the handler.
    let observed = -1
    const spy = mockFetch({
      onLlm: async () => {
        observed = await turnCount(IP_A)
        throw new Error('provider down')
      },
    })

    const before = await turnCount(IP_A)
    const { conversationId } = await startConversation()
    await postWithToken({ conversationId, message: 'hi' }, IP_A)

    // Positive control: the model really was attempted, so "before the model
    // call" is not vacuously true because the call never happened.
    expect(llmCalls(spy)).toBeGreaterThan(0)
    expect(observed).toBe(before + 1)
    expect(await turnCount(IP_A)).toBe(before + 1)
  })

  it('never stores a raw IP', async () => {
    mockFetch()
    const { conversationId } = await startConversation()
    expect((await postWithToken({ conversationId, message: 'hi' }, IP_E)).status).toBe(200)

    const { results } = await env.DB
      .prepare('SELECT ip_hash FROM rate_limit_turns').all<{ ip_hash: string }>()

    // Guard against a vacuous pass over an empty table.
    expect(results.length).toBeGreaterThan(0)
    for (const row of results) {
      expect(row.ip_hash).toMatch(/^[0-9a-f]{64}$/)
      expect(row.ip_hash).not.toContain('203.0.113')
    }

    // The salted hash is what the ledger is keyed on, not some other digest.
    const hashes = results.map((r) => r.ip_hash)
    expect(hashes).toContain(await hashIp(IP_E, env.IP_HASH_SALT))
  })
})
