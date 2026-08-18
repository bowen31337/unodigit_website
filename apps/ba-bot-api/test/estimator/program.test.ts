import { describe, it, expect } from 'vitest'
import { runEstimate } from '../../src/estimator/estimate'
import type { LlmClient, ChatResponse } from '../../src/llm/types'

function stub(responses: Array<Partial<ChatResponse>>) {
  let i = 0
  const c = {
    calls: 0,
    async chat(): Promise<ChatResponse> {
      c.calls += 1
      const r = responses[Math.min(i++, responses.length - 1)]!
      return {
        content: r.content ?? '',
        finishReason: r.finishReason ?? 'stop',
        promptTokens: 500,
        completionTokens: 200,
      }
    },
  }
  return c as unknown as LlmClient & { calls: number }
}

// NOTE: bullets/total_tasks deliberately kept <= 400 (not the plan's literal 540)
// because EstimateCategorySchema.bullets and single-mode total_tasks are both
// capped at max(400) in packages/ba-bot-contract/src/index.ts. A value of 540
// can never parse as a valid single-mode shape under any implementation, which
// made these fixtures structurally unsatisfiable (verified empirically) rather
// than merely "not yet implemented". 350 is still > programThreshold (300) so
// it still exercises the over-threshold path, while staying schema-valid.
const bigSingle = JSON.stringify({
  mode: 'single',
  categories: [{ name: 'Core functionality', bullets: 350, sample: 'User can do a thing (returns 200)' }],
  total_tasks: 350,
  confidence: 'low',
  drivers: ['very large scope'],
})

const smallSingle = JSON.stringify({
  mode: 'single',
  categories: [{ name: 'Core functionality', bullets: 80, sample: 'User can do a thing (returns 200)' }],
  total_tasks: 80,
  confidence: 'high',
  drivers: [],
})

const program = JSON.stringify({
  mode: 'program',
  umbrella: 'Field Service Platform',
  subsystems: [
    { name: 'Identity', categories: [{ name: 'Authentication & User Management', bullets: 96, sample: 'User can register (returns 201)' }], total_tasks: 96, depends_on: [] },
    { name: 'Scheduling', categories: [{ name: 'Core functionality', bullets: 184, sample: 'System assigns a job (saves to jobs)' }], total_tasks: 184, depends_on: ['Identity'] },
  ],
  total_tasks: 280,
  confidence: 'low',
  drivers: ['multi-subsystem'],
})

const args = { model: 'test-heavy', briefText: 'A huge platform.', programThreshold: 300 }

describe('runEstimate program mode', () => {
  it('re-asks in program mode when the first pass exceeds the threshold', async () => {
    const client = stub([{ content: bigSingle }, { content: program }])
    const r = await runEstimate(client, args)

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.shape.mode).toBe('program')
    expect(client.calls).toBe(2)
  })

  it('does not re-ask when the first pass is under the threshold', async () => {
    const client = stub([{ content: smallSingle }])
    const r = await runEstimate(client, args)

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.shape.mode).toBe('single')
    expect(client.calls).toBe(1)
  })

  it('keeps the oversized single result if the program pass fails', async () => {
    const client = stub([{ content: bigSingle }, { content: 'garbage' }, { content: 'garbage' }])
    const r = await runEstimate(client, args)

    // A large but valid estimate beats no estimate at all.
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.shape.mode).toBe('single')
    expect(r.shape.total_tasks).toBe(350)
  })

  it('sums token usage across both passes', async () => {
    const client = stub([{ content: bigSingle }, { content: program }])
    const r = await runEstimate(client, args)

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.promptTokens).toBe(1000)
    expect(r.completionTokens).toBe(400)
  })
})
