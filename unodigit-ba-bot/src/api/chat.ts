import type { Hono } from 'hono'
import { z } from 'zod'
import type { Env } from '../env'
import { createOpenAiCompatClient } from '../llm/openai-compat'
import type { ChatMessage, LlmClient } from '../llm/types'
import { runTurn } from '../llm/turn'
import { step } from '../graph/transitions'
import { STATES, type Slots, type StateId } from '../graph/states'
import {
  appendMessageAtNextSeq, createConversation, getConversation, listMessages,
  recordEvent,
} from '../db/queries'
import { newId } from '../util/ids'
import { loadSession, persistSession } from '../session'

const Body = z.object({
  conversationId: z.string().optional(),
  message: z.string().min(1).max(4000),
})

const FALLBACK_REPLY =
  'Sorry — something went wrong on my end. Could you say that once more?'

/** Slots come out of an LLM reading untrusted visitor text, so they are input,
 * not output. Each state declares a `.strict()` schema naming exactly the slots
 * that state may write; anything else — a hallucinated key, or one injected by
 * a visitor telling the model what to emit — is dropped wholesale rather than
 * merged into session state.
 *
 * This is what keeps `lead_id` unforgeable: no state's schema declares it, so
 * only `POST /api/contact` can ever put it in the session, and only a real lead
 * row can open the `CONTACT` exit gate. */
function validateSlots(state: StateId, raw: Slots): { slots: Slots; rejected: string[] } {
  const parsed = STATES[state].slotSchema.safeParse(raw)
  if (parsed.success) return { slots: parsed.data as Slots, rejected: [] }
  return { slots: {}, rejected: Object.keys(raw) }
}

export function registerChatRoutes(
  app: Hono<{ Bindings: Env }>,
  deps: { makeClient?: (env: Env) => LlmClient } = {},
): void {
  const makeClient =
    deps.makeClient ??
    ((env: Env) => createOpenAiCompatClient({ baseUrl: env.LLM_BASE_URL, apiKey: env.LLM_API_KEY }))

  app.post('/api/chat', async (c) => {
    const parsed = Body.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

    const { conversationId, message } = parsed.data
    const now = Date.now()

    let convId = conversationId
    if (convId) {
      if (!(await getConversation(c.env.DB, convId))) return c.json({ error: 'not_found' }, 404)
    } else {
      convId = newId('conv')
      await createConversation(c.env.DB, convId, now)
    }

    const session = await loadSession(c.env, convId)

    // Read the history before the new user message is appended: it is the
    // prompt context, and the visitor's own message is added separately by
    // runTurn. Sequence numbers are assigned by the INSERT, not from this
    // array's length, so a concurrent turn cannot collide with this one.
    const rawHistory = await listMessages(c.env.DB, convId)

    // Cap total turns so a hostile visitor cannot loop indefinitely. Still
    // persist the user's message and record an event: `abandoned_at_state`
    // analysis needs to see where a capped conversation stalled, so a
    // capped turn cannot vanish from the message/event log.
    if (session.totalTurns >= Number(c.env.MAX_TOTAL_TURNS)) {
      await appendMessageAtNextSeq(c.env.DB, {
        id: newId('msg'), conversationId: convId, role: 'user',
        content: message, slotsJson: null, offTopic: false, createdAt: now,
      })
      await recordEvent(c.env.DB, convId, 'turn_cap_reached', { state: session.state })

      return c.json({
        conversationId: convId,
        reply: 'We have covered a lot — let us pick this up on a call.',
        state: session.state,
        finished: true,
      })
    }

    const history: ChatMessage[] = rawHistory.map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content,
    }))

    // Persisted before the multi-second provider round trip, so a turn that
    // dies mid-flight still leaves the visitor's message in the transcript.
    await appendMessageAtNextSeq(c.env.DB, {
      id: newId('msg'), conversationId: convId, role: 'user',
      content: message, slotsJson: null, offTopic: false, createdAt: now,
    })

    const turn = await runTurn(makeClient(c.env), {
      model: c.env.LLM_MODEL,
      state: session.state,
      history,
      userMessage: message,
    })

    if (!turn.ok) {
      await recordEvent(c.env.DB, convId, 'llm_failed', { reason: turn.reason, state: session.state })
      await appendMessageAtNextSeq(c.env.DB, {
        id: newId('msg'), conversationId: convId, role: 'assistant',
        content: FALLBACK_REPLY, slotsJson: null, offTopic: false, createdAt: now,
      })

      // A failed turn still consumes a global turn — keep KV and D1 in
      // lockstep the same way the success path below does, so turn_count
      // never under-reports relative to the KV session.
      await persistSession(c.env, convId, { ...session, totalTurns: session.totalTurns + 1 })

      return c.json({
        conversationId: convId, reply: FALLBACK_REPLY, state: session.state, finished: false,
      })
    }

    const { slots, rejected } = validateSlots(session.state, turn.value.slots)
    if (rejected.length > 0) {
      await recordEvent(c.env.DB, convId, 'slots_rejected', { state: session.state, keys: rejected })
    }

    const result = step(session, {
      slots,
      readyToAdvance: turn.value.ready_to_advance,
      offTopic: turn.value.off_topic,
    })

    await appendMessageAtNextSeq(c.env.DB, {
      id: newId('msg'), conversationId: convId, role: 'assistant',
      content: turn.value.reply,
      // The slots that were actually merged, not the ones the model proposed —
      // the transcript must agree with the session it produced.
      slotsJson: JSON.stringify(slots),
      offTopic: turn.value.off_topic,
      createdAt: now,
    })

    if (result.forced) {
      await recordEvent(c.env.DB, convId, 'forced_advance', { state: session.state })
    }

    await persistSession(c.env, convId, result.next)

    await c.env.DB
      .prepare('UPDATE conversations SET tokens_in = tokens_in + ?, tokens_out = tokens_out + ? WHERE id = ?')
      .bind(turn.promptTokens, turn.completionTokens, convId)
      .run()

    return c.json({
      conversationId: convId,
      reply: turn.value.reply,
      state: result.next.state,
      finished: result.finished,
    })
  })
}
