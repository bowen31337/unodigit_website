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

/** Over `args.programThreshold` (300), so runEstimate routes to the program pass. */
const oversizedSingle = JSON.stringify({
  mode: 'single',
  categories: [
    { name: 'Core functionality', bullets: 400, sample: 'System assigns a job (saves to jobs)' },
  ],
  total_tasks: 400,
  confidence: 'low',
  drivers: ['large scope'],
})

const validProgram = JSON.stringify({
  mode: 'program',
  umbrella: 'Field Service Platform',
  subsystems: [
    { name: 'Identity', categories: [{ name: 'Authentication & User Management', bullets: 90, sample: 'User can register (returns 201)' }], total_tasks: 90, depends_on: [] },
    { name: 'Scheduling', categories: [{ name: 'Core functionality', bullets: 150, sample: 'System assigns a job (saves to jobs)' }], total_tasks: 150, depends_on: ['Identity'] },
  ],
  total_tasks: 240,
  confidence: 'medium',
  drivers: ['multi-subsystem'],
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

  it('gives up after three attempts on malformed output', async () => {
    const client = stub([{ content: 'nope' }, { content: 'still nope' }])
    const r = await runEstimate(client, args)

    expect(r.ok).toBe(false)
    expect(client.calls).toBe(3)
  })

  // The bug that killed the whole quote feature: deepseek-v4-pro counts
  // reasoning against max_tokens, the old 1600 ceiling truncated 5 of 5 real
  // estimates, and `truncated` returned immediately. No quote row was ever
  // written, so no signed link ever reached the visitor.
  it('retries a truncated pass instead of giving up', async () => {
    const client = stub([{ content: '{"mode":"sing', finishReason: 'length' }])
    const r = await runEstimate(client, args)

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('truncated')
    expect(client.calls).toBe(3)
  })

  it('recovers when a pass truncates once and then fits', async () => {
    const client = stub([
      { content: '{"mode":"sing', finishReason: 'length' },
      { content: validSingle },
    ])
    const r = await runEstimate(client, args)

    expect(r.ok).toBe(true)
  })

  it('recovers when a pass comes back blank and then answers', async () => {
    const client = stub([{ content: '   ' }, { content: validSingle }])
    const r = await runEstimate(client, args)

    expect(r.ok).toBe(true)
  })

  // Both halves of the truncation bug, pinned. A future edit that lowers the
  // ceiling or disables reasoning reintroduces it silently otherwise.
  it('asks for a ceiling that covers reasoning tokens, with reasoning on', async () => {
    const seen: number[] = []
    let seenReasoning: boolean | undefined
    const client: LlmClient = {
      async chat(req) {
        seen.push(req.maxTokens ?? 0)
        seenReasoning = req.reasoning
        return { content: validSingle, finishReason: 'stop', promptTokens: 1, completionTokens: 1 }
      },
    }
    await runEstimate(client, args)

    // Five successful single-mode runs measured 2429-4618 completion tokens.
    expect(seen[0]).toBeGreaterThanOrEqual(8000)
    expect(seenReasoning).not.toBe(false)
  })

  // Program mode emits a category breakdown per subsystem. At the single-pass
  // ceiling it truncated 4 of 5, and the failure is quiet: runEstimate falls
  // back to the single estimate, so the phased artifact just never appears.
  it('gives the program pass a larger ceiling than the single pass', async () => {
    const seen: number[] = []
    const client: LlmClient = {
      async chat(req) {
        seen.push(req.maxTokens ?? 0)
        // First pass must exceed programThreshold to reach the program pass.
        return {
          content: seen.length === 1 ? oversizedSingle : validProgram,
          finishReason: 'stop', promptTokens: 1, completionTokens: 1,
        }
      },
    }
    const r = await runEstimate(client, args)

    expect(r.ok).toBe(true)
    expect(seen).toHaveLength(2)
    expect(seen[1]).toBeGreaterThan(seen[0]!)
    expect(seen[1]).toBeGreaterThanOrEqual(16_000)
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
