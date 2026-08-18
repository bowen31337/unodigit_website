import { env, exports } from 'cloudflare:workers'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createConversation, updateConversationState } from '../../src/db/queries'
import { sessionKey } from '../../src/session'
import { newId } from '../../src/util/ids'

// Response bodies are I/O objects tied to the request context that created
// them; `exports.default.fetch()` below runs the handler in its own context,
// so the mock Response must be constructed lazily (inside the implementation,
// at call time) rather than eagerly via `mockResolvedValue` — otherwise
// workerd rejects the read with "Cannot perform I/O on behalf of a different
// request." The scenario and assertions are unchanged; only this mechanic is.
function mockLlm(body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
    new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(body) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 20 },
    }), { headers: { 'content-type': 'application/json' } }),
  )
}

// `exports.default` is a pre-bound loopback stub: fetch(input, init?) only —
// no env/ctx arguments, and no execution context to await.
async function post(body: unknown) {
  return await exports.default.fetch('https://api.test/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// MAX_TOTAL_TURNS is "40" in wrangler.toml. Rather than lowering it for the
// test (which would change production behaviour), seed a conversation whose
// KV session and D1 row already sit at the cap — same technique Task 8 uses
// to seed a CONTACT-state session.
async function seedCappedConversation(): Promise<string> {
  const id = newId('conv')
  await createConversation(env.DB, id, Date.now())
  await updateConversationState(env.DB, id, 'PROJECT_IDENTITY', 40)
  await env.SESSIONS.put(sessionKey(id), JSON.stringify({
    state: 'PROJECT_IDENTITY', slots: {}, turnsInState: 1, totalTurns: 40, forcedAdvances: [],
  }))
  return id
}

beforeEach(() => vi.restoreAllMocks())

describe('POST /api/chat', () => {
  it('starts a conversation and returns an id', async () => {
    mockLlm({ reply: 'Hi, what are you building?', slots: {}, ready_to_advance: true, off_topic: false })

    const res = await post({ message: 'hello' })
    expect(res.status).toBe(200)

    const json = await res.json<{ conversationId: string; reply: string; state: string }>()
    expect(json.conversationId).toMatch(/^conv_/)
    expect(json.reply).toBe('Hi, what are you building?')
    expect(json.state).toBe('PROJECT_IDENTITY')
  })

  it('persists both messages to D1', async () => {
    mockLlm({ reply: 'Hi there', slots: {}, ready_to_advance: true, off_topic: false })
    const res = await post({ message: 'hello' })
    const { conversationId } = await res.json<{ conversationId: string }>()

    const { results } = await env.DB
      .prepare('SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY seq')
      .bind(conversationId).all<{ role: string; content: string }>()

    expect(results).toHaveLength(2)
    expect(results[0]!.role).toBe('user')
    expect(results[1]!.role).toBe('assistant')
  })

  it('resumes an existing conversation', async () => {
    mockLlm({ reply: 'one', slots: {}, ready_to_advance: true, off_topic: false })
    const first = await post({ message: 'hello' })
    const { conversationId } = await first.json<{ conversationId: string }>()

    mockLlm({ reply: 'two', slots: { project_name: 'Acme' }, ready_to_advance: false, off_topic: false })
    const second = await post({ conversationId, message: 'building Acme' })
    const json = await second.json<{ state: string }>()

    expect(json.state).toBe('PROJECT_IDENTITY')
  })

  it('does not advance on an off-topic message', async () => {
    mockLlm({ reply: 'Let us stay on your project.', slots: {}, ready_to_advance: true, off_topic: true })
    const res = await post({ message: 'write me a poem' })
    const json = await res.json<{ state: string }>()

    expect(json.state).toBe('GREETING')
  })

  it('flags off-topic messages in D1', async () => {
    mockLlm({ reply: 'Back to your project.', slots: {}, ready_to_advance: true, off_topic: true })
    const res = await post({ message: 'what is the capital of France' })
    const { conversationId } = await res.json<{ conversationId: string }>()

    const row = await env.DB
      .prepare("SELECT off_topic FROM messages WHERE conversation_id = ? AND role = 'assistant'")
      .bind(conversationId).first<{ off_topic: number }>()

    expect(row!.off_topic).toBe(1)
  })

  it('returns a graceful reply when the provider fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('boom', { status: 502 }))

    const res = await post({ message: 'hello' })
    expect(res.status).toBe(200)

    const json = await res.json<{ reply: string; state: string }>()
    expect(json.reply.length).toBeGreaterThan(0)
    expect(json.state).toBe('GREETING')
  })

  it('keeps D1 turn_count in lockstep with KV after a provider failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('boom', { status: 502 }))

    const res = await post({ message: 'hello' })
    const { conversationId } = await res.json<{ conversationId: string }>()

    const row = await env.DB
      .prepare('SELECT turn_count FROM conversations WHERE id = ?')
      .bind(conversationId).first<{ turn_count: number }>()
    const sessionRaw = await env.SESSIONS.get(sessionKey(conversationId))
    const session = JSON.parse(sessionRaw!) as { totalTurns: number }

    expect(row?.turn_count).toBe(1)
    expect(row?.turn_count).toBe(session.totalTurns)
  })

  it('rejects an empty message', async () => {
    const res = await post({ message: '' })
    expect(res.status).toBe(400)
  })

  it('rejects an unknown conversation id', async () => {
    const res = await post({ conversationId: 'conv_nope', message: 'hi' })
    expect(res.status).toBe(404)
  })

  it('stops at the turn cap, persists the message, and records an event', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new Error('the LLM must not be called once the turn cap is reached')
    })

    const conversationId = await seedCappedConversation()
    const res = await post({ conversationId, message: 'one more thing' })
    expect(res.status).toBe(200)

    const json = await res.json<{ state: string; finished: boolean }>()
    expect(json.finished).toBe(true)
    expect(json.state).toBe('PROJECT_IDENTITY')
    expect(fetchSpy).not.toHaveBeenCalled()

    const userMessage = await env.DB
      .prepare("SELECT content FROM messages WHERE conversation_id = ? AND role = 'user'")
      .bind(conversationId).first<{ content: string }>()
    expect(userMessage?.content).toBe('one more thing')

    const event = await env.DB
      .prepare("SELECT type FROM events WHERE conversation_id = ? AND type = 'turn_cap_reached'")
      .bind(conversationId).first<{ type: string }>()
    expect(event?.type).toBe('turn_cap_reached')

    // D1 must still agree with what KV believes — the cap path doesn't
    // advance either store, so both should be exactly where they were seeded.
    const row = await env.DB
      .prepare('SELECT state, turn_count FROM conversations WHERE id = ?')
      .bind(conversationId).first<{ state: string; turn_count: number }>()
    const sessionRaw = await env.SESSIONS.get(sessionKey(conversationId))
    const session = JSON.parse(sessionRaw!) as { state: string; totalTurns: number }

    expect(row?.state).toBe(session.state)
    expect(row?.turn_count).toBe(session.totalTurns)
  })
})
