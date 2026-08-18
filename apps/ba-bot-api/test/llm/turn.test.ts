import { describe, it, expect } from 'vitest'
import { runTurn } from '../../src/llm/turn'
import type { LlmClient, ChatResponse } from '../../src/llm/types'

function stubClient(responses: Partial<ChatResponse>[]): LlmClient & { calls: number } {
  let i = 0
  const c = {
    calls: 0,
    async chat(): Promise<ChatResponse> {
      c.calls += 1
      const r = responses[Math.min(i++, responses.length - 1)]!
      return {
        content: r.content ?? '', finishReason: r.finishReason ?? 'stop',
        promptTokens: r.promptTokens ?? 10, completionTokens: r.completionTokens ?? 5,
      }
    },
  }
  return c
}

const good = JSON.stringify({
  reply: 'Tell me who it is for.', slots: { project_name: 'Acme' },
  ready_to_advance: false, off_topic: false,
})

const args = {
  model: 'test-model', state: 'PROJECT_IDENTITY' as const,
  history: [], userMessage: 'We are building Acme.',
}

describe('runTurn', () => {
  it('returns a validated object on a well-formed response', async () => {
    const client = stubClient([{ content: good }])
    const r = await runTurn(client, args)

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.slots).toEqual({ project_name: 'Acme' })
    expect(r.value.off_topic).toBe(false)
    expect(client.calls).toBe(1)
  })

  it('retries exactly once on malformed JSON, then succeeds', async () => {
    const client = stubClient([{ content: 'not json at all' }, { content: good }])
    const r = await runTurn(client, args)

    expect(r.ok).toBe(true)
    expect(client.calls).toBe(2)
  })

  it('never retries more than once', async () => {
    const client = stubClient([{ content: 'nope' }, { content: 'still nope' }])
    const r = await runTurn(client, args)

    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('parse')
    expect(client.calls).toBe(2)
  })

  it('rejects unknown keys (strict schema)', async () => {
    const bad = JSON.stringify({
      reply: 'hi', slots: {}, ready_to_advance: false, off_topic: false, injected: 'x',
    })
    const client = stubClient([{ content: bad }, { content: bad }])
    const r = await runTurn(client, args)

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('parse')
  })

  it('reports empty content without retrying', async () => {
    const client = stubClient([{ content: '' }])
    const r = await runTurn(client, args)

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('empty')
    expect(client.calls).toBe(1)
  })

  it('reports truncation without retrying', async () => {
    const client = stubClient([{ content: '{"reply":"a', finishReason: 'length' }])
    const r = await runTurn(client, args)

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('truncated')
    expect(client.calls).toBe(1)
  })

  it('reports provider failure when the client throws', async () => {
    const client: LlmClient = { async chat() { throw new Error('502') } }
    const r = await runTurn(client, args)

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('provider')
  })

  it('defaults missing slots to an empty object', async () => {
    const noSlots = JSON.stringify({ reply: 'hi', ready_to_advance: false, off_topic: false })
    const client = stubClient([{ content: noSlots }])
    const r = await runTurn(client, args)

    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.slots).toEqual({})
  })
})
