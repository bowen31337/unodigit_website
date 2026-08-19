import type { Hono } from 'hono'
import { z } from 'zod'
import type { EstimateShape, Quote } from '@unodigit/ba-bot-contract'
import type { Env } from '../env'
import { createOpenAiCompatClient } from '../llm/openai-compat'
import type { LlmClient } from '../llm/types'
import { runEstimate } from '../estimator/estimate'
import { priceQuote } from '../pricing/quote'
import { buildBriefSections, renderBrief } from '../render/brief'
import { renderQuote } from '../render/quote'
import {
  getBriefByConversation, getConversation, insertBrief, insertQuote, recordEvent,
  type QuoteRow,
} from '../db/queries'
import { quotesToday, recordQuote, utcDay } from '../guards/ratelimit'
import type { Slots, StateId } from '../graph/states'
import { step } from '../graph/transitions'
import { loadSession, persistSession } from '../session'
import { hashIp } from '../util/hash'
import { newId } from '../util/ids'

const Body = z.object({ conversationId: z.string().min(1) }).strict()

const DAY_MS = 86_400_000

/** Spec §10: the limit is a conversion path, not a wall. */
const RATE_LIMITED_HEADLINE =
  "Looks like your team already has a quote from us — book a call and we'll refine it together."

/** The interview happened and the brief is real; only the sizing is missing.
 *  Nothing here reads as an error, because to the visitor it is not one. */
const ESTIMATOR_FAILED_HEADLINE =
  'Your project brief is ready. Sizing this one needs a closer look — we will follow up by email with an indicative estimate.'

const aud = (n: number): string => n.toLocaleString('en-AU')

const plural = (n: number): string => (n === 1 ? '' : 's')

/**
 * The chat-visible line. The per-task rate NEVER appears here: it is internal
 * pricing mechanics, shown only in the emailed quote where the weighting and
 * the band explain it. A rate in the chat invites a negotiation about the
 * decomposition rather than about the outcome.
 */
function headlineFor(q: Quote): string {
  if (q.belowFloor) {
    // Quoting a figure the business cannot service profitably attracts leads it
    // must then reject. The band is replaced, not accompanied.
    return (
      `~${q.totalTasks} tasks · roughly ${q.weeks} week${plural(q.weeks)} — this looks smaller ` +
      'than our usual engagements, so let us talk about a fixed-price starter engagement.'
    )
  }
  return `~${q.totalTasks} tasks · estimated A$${aud(q.lowAud)}–${aud(q.highAud)} · roughly ${q.weeks} week${plural(q.weeks)}`
}

const projectNameOf = (slots: Slots): string => {
  const raw = slots.project_name
  return typeof raw === 'string' && raw.trim() ? raw.trim() : 'Your project'
}

/**
 * Closes the conversation record. `abandoned_at_state` is the highest-value
 * column in the schema — it names the question that killed the funnel — so it
 * is written for any session that ends somewhere other than DONE, and left
 * null for one that completed.
 */
export async function endConversation(
  db: D1Database, conversationId: string, finalState: StateId, now: number,
): Promise<void> {
  await db
    .prepare('UPDATE conversations SET ended_at = ?, abandoned_at_state = ? WHERE id = ?')
    .bind(now, finalState === 'DONE' ? null : finalState, conversationId)
    .run()
}

/** `briefs.conversation_id` is unique in practice (only this route writes it),
 *  but the read goes through the same newest-first helper as everywhere else. */
async function quoteRowForBrief(db: D1Database, briefId: string): Promise<QuoteRow | null> {
  return await db
    .prepare('SELECT * FROM quotes WHERE brief_id = ? ORDER BY created_at DESC LIMIT 1')
    .bind(briefId)
    .first<QuoteRow>()
}

/** `belowFloor` is a pricing verdict, not a stored column, so a re-read
 *  re-applies the same rule priceQuote used: midpoint against the configured
 *  minimum. Every other field comes straight off the row. */
function quoteFromRow(row: QuoteRow, minimumAud: number): Quote {
  return {
    mode: row.mode === 'program' ? 'program' : 'single',
    totalTasks: row.total_tasks,
    weightedTasks: row.weighted_tasks,
    rateAud: row.rate_aud,
    lowAud: row.low_aud,
    highAud: row.high_aud,
    weeks: row.weeks,
    confidence: row.confidence as Quote['confidence'],
    belowFloor: row.weighted_tasks * row.rate_aud < minimumAud,
  }
}

export function registerGenerateRoutes(
  app: Hono<{ Bindings: Env }>,
  deps: { makeClient?: (env: Env) => LlmClient } = {},
): void {
  const makeClient =
    deps.makeClient ??
    ((env: Env) => createOpenAiCompatClient({ baseUrl: env.LLM_BASE_URL, apiKey: env.LLM_API_KEY }))

  app.post('/api/generate', async (c) => {
    const parsed = Body.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

    const { conversationId } = parsed.data
    const now = Date.now()
    const minimumAud = Number(c.env.MINIMUM_ENGAGEMENT_AUD)

    if (!(await getConversation(c.env.DB, conversationId))) {
      return c.json({ error: 'not_found' }, 404)
    }

    const session = await loadSession(c.env, conversationId)
    const ipHash = await hashIp(c.req.header('cf-connecting-ip') ?? 'unknown', c.env.IP_HASH_SALT)

    // Idempotency is checked BEFORE the state gate, not after. A generate that
    // succeeded left the session at DONE, so a refresh or a double-click would
    // otherwise be answered 409 — and the visitor whose brief already exists
    // must get it back, not an error. A second estimate is never run.
    const existing = await getBriefByConversation(c.env.DB, conversationId)
    if (existing) {
      const row = await quoteRowForBrief(c.env.DB, existing.id)
      const quote = row ? quoteFromRow(row, minimumAud) : null
      const headline = quote
        ? headlineFor(quote)
        : (await quotesToday(c.env.DB, ipHash, utcDay(now))) >= 1
          ? RATE_LIMITED_HEADLINE
          : ESTIMATOR_FAILED_HEADLINE

      return c.json({
        briefId: existing.id,
        quoteId: row?.id ?? null,
        quote,
        headline,
        state: session.state,
      })
    }

    // CONTACT cannot force-advance, so a session that reached GENERATE has a
    // lead row behind it. Any other state means the interview is unfinished.
    if (session.state !== 'GENERATE') {
      return c.json({ error: 'wrong_state', state: session.state }, 409)
    }

    const slots = session.slots
    const projectName = projectNameOf(slots)
    const sections = buildBriefSections(slots)
    const briefMarkdown = renderBrief(sections, projectName)
    const briefId = newId('brief')

    // The brief lands first, unconditionally: it is the artifact the interview
    // actually earned, and quotes.brief_id is a foreign key onto it.
    await insertBrief(c.env.DB, {
      id: briefId,
      conversationId,
      markdown: briefMarkdown,
      sectionsJson: JSON.stringify(sections),
      createdAt: now,
    })

    /** Everything after the brief shares one exit: advance the session, close
     *  the conversation row, answer. */
    const finish = async (
      quoteId: string | null, quote: Quote | null, headline: string,
    ) => {
      const result = step(session, { slots: {}, readyToAdvance: true, offTopic: false })
      await persistSession(c.env, conversationId, result.next)
      await endConversation(c.env.DB, conversationId, result.next.state, now)
      return c.json({ briefId, quoteId, quote, headline, state: result.next.state })
    }

    // Spec §10: one quote per IP per day, gating the artifact rather than the
    // conversation. Skipping the estimate outright is the point — it is the
    // expensive call, and running it only to discard the result would spend
    // exactly what the limit exists to protect.
    if ((await quotesToday(c.env.DB, ipHash, utcDay(now))) >= 1) {
      await recordEvent(c.env.DB, conversationId, 'quote_rate_limited', { briefId })
      return await finish(null, null, RATE_LIMITED_HEADLINE)
    }

    const estimate = await runEstimate(makeClient(c.env), {
      model: c.env.LLM_MODEL_HEAVY,
      briefText: briefMarkdown,
      programThreshold: Number(c.env.PROGRAM_MODE_THRESHOLD),
    })

    if (!estimate.ok) {
      // Never 500 a visitor because the estimator failed. The brief is already
      // persisted and is returned with a headline that promises a follow-up.
      await recordEvent(c.env.DB, conversationId, 'estimate_failed', { reason: estimate.reason, briefId })
      return await finish(null, null, ESTIMATOR_FAILED_HEADLINE)
    }

    const shape: EstimateShape = estimate.shape
    const quote = priceQuote(shape, {
      rateAud: Number(c.env.RATE_PER_TASK_AUD),
      minimumAud,
      tasksPerWeek: Number(c.env.TASKS_PER_WEEK),
      quoteValidDays: Number(c.env.QUOTE_VALID_DAYS),
    })

    const validUntil = now + Number(c.env.QUOTE_VALID_DAYS) * DAY_MS
    const quoteId = newId('quote')

    await insertQuote(c.env.DB, {
      id: quoteId,
      briefId,
      // The emailed artifact does show the rate; only the chat headline hides it.
      markdown: renderQuote({ quote, shape, projectName, validUntil, rateShown: true }),
      mode: quote.mode,
      totalTasks: quote.totalTasks,
      weightedTasks: quote.weightedTasks,
      rateAud: quote.rateAud,
      lowAud: quote.lowAud,
      highAud: quote.highAud,
      weeks: quote.weeks,
      confidence: quote.confidence,
      categoriesJson: JSON.stringify(shape.mode === 'single' ? shape.categories : []),
      subsystemsJson: shape.mode === 'program' ? JSON.stringify(shape.subsystems) : null,
      validUntil,
      createdAt: now,
    })

    await recordQuote(c.env.DB, ipHash, utcDay(now))

    // The heavy model is the most expensive call in the app; its spend belongs
    // in the same columns that track the cheap one.
    await c.env.DB
      .prepare('UPDATE conversations SET tokens_in = tokens_in + ?, tokens_out = tokens_out + ? WHERE id = ?')
      .bind(estimate.promptTokens, estimate.completionTokens, conversationId)
      .run()

    return await finish(quoteId, quote, headlineFor(quote))
  })
}
