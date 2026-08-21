import type { Hono } from 'hono'
import { z } from 'zod'
import { ChatRequestSchema } from '@unodigit/ba-bot-contract'
import type { Env } from '../env'
import { createOpenAiCompatClient } from '../llm/openai-compat'
import type { LlmClient } from '../llm/types'
import { replayHistory } from '../llm/history'
import { runTurn } from '../llm/turn'
import { step } from '../graph/transitions'
import { STATES, type Slots, type StateId } from '../graph/states'
import { contactHandoffReply } from '../graph/handoff'
import {
  appendMessageAtNextSeq, createConversation, getConversation, listMessages,
  recordEvent, recordLlmUsage,
} from '../db/queries'
import { recordTurn, turnsToday, utcDay } from '../guards/ratelimit'
import { verifyTurnstile } from '../guards/turnstile'
import { hashIp } from '../util/hash'
import { newId } from '../util/ids'
import { loadSession, persistSession } from '../session'

const Body = ChatRequestSchema

const FALLBACK_REPLY =
  'Sorry — something went wrong on my end. Could you say that once more?'

/** Slots come out of an LLM reading untrusted visitor text, so they are input,
 * not output. Each state declares a `.strict()` schema naming exactly the slots
 * that state may write; any key not on that list — hallucinated, or injected by
 * a visitor telling the model what to emit — is dropped rather than merged into
 * session state.
 *
 * This is what keeps `lead_id` unforgeable: no state's schema declares it, so
 * only `POST /api/contact` can ever put it in the session, and only a real lead
 * row can open the `CONTACT` exit gate.
 *
 * Rejection is per KEY, not per object — see the fallback below for why the
 * all-or-nothing version stalled the graph. */
/**
 * Near-miss field names the model actually emitted, mapped to the real ones.
 *
 * Every entry is observed, not imagined — taken from `slots_rejected` events on
 * a real interview, where the model wrote `core_features` for `features` and
 * `hardest_data_type` for what is now `complexity_driver`. Each rejection is a
 * fact the visitor said out loud and the schema silently discarded.
 *
 * This does NOT loosen the security property. An alias resolves to a canonical
 * name and is then validated against the CURRENT state's shape exactly as any
 * other key is, so a slot that state does not declare is still dropped, and
 * `lead_id` — declared by no state — remains unforgeable.
 */
const SLOT_ALIASES: Record<string, string> = {
  core_features: 'features',
  covered_categories_so_far: 'covered_categories',
  personas_indicated: 'personas',
  mvp_must_indicated: 'mvp_must',
  mvp_wont_indicated: 'mvp_wont',
  hardest_data_type: 'complexity_driver',
  core_difficulty: 'complexity_driver',
}

function validateSlots(state: StateId, raw: Slots): { slots: Slots; rejected: string[] } {
  const schema = STATES[state].slotSchema

  // Canonicalise before the fast path, or a single aliased key drops every
  // slot in the turn into the per-key fallback below.
  const canonical: Slots = {}
  for (const [k, v] of Object.entries(raw)) canonical[SLOT_ALIASES[k] ?? k] = v

  const parsed = schema.safeParse(canonical)
  if (parsed.success) return { slots: parsed.data as Slots, rejected: [] }

  // The whole-object parse failed. It used to end here, returning NO slots and
  // naming every key as rejected — which is how a single bad *value* threw
  // away its valid siblings. Observed in production as
  // `slots_rejected {"keys":["project_name","audience","problem"]}`: all three
  // of PROJECT_IDENTITY's own declared slots discarded together, so its
  // exitGate (which needs all three) could never open and the state ran to
  // maxTurns and force-advanced with an empty brief.
  //
  // Fall back to per-key validation. The security property is unchanged — it
  // comes from the shape being a closed list, and a key absent from it is
  // still dropped, so `lead_id` remains unforgeable. What changes is that one
  // malformed value no longer costs the turn everything else it learned.
  const shape = schema instanceof z.ZodObject ? (schema.shape as Record<string, z.ZodTypeAny>) : null
  if (!shape) return { slots: {}, rejected: Object.keys(raw) }

  const slots: Slots = {}
  const rejected: string[] = []
  for (const [key, value] of Object.entries(canonical)) {
    const field = shape[key]
    if (!field) {
      rejected.push(key)
      continue
    }
    const one = field.safeParse(value)
    // `undefined` passes an `.optional()` field but carries nothing; writing it
    // would put an explicit undefined into session state where "absent" is what
    // the exit gates test for.
    if (one.success && one.data !== undefined) slots[key] = one.data
    else rejected.push(key)
  }
  return { slots, rejected }
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

    const { conversationId, message, turnstileToken } = parsed.data
    const now = Date.now()

    let convId = conversationId
    if (convId) {
      if (!(await getConversation(c.env.DB, convId))) return c.json({ error: 'not_found' }, 404)
    } else {
      convId = newId('conv')
      await createConversation(c.env.DB, convId, now)
    }

    const session = await loadSession(c.env, convId)

    // MAX_TOTAL_TURNS caps a single session, not how many sessions one
    // attacker opens. Without the two guards below, an attacker creates
    // unlimited conversations, each spending up to 40 DeepSeek turns, and the
    // spend is unmetered. Both run before the message is persisted and before
    // any model call, so abusive traffic costs a counter read and nothing else.
    const ip = c.req.header('cf-connecting-ip') ?? null
    const ipHash = await hashIp(ip ?? 'unknown', c.env.IP_HASH_SALT)
    const day = utcDay(now)

    // Turnstile guards the FIRST message only (spec 10.1). Re-challenging on
    // every turn would interrupt the interview mid-question. An empty string is
    // not a token, so `!turnstileToken` deliberately covers both an omitted
    // field and a blank one — there is no shape of request that reaches the
    // model on turn zero without a token the schema let through.
    if (session.totalTurns === 0) {
      if (!turnstileToken) {
        return c.json({ error: 'turnstile_required' }, 403)
      }
      if (!(await verifyTurnstile(turnstileToken, c.env.TURNSTILE_SECRET, ip))) {
        // `events.conversation_id` is a foreign key and `convId` is either an
        // existing row or one created above, so this cannot turn the 403 into
        // a 500 the way it would on an unknown conversation.
        await recordEvent(c.env.DB, convId, 'turnstile_failed', {})
        return c.json({ error: 'turnstile_failed' }, 403)
      }
    }

    // 429, not 403: the widget must be able to tell "slow down" from
    // "rejected".
    if ((await turnsToday(c.env.DB, ipHash, day)) >= Number(c.env.MAX_TURNS_PER_IP_PER_DAY)) {
      return c.json({ error: 'rate_limited' }, 429)
    }
    // Recorded BEFORE the model call. Recording after would let a burst of
    // concurrent requests all read the pre-increment count and all proceed,
    // and would leave a provider outage costing nothing — an unlimited free
    // retry loop against a failing provider.
    await recordTurn(c.env.DB, ipHash, day)

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

    // Assistant turns are replayed as the JSON envelope the model emitted, not
    // as the bare reply text stored for the transcript. See llm/history — the
    // prose form contradicted json_object mode and made the model answer with
    // whitespace.
    const history = replayHistory(rawHistory)

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

    let result = step(session, {
      slots,
      readyToAdvance: turn.value.ready_to_advance,
      offTopic: turn.value.off_topic,
    })

    /**
     * The client asked to stop. Jump straight to CONTACT.
     *
     * `ready_to_advance` cannot express this — it moves ONE state, and the next
     * state's gate blocks again immediately. Observed: a visitor said they were
     * out of time four times, the model replied "Done." each turn, and the
     * conversation sat in SOLUTION_SHAPE because that gate wanted a
     * differentiator the visitor was never going to give.
     *
     * Guarded on having enough for a brief. Without project_name and problem
     * POST /api/generate answers 409 session_expired, so jumping an
     * information-less conversation to CONTACT would collect an email and then
     * fail to produce anything — worse than continuing to ask.
     */
    const canBrief =
      typeof result.next.slots.project_name === 'string' &&
      result.next.slots.project_name.trim() !== '' &&
      typeof result.next.slots.problem === 'string' &&
      result.next.slots.problem.trim() !== ''

    if (
      turn.value.wrap_up &&
      canBrief &&
      !['CONTACT', 'GENERATE', 'DONE'].includes(result.next.state)
    ) {
      await recordEvent(c.env.DB, convId, 'wrapped_up_early', {
        from: session.state,
        turns: session.totalTurns + 1,
      })
      result = {
        ...result,
        advanced: true,
        next: { ...result.next, state: 'CONTACT', turnsInState: 0 },
      }
    }

    // The model wrote this reply under the OUTGOING state's addendum, so it
    // does not know it is the last thing the visitor will read. Advancing into
    // CONTACT swaps the composer for the form, which strands a trailing
    // question or a "moving to the next topic" promise with no way to answer
    // or continue. See graph/handoff.
    const reply =
      result.advanced && result.next.state === 'CONTACT'
        ? contactHandoffReply(turn.value.reply)
        : turn.value.reply

    await appendMessageAtNextSeq(c.env.DB, {
      id: newId('msg'), conversationId: convId, role: 'assistant',
      // The amended reply, not the raw one: the transcript must be what the
      // visitor actually saw, the same rule the slots below follow.
      content: reply,
      // The slots that were actually merged, not the ones the model proposed —
      // the transcript must agree with the session it produced.
      slotsJson: JSON.stringify(slots),
      offTopic: turn.value.off_topic,
      // Stored so llm/history can replay this turn as the envelope the model
      // actually emitted; a constant here would bias the next turn's answer.
      readyToAdvance: turn.value.ready_to_advance,
      createdAt: now,
    })

    if (result.forced) {
      await recordEvent(c.env.DB, convId, 'forced_advance', { state: session.state })
    }

    // Copied out of the session onto the durable row the turn it is learned.
    // Slots live only in KV and expire; the leads table needs this months
    // later. Written at most once — the guard means a later turn restating the
    // same fact costs nothing, and an early guess is not overwritten by a
    // vaguer one.
    if (typeof slots.industry === 'string' && slots.industry.trim()) {
      await c.env.DB
        .prepare("UPDATE conversations SET industry = ? WHERE id = ? AND (industry IS NULL OR industry = '')")
        .bind(slots.industry.trim().slice(0, 80), convId)
        .run()
    }

    await persistSession(c.env, convId, result.next)

    await c.env.DB
      .prepare('UPDATE conversations SET tokens_in = tokens_in + ?, tokens_out = tokens_out + ? WHERE id = ?')
      .bind(turn.promptTokens, turn.completionTokens, convId)
      .run()

    // Per-call detail the conversation counters cannot hold: which model, and
    // how much of the prompt the provider served from its prefix cache.
    await recordLlmUsage(c.env.DB, {
      conversationId: convId,
      model: turn.model,
      purpose: 'chat',
      promptTokens: turn.promptTokens,
      cachedTokens: turn.cachedTokens,
      completionTokens: turn.completionTokens,
    })

    return c.json({
      conversationId: convId,
      reply,
      state: result.next.state,
      finished: result.finished,
    })
  })
}
