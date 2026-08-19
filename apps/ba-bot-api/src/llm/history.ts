import type { MessageRow } from '../db/queries'
import type { ChatMessage } from './types'

function parseSlots(json: string | null): Record<string, unknown> {
  if (!json) return {}
  try {
    const parsed: unknown = JSON.parse(json)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/**
 * Rebuild the prompt transcript from stored message rows.
 *
 * Assistant turns are replayed as the JSON envelope the model was required to
 * emit — NOT as the bare `reply` string. That distinction is the entire point
 * of this function, and getting it wrong was a production bug.
 *
 * The `messages` table stores `reply` because that is what the widget and the
 * admin dashboard render. Feeding it straight back put the model in a
 * contradiction: `response_format: json_object` requires the next token to
 * open an object, while every one of its own prior turns in the context was
 * bare prose. With reasoning off there is no step in which to resolve that, and
 * decoding stalls — the model emits the only tokens legal under both the
 * grammar and "not JSON yet", which is whitespace, then stops. The result is
 * whitespace-only content with `finish_reason: "stop"` a long way under the
 * token ceiling.
 *
 * Measured on PROJECT_IDENTITY with reasoning off, and dose-dependent in the
 * number of PROSE assistant turns in the array — which is what identifies the
 * cause as in-context precedent rather than a provider glitch:
 *
 *   assistant turns   replayed as   blank
 *   0 (user only)     —             0/8
 *   0 (flattened)     —             0/6
 *   1                 prose         3/8
 *   2                 prose         13/16
 *   2                 ENVELOPE      0/10   <-- this function
 *
 * Reasoning used to mask the conflict rather than fix it, which is why
 * `runTurn` can now default it off. See llm/turn.
 */
export function replayHistory(rows: MessageRow[]): ChatMessage[] {
  return rows.map((row): ChatMessage => {
    if (row.role !== 'assistant') {
      return { role: 'user', content: row.content }
    }

    // Key order matches the order the system prompt names them in. The model
    // is being shown its own house style, so it should be the house style.
    return {
      role: 'assistant',
      content: JSON.stringify({
        reply: row.content,
        slots: parseSlots(row.slots_json),
        // `=== 1`, not a truthy test: the column arrives in migration 0004 and
        // is simply absent from rows read before it, so this reads an old row
        // as false rather than throwing.
        ready_to_advance: row.ready_to_advance === 1,
        off_topic: row.off_topic === 1,
      }),
    }
  })
}
