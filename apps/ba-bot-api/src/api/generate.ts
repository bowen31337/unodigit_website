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
  getBriefByConversation, getConversation, insertBrief,
  insertQuote, recordEvent, type QuoteRow,
} from '../db/queries'
import { signId } from '../util/sign'
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
 * pricing mechanics, shown only in the quote artifact behind the signed link,
 * where the weighting and the band explain it. A rate in the chat invites a
 * negotiation about the decomposition rather than about the outcome.
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

const nonEmpty = (slots: Slots, key: string): boolean =>
  typeof slots[key] === 'string' && (slots[key] as string).trim().length > 0

/**
 * Does this session carry enough substance to put a price on?
 *
 * Slots live ONLY in KV, under SESSION_TTL_SECONDS (86400). `loadSession`
 * deliberately falls back to the durable D1 row when the key is gone, but D1
 * holds only `state` and `turn_count` — so an expired session comes back
 * carrying `GENERATE` with `initialState()`'s EMPTY slot bag. Ungated, that
 * renders a brief whose every section reads "_Not captured during the
 * interview._", then persists it, sends it to DeepSeek, prices whatever comes
 * back, stores it, and hands the client a dollar figure derived from nothing.
 *
 * The gate is the two slots `buildBriefSections` cannot produce a meaningful
 * artifact without: `project_name` titles both the brief and the quote, and
 * `problem` IS the "## Problem" section and the substance the
 * estimator sizes against. Both are captured in the very first graph state
 * (its exitGate requires project_name, audience and problem together), so any
 * session that genuinely walked the interview has them.
 *
 * Deliberately NOT gated on the rest. `audience`, `solution_summary`,
 * `mvp_must` and friends make a brief richer, but requiring them would 409 a
 * terse-yet-genuine interview — and whether enough was asked is the graph's
 * job, not this route's. The guard exists to catch a VANISHED session, not to
 * grade one.
 *
 * A session force-advanced past the first state without answering can also
 * land here. `session_expired` is a slightly generous name for that case, but
 * the remedy is identical — restart the interview — and quoting it would be
 * exactly as wrong.
 */
const hasEnoughToQuote = (slots: Slots): boolean =>
  nonEmpty(slots, 'project_name') && nonEmpty(slots, 'problem')

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

/** `belowFloor` is read straight off `quotes.below_floor` (migration 0003),
 *  never re-derived. It used to be recomputed here as
 *  `weighted_tasks * rate_aud < minimumAud` against the CURRENT
 *  MINIMUM_ENGAGEMENT_AUD — but that env var is a documented placeholder that
 *  has already changed once for its sibling RATE_PER_TASK_AUD (see
 *  progress.txt, 2026-08-19 pricing-configuration entry), so a re-read of an
 *  OLD quote could return a verdict that disagrees with the markdown already
 *  rendered, stored, and linked to the client. The stored markdown is the
 *  artifact the client actually read; it is the authority, so the verdict
 *  that produced it is stored alongside it and simply read back, not
 *  recomputed against whatever the env var holds today.
 *
 *  Exported so GET /api/quote/:id reads a stored quote through exactly this
 *  mapping. A second copy would be a second place for a future re-derivation
 *  to creep back in. One copy, one source of truth. */
export function quoteFromRow(row: QuoteRow): Quote {
  return {
    mode: row.mode === 'program' ? 'program' : 'single',
    totalTasks: row.total_tasks,
    weightedTasks: row.weighted_tasks,
    rateAud: row.rate_aud,
    lowAud: row.low_aud,
    highAud: row.high_aud,
    weeks: row.weeks,
    confidence: row.confidence as Quote['confidence'],
    belowFloor: row.below_floor === 1,
  }
}

/**
 * The signed, downloadable link to the hosted quote — the ONLY way the client
 * ever reaches it. Email delivery was decommissioned (US-010): nothing is sent
 * to the lead, so this URL travels back in the generate response and the widget
 * renders it.
 *
 * Both id and signature go in the QUERY, per spec §11. The site is
 * output:'export' with trailingSlash:true, so a dynamic /q/[id] route cannot be
 * pre-rendered for ids that do not exist at build time — a path-form link
 * resolves to Cloudflare Pages' 404.html and is permanently dead. A static shell
 * at app/q/page.tsx reading ?id=&sig= works because the path IS known at build
 * time. Do not "tidy" this into a path.
 *
 * The id and signature are both [A-Za-z0-9_-]/lowercase-hex, so neither needs
 * URL-encoding.
 *
 * PII: this function takes a quote id and nothing else. Since `deliver()` was
 * removed there is no read of `leads.email` (or any other lead field) anywhere
 * in the generate path — the address is now structurally incapable of leaving
 * the `leads` table during generation at all, which is the strongest form of
 * the Australian Privacy Act APP 8 posture this route can hold.
 *
 * Failure is logged and swallowed, never propagated, and answered with `null`.
 * `signId` can throw and `PUBLIC_SITE_URL` can be unset; by the time this runs
 * the brief and the quote are already committed and the visitor already has
 * their number on screen. An unhandled throw would 500 that request AND skip
 * `finish()`, parking the session at GENERATE forever. The `.catch` on the log
 * is not decorative: if D1 is what threw, recording the event will throw too.
 */
async function quoteLink(env: Env, conversationId: string, quoteId: string): Promise<string | null> {
  try {
    const sig = await signId(quoteId, env.QUOTE_LINK_SIGNING_KEY)
    const base = env.PUBLIC_SITE_URL.replace(/\/$/, '')
    return `${base}/q/?id=${quoteId}&sig=${sig}`
  } catch (err) {
    await recordEvent(env.DB, conversationId, 'quote_link_failed', {
      quoteId,
      error: err instanceof Error ? err.message : String(err),
    }).catch(() => undefined)
    return null
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
      const quote = row ? quoteFromRow(row) : null
      const headline = quote
        ? headlineFor(quote)
        : (await quotesToday(c.env.DB, ipHash, utcDay(now))) >= 1
          ? RATE_LIMITED_HEADLINE
          : ESTIMATOR_FAILED_HEADLINE

      // The link is rebuilt, not stored: the signature is a deterministic
      // HMAC over the quote id, so a refresh returns the identical URL. A
      // visitor who closed the widget and came back must still be able to open
      // their quote — with email gone this response is their only copy of it.
      return c.json({
        briefId: existing.id,
        quoteId: row?.id ?? null,
        quote,
        quoteUrl: row ? await quoteLink(c.env, conversationId, row.id) : null,
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
    if (!hasEnoughToQuote(slots)) {
      await recordEvent(c.env.DB, conversationId, 'generate_session_expired', {
        state: session.state,
      })
      // 409, not 404 and not 500. The conversation exists and the request is
      // well-formed; what is missing is the visitor's interview state, which
      // makes this a wrong-state condition. A 500 would also mislead: nothing
      // failed, and there is nothing to retry.
      return c.json({ error: 'session_expired' }, 409)
    }

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
     *  the conversation row, answer.
     *
     *  `quoteUrl` defaults to null so the two no-quote exits below (rate
     *  limited, estimator failed) cannot accidentally carry a link: there is no
     *  quote behind it, and a fabricated one would only ever 403. */
    const finish = async (
      quoteId: string | null, quote: Quote | null, headline: string,
      quoteUrl: string | null = null,
    ) => {
      const result = step(session, { slots: {}, readyToAdvance: true, offTopic: false })
      await persistSession(c.env, conversationId, result.next)
      await endConversation(c.env.DB, conversationId, result.next.state, now)
      return c.json({ briefId, quoteId, quote, quoteUrl, headline, state: result.next.state })
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
    // The linked artifact does show the rate; only the chat headline hides it.
    const quoteMarkdown = renderQuote({ quote, shape, projectName, validUntil, rateShown: true })

    await insertQuote(c.env.DB, {
      id: quoteId,
      briefId,
      markdown: quoteMarkdown,
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
      belowFloor: quote.belowFloor,
    })

    await recordQuote(c.env.DB, ipHash, utcDay(now))

    // The heavy model is the most expensive call in the app; its spend belongs
    // in the same columns that track the cheap one.
    await c.env.DB
      .prepare('UPDATE conversations SET tokens_in = tokens_in + ?, tokens_out = tokens_out + ? WHERE id = ?')
      .bind(estimate.promptTokens, estimate.completionTokens, conversationId)
      .run()

    return await finish(
      quoteId, quote, headlineFor(quote),
      await quoteLink(c.env, conversationId, quoteId),
    )
  })
}
