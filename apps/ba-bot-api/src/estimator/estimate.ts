import { EstimateShapeSchema, type EstimateShape } from '@unodigit/ba-bot-contract'
import type { ChatMessage, LlmClient } from '../llm/types'
import { ESTIMATOR_SYSTEM_PROMPT } from './prompt'

export type EstimateResult =
  | { ok: true; shape: EstimateShape; promptTokens: number; completionTokens: number }
  | { ok: false; reason: 'parse' | 'empty' | 'truncated' | 'provider' }

const REPAIR =
  'Your previous message was not valid against the required json object. ' +
  'Reply again with a single json object matching the schema exactly, with no ' +
  'extra keys and no markdown fences.'

/** The model is asked for both a per-category breakdown and a total; a shape
 *  where they disagree is not a shape we can price, so treat it as unparseable
 *  rather than silently trusting either number. */
function totalsAgree(shape: EstimateShape): boolean {
  const sum =
    shape.mode === 'single'
      ? shape.categories.reduce((n, c) => n + c.bullets, 0)
      : shape.subsystems.reduce((n, s) => n + s.categories.reduce((m, c) => m + c.bullets, 0), 0)
  return sum === shape.total_tasks
}

function parse(content: string): EstimateShape | null {
  try {
    const result = EstimateShapeSchema.safeParse(JSON.parse(content))
    if (!result.success) return null
    return totalsAgree(result.data) ? result.data : null
  } catch {
    return null
  }
}

export async function runEstimate(
  client: LlmClient,
  args: { model: string; briefText: string; programThreshold: number },
): Promise<EstimateResult> {
  const messages: ChatMessage[] = [
    { role: 'system', content: ESTIMATOR_SYSTEM_PROMPT },
    { role: 'user', content: args.briefText },
  ]

  for (let attempt = 0; attempt < 2; attempt++) {
    let res
    try {
      res = await client.chat({ model: args.model, messages, jsonMode: true, maxTokens: 1600 })
    } catch {
      return { ok: false, reason: 'provider' }
    }

    // Neither is repairable by re-prompting: a truncated or empty generation is
    // a capacity problem, not a formatting one. Retrying doubles the cost of a
    // known failure.
    if (res.finishReason === 'length') return { ok: false, reason: 'truncated' }
    if (res.content.trim() === '') return { ok: false, reason: 'empty' }

    const shape = parse(res.content)
    if (shape) {
      return {
        ok: true,
        shape,
        promptTokens: res.promptTokens,
        completionTokens: res.completionTokens,
      }
    }

    if (attempt === 0) {
      messages.push({ role: 'assistant', content: res.content })
      messages.push({ role: 'user', content: REPAIR })
    }
  }

  return { ok: false, reason: 'parse' }
}
