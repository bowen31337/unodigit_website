import { env, exports } from 'cloudflare:workers'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createConversation } from '../../src/db/queries'
import { sessionKey } from '../../src/session'
import { newId } from '../../src/util/ids'

// Response bodies are I/O objects tied to the request context that created
// them; `exports.default.fetch()` below runs the handler in its own context,
// so the mock Response must be constructed lazily (inside the implementation,
// at call time) rather than eagerly via `mockResolvedValue` — otherwise
// workerd rejects the read with "Cannot perform I/O on behalf of a different
// request." Same mechanic as test/api/chat.test.ts.
function mockTurnstile(success: boolean) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
    new Response(JSON.stringify({ success }), { headers: { 'content-type': 'application/json' } }),
  )
}

// `exports.default` is a pre-bound loopback stub: fetch(input, init?) only —
// no env/ctx arguments, and no execution context to await.
async function postContact(body: unknown) {
  return await exports.default.fetch('https://api.test/api/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.1' },
    body: JSON.stringify(body),
  })
}

async function seedConversation(): Promise<string> {
  const id = newId('conv')
  await createConversation(env.DB, id, Date.now())
  return id
}

const valid = {
  name: 'Jane Doe', email: 'jane@acme.com',
  company: 'Acme', consent: true, turnstileToken: 'tok',
}

beforeEach(() => vi.restoreAllMocks())

describe('POST /api/contact', () => {
  it('stores a lead and links it to the conversation', async () => {
    mockTurnstile(true)
    const conversationId = await seedConversation()

    const res = await postContact({ ...valid, conversationId })
    expect(res.status).toBe(200)

    const { leadId } = await res.json<{ leadId: string }>()
    const lead = await env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(leadId)
      .first<{ name: string; email: string; ip_hash: string; consent_marketing: number }>()

    expect(lead!.name).toBe('Jane Doe')
    expect(lead!.consent_marketing).toBe(1)

    const conv = await env.DB.prepare('SELECT lead_id FROM conversations WHERE id = ?')
      .bind(conversationId).first<{ lead_id: string }>()
    expect(conv!.lead_id).toBe(leadId)
  })

  it('stores a salted hash, never the raw ip', async () => {
    mockTurnstile(true)
    const conversationId = await seedConversation()
    const res = await postContact({ ...valid, conversationId })
    const { leadId } = await res.json<{ leadId: string }>()

    const lead = await env.DB.prepare('SELECT ip_hash FROM leads WHERE id = ?').bind(leadId)
      .first<{ ip_hash: string }>()
    expect(lead!.ip_hash).not.toContain('203.0.113.1')
    expect(lead!.ip_hash).toHaveLength(64)
  })

  it('rejects a failed turnstile challenge', async () => {
    mockTurnstile(false)
    const conversationId = await seedConversation()
    const res = await postContact({ ...valid, conversationId })
    expect(res.status).toBe(403)
  })

  it('rejects a malformed email', async () => {
    mockTurnstile(true)
    const conversationId = await seedConversation()
    const res = await postContact({ ...valid, email: 'not-an-email', conversationId })
    expect(res.status).toBe(400)
  })

  it('accepts a lead with no name', async () => {
    mockTurnstile(true)
    const conversationId = await seedConversation()
    const { name: _name, ...withoutName } = valid
    const res = await postContact({ ...withoutName, conversationId })
    expect(res.status).toBe(200)

    const { leadId } = await res.json<{ leadId: string }>()
    const lead = await env.DB.prepare('SELECT name FROM leads WHERE id = ?').bind(leadId)
      .first<{ name: string | null }>()
    expect(lead!.name).toBeNull()
  })

  it('rejects withheld consent', async () => {
    mockTurnstile(true)
    const conversationId = await seedConversation()
    const res = await postContact({ ...valid, consent: false, conversationId })
    expect(res.status).toBe(400)
  })

  it('rejects an unknown conversation', async () => {
    mockTurnstile(true)
    const res = await postContact({ ...valid, conversationId: 'conv_nope' })
    expect(res.status).toBe(404)
  })

  it('advances the session past CONTACT', async () => {
    mockTurnstile(true)
    const conversationId = await seedConversation()
    await env.SESSIONS.put(sessionKey(conversationId), JSON.stringify({
      state: 'CONTACT', slots: {}, turnsInState: 0, totalTurns: 10, forcedAdvances: [],
    }))

    const res = await postContact({ ...valid, conversationId })
    const json = await res.json<{ state: string }>()
    expect(json.state).toBe('GENERATE')
  })
})
