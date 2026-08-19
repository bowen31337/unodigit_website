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

  it('gives up as parse after every attempt, and repairs at most once', async () => {
    const seen: number[] = []
    const client: LlmClient = {
      async chat(req) {
        seen.push(req.messages.length)
        return { content: 'nope', finishReason: 'stop', promptTokens: 1, completionTokens: 1 }
      },
    }
    const r = await runTurn(client, args)

    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('parse')
    // One repair pair appended before attempt 2, and NOT appended again before
    // attempt 3 — a second copy just crowds the context that caused the error.
    const [a, b, c] = seen as [number, number, number]
    expect(seen).toHaveLength(3)
    expect(b).toBe(a + 2)
    expect(c).toBe(b)
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

  // These four encode the fix for the bug where the widget answered "Sorry —
  // something went wrong on my end" on ~21% of turns. deepseek-v4-flash
  // intermittently returns whitespace-only content with finish_reason "stop",
  // measured at 5 of 24 turns against the real prompts. The old code returned
  // on the first blank with no retry, so that provider glitch reached the
  // visitor one-for-one.

  it('RETRIES a blank completion instead of giving up on the first one', async () => {
    // Whitespace, not '' — the observed failure is literally seven spaces, and
    // a `content === ''` check would sail straight past it.
    const client = stubClient([{ content: '       ' }, { content: good }])
    const r = await runTurn(client, args)

    expect(r.ok).toBe(true)
    expect(client.calls).toBe(2)
  })

  it('does not send a repair prompt after a blank — there is nothing to repair', async () => {
    const seen: number[] = []
    let i = 0
    const client: LlmClient = {
      async chat(req) {
        seen.push(req.messages.length)
        i += 1
        return {
          content: i === 1 ? '   ' : good,
          finishReason: 'stop', promptTokens: 10, completionTokens: 5,
        }
      },
    }
    const r = await runTurn(client, args)

    expect(r.ok).toBe(true)
    // Same conversation both times. Appending a repair instruction to a blank
    // response teaches the model nothing and lengthens the next completion.
    expect(seen).toHaveLength(2)
    expect(seen[0]).toBe(seen[1])
  })

  it('gives up as empty only after exhausting every attempt', async () => {
    const client = stubClient([{ content: ' ' }])
    const r = await runTurn(client, args)

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('empty')
    expect(client.calls).toBe(3)
  })

  it('RETRIES truncation — reasoning length varies run to run for one input', async () => {
    const client = stubClient([{ content: '{"reply":"a', finishReason: 'length' }, { content: good }])
    const r = await runTurn(client, args)

    expect(r.ok).toBe(true)
    expect(client.calls).toBe(2)
  })

  it('reports truncation after exhausting every attempt', async () => {
    const client = stubClient([{ content: '{"reply":"a', finishReason: 'length' }])
    const r = await runTurn(client, args)

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('truncated')
    expect(client.calls).toBe(3)
  })

  // Reasoning defaults OFF. It was only ever mandatory to work around blank
  // completions, and that cause is fixed at source in llm/history — leaving it
  // on would cost ~5x latency for nothing.
  it('leaves reasoning off when the caller does not ask for it', async () => {
    let seen: boolean | undefined = true
    const client: LlmClient = {
      async chat(req) {
        seen = req.reasoning
        return { content: good, finishReason: 'stop', promptTokens: 1, completionTokens: 1 }
      },
    }
    await runTurn(client, args)
    expect(seen).toBe(false)
  })

  it('passes the caller\'s reasoning preference through to the client', async () => {
    let seen: boolean | undefined = undefined
    const client: LlmClient = {
      async chat(req) {
        seen = req.reasoning
        return { content: good, finishReason: 'stop', promptTokens: 1, completionTokens: 1 }
      },
    }
    await runTurn(client, { ...args, reasoning: false })
    expect(seen).toBe(false)
  })

  it('reports provider failure when the client throws every time', async () => {
    let calls = 0
    const client: LlmClient = { async chat() { calls += 1; throw new Error('502') } }
    const r = await runTurn(client, args)

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('provider')
    expect(calls).toBe(3)
  })

  it('recovers when the provider throws once and then answers', async () => {
    let calls = 0
    const client: LlmClient = {
      async chat() {
        calls += 1
        if (calls === 1) throw new Error('502')
        return { content: good, finishReason: 'stop', promptTokens: 1, completionTokens: 1 }
      },
    }
    const r = await runTurn(client, args)

    expect(r.ok).toBe(true)
  })

  it('defaults missing slots to an empty object', async () => {
    const noSlots = JSON.stringify({ reply: 'hi', ready_to_advance: false, off_topic: false })
    const client = stubClient([{ content: noSlots }])
    const r = await runTurn(client, args)

    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.slots).toEqual({})
  })
})
