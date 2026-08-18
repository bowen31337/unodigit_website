import { EstimateShapeSchema, type EstimateShape } from '@unodigit/ba-bot-contract'
import type { ChatMessage, LlmClient } from '../llm/types'
import { ESTIMATOR_SYSTEM_PROMPT, PROGRAM_MODE_ADDENDUM } from './prompt'

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
  if (shape.mode === 'single') {
    const sum = shape.categories.reduce((n, c) => n + c.bullets, 0)
    return sum === shape.total_tasks
  }

  // Each subsystem must also agree with ITSELF, not just contribute to a
  // correct umbrella total. Checking only the umbrella lets one subsystem
  // overstate its categories while another understates them, netting out to a
  // valid grand total — and the renderer prints per-subsystem totals as
  // delivery phases, so an internally inconsistent subsystem becomes a phase
  // whose task count contradicts its own breakdown.
  for (const s of shape.subsystems) {
    if (s.categories.reduce((n, c) => n + c.bullets, 0) !== s.total_tasks) return false
  }

  const sum = shape.subsystems.reduce((n, s) => n + s.total_tasks, 0)
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

async function askOnce(
  client: LlmClient,
  model: string,
  initialMessages: ChatMessage[],
): Promise<EstimateResult> {
  const messages: ChatMessage[] = [...initialMessages]

  for (let attempt = 0; attempt < 2; attempt++) {
    let res
    try {
      res = await client.chat({ model, messages, jsonMode: true, maxTokens: 1600 })
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

export async function runEstimate(
  client: LlmClient,
  args: { model: string; briefText: string; programThreshold: number },
): Promise<EstimateResult> {
  const first = await askOnce(client, args.model, [
    { role: 'system', content: ESTIMATOR_SYSTEM_PROMPT },
    { role: 'user', content: args.briefText },
  ])

  if (!first.ok) return first
  if (first.shape.total_tasks <= args.programThreshold) return first

  // Over the threshold: one claw-forge spec targets 100-300 bullets, so ask for
  // a subsystem split. This is also the better commercial artifact — a phased
  // first-subsystem price converts where one large total does not.
  const second = await askOnce(client, args.model, [
    { role: 'system', content: ESTIMATOR_SYSTEM_PROMPT },
    { role: 'system', content: PROGRAM_MODE_ADDENDUM },
    { role: 'user', content: args.briefText },
  ])

  // A valid oversized estimate beats no estimate. Fall back rather than fail.
  if (!second.ok) return first

  return {
    ok: true,
    shape: second.shape,
    promptTokens: first.promptTokens + second.promptTokens,
    completionTokens: first.completionTokens + second.completionTokens,
  }
}
