import { z } from 'zod'
import type { ChatMessage, LlmClient } from './types'
import { ADDENDA, BASE_SYSTEM_PROMPT } from '../graph/prompts'
import type { StateId } from '../graph/states'

export const TurnOutputSchema = z
  .object({
    reply: z.string().min(1),
    slots: z.record(z.unknown()).default({}),
    ready_to_advance: z.boolean(),
    off_topic: z.boolean(),
  })
  .strict()

export type TurnOutput = z.infer<typeof TurnOutputSchema>

export type TurnResult =
  | { ok: true; value: TurnOutput; promptTokens: number; completionTokens: number }
  | { ok: false; reason: 'parse' | 'empty' | 'truncated' | 'provider' }

const REPAIR_INSTRUCTION =
  'Your previous message was not valid against the required json object. ' +
  'Reply again with a single json object containing exactly the keys reply, slots, ' +
  'ready_to_advance, off_topic — and no others. No markdown fences.'

function parse(content: string): TurnOutput | null {
  try {
    const result = TurnOutputSchema.safeParse(JSON.parse(content))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

/**
 * Attempts per turn.
 *
 * The blank-completion bug this was built for is fixed at source in
 * llm/history — the model no longer sees a prose/JSON contradiction — so these
 * retries are now defence in depth rather than the load-bearing mitigation.
 * Kept because a remote provider still drops requests and still occasionally
 * emits malformed JSON, and both are cheap to retry.
 */
const MAX_ATTEMPTS = 3

export async function runTurn(
  client: LlmClient,
  args: {
    model: string
    state: StateId
    history: ChatMessage[]
    userMessage: string
    /** Whether to let the model reason before answering. Defaults to OFF:
     *  these are elicitation turns, reasoning costs ~5x latency (~1.4s against
     *  ~6.9s measured), and the blank-completion failure that once made it
     *  mandatory was a prompt defect, now fixed in llm/history. */
    reasoning?: boolean
  },
): Promise<TurnResult> {
  // Frozen prefix first, volatile content last — this ordering is what makes
  // the provider's prefix cache hit.
  const messages: ChatMessage[] = [
    { role: 'system', content: BASE_SYSTEM_PROMPT },
    { role: 'system', content: ADDENDA[args.state] },
    ...args.history,
    { role: 'user', content: args.userMessage },
  ]

  let lastReason: Exclude<TurnResult, { ok: true }>['reason'] = 'parse'
  let repaired = false

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let res
    try {
      res = await client.chat({
        model: args.model,
        messages,
        jsonMode: true,
        // A ceiling, not a target: it must cover REASONING tokens, which are
        // the bulk of a completion here. Nine measured turns averaged 1233
        // completion tokens of which ~95% were reasoning, and GREETING alone
        // ranged 1306–2438. Raising it costs nothing on turns that finish
        // early, and 8000 keeps the long tail clear of the cliff.
        maxTokens: 8000,
        reasoning: args.reasoning ?? false,
      })
    } catch {
      // A transport failure is worth one more go — the provider is remote and
      // this is a single fetch — but not a repair prompt.
      lastReason = 'provider'
      continue
    }

    if (res.finishReason === 'length') {
      // Reasoning length varies enormously run to run for identical input, so
      // the same request that overran can fit on the next attempt. Do NOT
      // append a repair prompt: the output was cut off, not malformed, and
      // adding instructions only makes the next completion longer.
      lastReason = 'truncated'
      continue
    }

    if (res.content.trim() === '') {
      // Whitespace-only content with `finish_reason: "stop"`, far under the
      // token ceiling. This was the dominant failure until llm/history stopped
      // replaying assistant turns as prose; it should now be rare. Retry with
      // the messages UNCHANGED — a blank is not malformed, and appending a
      // repair prompt only lengthens the next completion.
      lastReason = 'empty'
      continue
    }

    const parsed = parse(res.content)
    if (parsed) {
      return {
        ok: true,
        value: parsed,
        promptTokens: res.promptTokens,
        completionTokens: res.completionTokens,
      }
    }

    // Malformed but non-empty: this is the one case a repair prompt can fix,
    // so show the model its own output and ask again. Appended at most once —
    // a second copy just crowds the context that produced the mistake.
    lastReason = 'parse'
    if (!repaired) {
      repaired = true
      messages.push({ role: 'assistant', content: res.content })
      messages.push({ role: 'user', content: REPAIR_INSTRUCTION })
    }
  }

  return { ok: false, reason: lastReason }
}
