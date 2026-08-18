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
