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

export async function runTurn(
  client: LlmClient,
  args: { model: string; state: StateId; history: ChatMessage[]; userMessage: string },
): Promise<TurnResult> {
  // Frozen prefix first, volatile content last — this ordering is what makes
  // the provider's prefix cache hit.
  const messages: ChatMessage[] = [
    { role: 'system', content: BASE_SYSTEM_PROMPT },
    { role: 'system', content: ADDENDA[args.state] },
    ...args.history,
    { role: 'user', content: args.userMessage },
  ]

  for (let attempt = 0; attempt < 2; attempt++) {
    let res
    try {
      res = await client.chat({ model: args.model, messages, jsonMode: true, maxTokens: 900 })
    } catch {
      return { ok: false, reason: 'provider' }
    }

    // Documented DeepSeek behaviours — neither is worth a repair attempt,
    // because a repair prompt cannot fix an empty or truncated generation.
    if (res.finishReason === 'length') return { ok: false, reason: 'truncated' }
    if (res.content.trim() === '') return { ok: false, reason: 'empty' }

    const parsed = parse(res.content)
    if (parsed) {
      return {
        ok: true,
        value: parsed,
        promptTokens: res.promptTokens,
        completionTokens: res.completionTokens,
      }
    }

    if (attempt === 0) {
      messages.push({ role: 'assistant', content: res.content })
      messages.push({ role: 'user', content: REPAIR_INSTRUCTION })
    }
  }

  return { ok: false, reason: 'parse' }
}
