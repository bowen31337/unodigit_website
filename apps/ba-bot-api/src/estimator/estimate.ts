import { EstimateShapeSchema, type EstimateShape } from '@unodigit/ba-bot-contract'
import type { ChatMessage, LlmClient } from '../llm/types'
import { ESTIMATOR_SYSTEM_PROMPT, PROGRAM_MODE_ADDENDUM } from './prompt'

export type EstimateResult =
  | {
      ok: true
      shape: EstimateShape
      promptTokens: number
      completionTokens: number
      cachedTokens: number
      model: string
    }
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

/**
 * The ceiling must cover REASONING tokens.
 *
 * `LLM_MODEL_HEAVY` is deepseek-v4-pro, a reasoning model, and reasoning is
 * counted against max_tokens. The old 1600 truncated EVERY estimate — measured
 * 5 of 5 against the real prompt, each stopping at exactly 1600 with
 * `finish_reason: "length"`. Because `truncated` used to return immediately,
 * that meant no quote row, no signed link, and the visitor always getting the
 * "we will follow up by email" headline. The whole quote feature was dead.
 *
 * Visible output is only ~300 tokens; the rest is reasoning. The two passes
 * need genuinely different ceilings, both measured against the real prompts at
 * 5 runs each — program mode emits a category breakdown PER SUBSYSTEM, so it
 * needs roughly triple:
 *
 *   pass      ceiling   completion tokens observed   result
 *   single      8000     2429-4618                   5/5 ok
 *   program     8000     7358-8000+                  4/5 TRUNCATED
 *   program    16000     6083-11481                  5/5 ok
 *   program    24000     6701-11647                  5/5 ok (no better)
 *
 * So 24000 buys nothing over 16000; each ceiling sits ~1.4-1.7x above its own
 * observed worst case. A ceiling costs nothing on a run that finishes early.
 *
 * Do NOT "save tokens" by disabling reasoning here. It is cheaper (283-348
 * tokens) and it does work on the first pass, but the repair path below adds
 * an assistant turn to the context, and `thinking: disabled` against a context
 * containing assistant turns makes the model answer with whitespace — see
 * llm/history for the measurements.
 */
const MAX_TOKENS_SINGLE = 8000

/** Program mode breaks the project into 2-6 subsystems and gives each its own
 *  category breakdown, so both the reasoning and the JSON are far larger. At
 *  the single-pass ceiling this truncated 4 of 5 — and a truncated program pass
 *  is not loud: runEstimate falls back to the oversized single estimate, so the
 *  visitor still gets a quote and the better phased artifact silently never
 *  appears. */
const MAX_TOKENS_PROGRAM = 16_000

/** Attempts per pass. Reasoning length varies run to run for identical input,
 *  so a pass that overruns or comes back blank can succeed on the next try.
 *  This used to be 2 with truncation and blanks both returning immediately. */
const MAX_ATTEMPTS = 3

/**
 * Sampling temperature for sizing.
 *
 * Measured on one brief, 9 runs per arm, counting total_tasks:
 *
 *   provider default   mean 110   sd 21.4   cv 19%   range 87-148
 *   temperature 0.2    mean 118   sd 14.7   cv 12%   range 86-142
 *   temperature 0.4    mean 126   sd 12.6   cv 10%   range 104-142
 *
 * 0.2 rather than 0: temperature 0 measured WORSE than the default (spread 50%
 * of mean over 6 runs), which is the opposite of the intuition. A reasoning
 * model at 0 appears to lock onto a single reasoning path that is not
 * necessarily a central one.
 */
const TEMPERATURE = 0.2

/**
 * Independent estimates to draw before pricing.
 *
 * Temperature alone leaves ±12%, so the same brief could still price at 86 or
 * 142 tasks — a client who regenerates gets a different number for the same
 * project, which is indefensible on a document titled "Indicative Quote".
 * Drawing three and taking the median discards the outlier that any single
 * draw might have been.
 *
 * Run concurrently, so this costs tokens rather than latency. The median SHAPE
 * is kept whole rather than averaging the three: `totalsAgree` requires the
 * category counts to sum to total_tasks, and an averaged breakdown would not.
 */
export const ESTIMATE_SAMPLES = 3

async function askOnce(
  client: LlmClient,
  model: string,
  initialMessages: ChatMessage[],
  maxTokens: number,
): Promise<EstimateResult> {
  const messages: ChatMessage[] = [...initialMessages]

  let lastReason: Exclude<EstimateResult, { ok: true }>['reason'] = 'parse'
  let repaired = false

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let res
    try {
      res = await client.chat({
        model,
        messages,
        jsonMode: true,
        maxTokens,
        temperature: TEMPERATURE,
        // Explicit rather than inherited. This is the one genuinely analytical
        // call in the app -- it decomposes a project and must produce category
        // counts that sum exactly to total_tasks, which `totalsAgree` enforces.
        reasoning: true,
      })
    } catch {
      lastReason = 'provider'
      continue
    }

    // Retry, do NOT repair: the output was cut off or absent, not malformed,
    // and appending instructions only makes the next completion longer.
    if (res.finishReason === 'length') {
      lastReason = 'truncated'
      continue
    }
    if (res.content.trim() === '') {
      lastReason = 'empty'
      continue
    }

    const shape = parse(res.content)
    if (shape) {
      return {
        ok: true,
        shape,
        promptTokens: res.promptTokens,
        completionTokens: res.completionTokens,
        cachedTokens: res.cachedTokens,
        model: res.model,
      }
    }

    // Malformed, or the totals disagreed -- the one case re-prompting can fix.
    // Appended at most once; a second copy just crowds the context that
    // produced the mistake.
    lastReason = 'parse'
    if (!repaired) {
      repaired = true
      messages.push({ role: 'assistant', content: res.content })
      messages.push({ role: 'user', content: REPAIR })
    }
  }

  return { ok: false, reason: lastReason }
}

export async function runEstimate(
  client: LlmClient,
  args: {
    model: string
    briefText: string
    programThreshold: number
    /** Independent draws to take before choosing the median. Injectable so a
     *  unit test can exercise the retry and ceiling logic with a single draw
     *  and a deterministic stub, rather than three concurrent ones racing for
     *  the same scripted responses. */
    samples?: number
  },
): Promise<EstimateResult> {
  const samples = Math.max(1, args.samples ?? ESTIMATE_SAMPLES)
  const messages: ChatMessage[] = [
    { role: 'system', content: ESTIMATOR_SYSTEM_PROMPT },
    { role: 'user', content: args.briefText },
  ]

  // Concurrent, so three samples cost tokens rather than wall clock.
  const draws = await Promise.all(
    Array.from({ length: samples }, () =>
      askOnce(client, args.model, messages, MAX_TOKENS_SINGLE)),
  )

  const ok = draws.filter((d): d is Extract<EstimateResult, { ok: true }> => d.ok)
  // Every draw failed for the same reason; report the first so the caller sees
  // a real cause rather than a synthesised one.
  if (ok.length === 0) return draws[0] ?? { ok: false, reason: 'provider' }

  // Median by total_tasks, keeping that draw's shape intact.
  const sorted = [...ok].sort((a, b) => a.shape.total_tasks - b.shape.total_tasks)
  const median = sorted[Math.floor(sorted.length / 2)]!

  // Tokens from every draw, not just the chosen one — all of them were paid for.
  const first: Extract<EstimateResult, { ok: true }> = {
    ...median,
    promptTokens: ok.reduce((n, d) => n + d.promptTokens, 0),
    completionTokens: ok.reduce((n, d) => n + d.completionTokens, 0),
    cachedTokens: ok.reduce((n, d) => n + d.cachedTokens, 0),
  }
  if (first.shape.total_tasks <= args.programThreshold) return first

  // Over the threshold: one claw-forge spec targets 100-300 bullets, so ask for
  // a subsystem split. This is also the better commercial artifact — a phased
  // first-subsystem price converts where one large total does not.
  const second = await askOnce(client, args.model, [
    { role: 'system', content: ESTIMATOR_SYSTEM_PROMPT },
    { role: 'system', content: PROGRAM_MODE_ADDENDUM },
    { role: 'user', content: args.briefText },
  ], MAX_TOKENS_PROGRAM)

  // A valid oversized estimate beats no estimate. Fall back rather than fail.
  if (!second.ok) return first

  return {
    ok: true,
    shape: second.shape,
    promptTokens: first.promptTokens + second.promptTokens,
    completionTokens: first.completionTokens + second.completionTokens,
    cachedTokens: first.cachedTokens + second.cachedTokens,
    model: second.model,
  }
}
