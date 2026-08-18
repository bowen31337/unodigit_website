import type { Hono } from 'hono'
import { z } from 'zod'
import type { Env } from '../env'
import { createOpenAiCompatClient } from '../llm/openai-compat'
import type { ChatMessage, LlmClient } from '../llm/types'
import { runTurn } from '../llm/turn'
import { step } from '../graph/transitions'
import {
  appendMessage, createConversation, getConversation, listMessages,
  recordEvent, updateConversationState,
} from '../db/queries'
import { newId } from '../util/ids'
import { loadSession, saveSession } from '../session'

const Body = z.object({
  conversationId: z.string().optional(),
  message: z.string().min(1).max(4000),
})

const FALLBACK_REPLY =
  'Sorry — something went wrong on my end. Could you say that once more?'

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

    // Built once, before the new user message is appended, and reused by
    // both the turn-cap branch and the normal path below.
    const rawHistory = await listMessages(c.env.DB, convId)
    const seq = rawHistory.length + 1

    // Cap total turns so a hostile visitor cannot loop indefinitely. Still
    // persist the user's message and record an event: `abandoned_at_state`
    // analysis needs to see where a capped conversation stalled, so a
    // capped turn cannot vanish from the message/event log.
    if (session.totalTurns >= Number(c.env.MAX_TOTAL_TURNS)) {
      await appendMessage(c.env.DB, {
        id: newId('msg'), conversationId: convId, seq, role: 'user',
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

    const turn = await runTurn(makeClient(c.env), {
      model: c.env.LLM_MODEL,
      state: session.state,
      history,
      userMessage: message,
    })

    await appendMessage(c.env.DB, {
      id: newId('msg'), conversationId: convId, seq, role: 'user',
      content: message, slotsJson: null, offTopic: false, createdAt: now,
    })

    if (!turn.ok) {
      await recordEvent(c.env.DB, convId, 'llm_failed', { reason: turn.reason, state: session.state })
      await appendMessage(c.env.DB, {
        id: newId('msg'), conversationId: convId, seq: seq + 1, role: 'assistant',
        content: FALLBACK_REPLY, slotsJson: null, offTopic: false, createdAt: now,
      })

      // A failed turn still consumes a global turn — keep KV and D1 in
      // lockstep the same way the success path below does, so turn_count
      // never under-reports relative to the KV session.
      const failedTotalTurns = session.totalTurns + 1
      await saveSession(c.env, convId, { ...session, totalTurns: failedTotalTurns })
      await updateConversationState(c.env.DB, convId, session.state, failedTotalTurns)

      return c.json({
        conversationId: convId, reply: FALLBACK_REPLY, state: session.state, finished: false,
      })
    }

    const result = step(session, {
      slots: turn.value.slots,
      readyToAdvance: turn.value.ready_to_advance,
      offTopic: turn.value.off_topic,
    })

    await appendMessage(c.env.DB, {
      id: newId('msg'), conversationId: convId, seq: seq + 1, role: 'assistant',
      content: turn.value.reply,
      slotsJson: JSON.stringify(turn.value.slots),
      offTopic: turn.value.off_topic,
      createdAt: now,
    })

    if (result.forced) {
      await recordEvent(c.env.DB, convId, 'forced_advance', { state: session.state })
    }

    await saveSession(c.env, convId, result.next)
    await updateConversationState(c.env.DB, convId, result.next.state, result.next.totalTurns)

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
