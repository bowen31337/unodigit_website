import { describe, it, expect } from 'vitest'
import { runEstimate } from '../../src/estimator/estimate'
import { ESTIMATOR_SYSTEM_PROMPT, PROGRAM_MODE_ADDENDUM } from '../../src/estimator/prompt'
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

  /**
   * DeepSeek's prefix cache is a BYTE match on the leading messages and is
   * ~98% cheaper on a hit, so the frozen ESTIMATOR_SYSTEM_PROMPT must stay
   * FIRST in the program pass too — sharing the prefix the first pass already
   * warmed. Sending [PROGRAM_MODE_ADDENDUM, ESTIMATOR_SYSTEM_PROMPT, user]
   * instead misses the cache on every program-mode call while producing
   * identical output: the suite stays green and only the bill changes. Order
   * is therefore pinned explicitly, not just membership.
   */
  it('keeps the frozen prompt first in the program pass, ahead of the addendum', async () => {
    const sent: Array<Array<{ role: string; content: string }>> = []
    const client = {
      async chat(req: { messages: Array<{ role: string; content: string }> }): Promise<ChatResponse> {
        sent.push(req.messages)
        return {
          content: sent.length === 1 ? bigSingle : program,
          finishReason: 'stop',
          promptTokens: 500,
          completionTokens: 200,
        }
      },
    }
    const r = await runEstimate(client as unknown as LlmClient, args)

    // Guard against a vacuous pass: without a successful second pass there is
    // no program-pass message list to assert on at all.
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.shape.mode).toBe('program')
    expect(sent).toHaveLength(2)

    const second = sent[1]!
    expect(second[0]!.role).toBe('system')
    expect(second[0]!.content).toBe(ESTIMATOR_SYSTEM_PROMPT)
    expect(second[1]!.role).toBe('system')
    expect(second[1]!.content).toBe(PROGRAM_MODE_ADDENDUM)
    // The brief follows the frozen pair, so nothing per-request precedes them.
    expect(second[2]!.role).toBe('user')
    expect(second[2]!.content).toBe(args.briefText)
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

// US-004a: an oversized first pass must be representable so it can route to
// program mode, instead of failing schema validation and never reaching it.
describe('US-004a: oversized first pass reaches program mode', () => {
  it('an oversized (>400) but plausible first pass reaches program mode', async () => {
    // 600 > the old max(400) ceiling but well under the new max(2000). Categories
    // must sum to exactly 600 (totalsAgree is enforced).
    const oversizedSingle = JSON.stringify({
      mode: 'single',
      categories: [
        { name: 'Core functionality', bullets: 400, sample: 'User can do a thing (returns 200)' },
        { name: 'Integrations', bullets: 200, sample: 'System syncs with a third-party API' },
      ],
      total_tasks: 600,
      confidence: 'low',
      drivers: ['very large scope'],
    })

    // A plain index-based stub (like `stub()` above) can't test this without a
    // false-positive risk: if the second stub response is a *valid* program
    // shape, it would also get consumed — and successfully parsed — by the
    // repair retry that fires when the oversized first pass is rejected,
    // making the test pass "by accident" even without the contract fix (this
    // was verified empirically while writing this test). Instead, respond
    // based on which pass is actually being asked: every call in the first
    // pass gets the oversized single shape (so a pre-fix repair retry sees
    // the same rejected content twice and genuinely fails), and only a call
    // carrying PROGRAM_MODE_ADDENDUM gets the program-mode shape.
    const client = {
      calls: 0,
      async chat(req: { messages: Array<{ role: string; content: string }> }) {
        client.calls += 1
        const isProgramPass = req.messages.some((m) => m.content === PROGRAM_MODE_ADDENDUM)
        return {
          content: isProgramPass ? program : oversizedSingle,
          finishReason: 'stop' as const,
          promptTokens: 500,
          completionTokens: 200,
        }
      },
    }
    const r = await runEstimate(client as unknown as LlmClient, args)

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.shape.mode).toBe('program')
    expect(client.calls).toBe(2)
  })

  it('an absurd (5000) first pass is still rejected as unparseable', async () => {
    const absurdSingle = JSON.stringify({
      mode: 'single',
      categories: [{ name: 'Core functionality', bullets: 5000, sample: 'User can do a thing (returns 200)' }],
      total_tasks: 5000,
      confidence: 'low',
      drivers: ['absurd scope'],
    })
    const client = stub([{ content: absurdSingle }, { content: absurdSingle }])
    const r = await runEstimate(client, args)

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('parse')
  })

  it('a program-mode subsystem over 400 tasks is still rejected (per-subsystem bound unchanged)', async () => {
    // Deliberately reuse `bigSingle` (350) rather than something >400: it is
    // valid under both the old and new ceiling, so this test is isolated to
    // the subsystem cap alone and is unaffected by the US-004a ceiling change.
    const oversizedSubsystemProgram = JSON.stringify({
      mode: 'program',
      umbrella: 'Field Service Platform',
      subsystems: [
        { name: 'Identity', categories: [{ name: 'Authentication & User Management', bullets: 96, sample: 'User can register (returns 201)' }], total_tasks: 96, depends_on: [] },
        { name: 'Scheduling', categories: [{ name: 'Core functionality', bullets: 900, sample: 'System assigns a job (saves to jobs)' }], total_tasks: 900, depends_on: ['Identity'] },
      ],
      total_tasks: 996,
      confidence: 'low',
      drivers: ['multi-subsystem'],
    })
    const client = stub([
      { content: bigSingle },
      { content: oversizedSubsystemProgram },
      { content: oversizedSubsystemProgram },
    ])
    const r = await runEstimate(client, args)

    // The program pass is rejected (subsystem total_tasks 900 > max 400), so
    // runEstimate falls back to the valid oversized single result rather than
    // erroring — that fallback is existing US-004 behavior. What this test
    // pins is that the 900-task subsystem never becomes the returned shape.
    // client.calls === 3 (1 first-pass call + 2 second-pass attempts, the
    // repair retry) confirms the oversized-subsystem shape was genuinely
    // rejected by validation both times, not skipped.
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.shape.mode).toBe('single')
    expect(client.calls).toBe(3)
  })

  it('a subsystem whose categories contradict its own total is rejected', async () => {
    // The umbrella total is deliberately CORRECT here (96 + 900 = 996), and
    // every subsystem is under the max(400) schema bound. Only the second
    // subsystem's internal arithmetic is wrong: its categories sum to 900
    // while it declares 400. Summing categories across the whole program and
    // comparing to the umbrella would accept this; the per-subsystem check is
    // the only thing that catches it.
    const inconsistentSubsystem = JSON.stringify({
      mode: 'program',
      umbrella: 'Field Service Platform',
      subsystems: [
        { name: 'Identity', categories: [{ name: 'Authentication & User Management', bullets: 96, sample: 'User can register (returns 201)' }], total_tasks: 96, depends_on: [] },
        { name: 'Scheduling', categories: [{ name: 'Core functionality', bullets: 900, sample: 'System assigns a job (saves to jobs)' }], total_tasks: 400, depends_on: ['Identity'] },
      ],
      total_tasks: 996,
      confidence: 'low',
      drivers: ['multi-subsystem'],
    })
    const client = stub([
      { content: bigSingle },
      { content: inconsistentSubsystem },
      { content: inconsistentSubsystem },
    ])
    const r = await runEstimate(client, args)

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.shape.mode).toBe('single')
    expect(client.calls).toBe(3)
  })
})
