import { env, exports } from 'cloudflare:workers'
import { describe, it, expect, vi, beforeEach } from 'vitest'

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

  it('rejects an empty message', async () => {
    const res = await post({ message: '' })
    expect(res.status).toBe(400)
  })

  it('rejects an unknown conversation id', async () => {
    const res = await post({ conversationId: 'conv_nope', message: 'hi' })
    expect(res.status).toBe(404)
  })
})
