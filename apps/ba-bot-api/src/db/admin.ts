/**
 * Read-only aggregates for the admin dashboard.
 *
 * These mirror the SQL already proven out in `scripts/admin/*.sh` rather than
 * inventing a second definition of "the funnel" — two answers to the same
 * question that disagree is worse than one answer in one place. The scripts
 * stay; this is the same data over HTTP for the hostname behind Access.
 *
 * Every function here issues SELECTs only. The destructive path
 * (`delete-lead.sh`) is deliberately NOT exposed over HTTP: it is irreversible,
 * it is rare, and its safety comes from a confirmation step that means nothing
 * once a browser can issue it.
 *
 * `days` is always bound as a parameter, never interpolated. A caller-supplied
 * value reaching SQL as text is the one mistake that turns a read-only surface
 * into a writable one.
 */

/**
 * Window start, in MILLISECONDS, because every timestamp column in this schema
 * is milliseconds — they are all written from `Date.now()`.
 *
 * This returned unix SECONDS until it was measured against real data. A
 * millisecond timestamp (1787227092049) is about a thousand times larger than
 * any second-based bound (1787231034), so `created_at >= ?` was ALWAYS TRUE
 * and every window — 24 hours, 7 days, 30 days — silently returned all time.
 * Nothing looked broken: the numbers were plausible, just never filtered.
 *
 * `days <= 0` still means all time, expressed as 0 rather than a conditional
 * WHERE — building the clause itself conditionally is how a subquery ends up
 * with a dangling AND.
 */
export function since(days: number, nowMs = Date.now()): number {
  if (!Number.isFinite(days) || days <= 0) return 0
  return nowMs - Math.floor(days) * 86_400_000
}

export interface Overview {
  conversations: number
  leads: number
  quotes: number
  briefs: number
  completed: number
  abandoned: number
  /** Never reached POST /api/generate — the visitor closed the widget. Neither
   *  completed nor abandoned; see the note in the query. */
  unfinished: number
  totalCostUsd: number
  tokensIn: number
  tokensOut: number
  avgTurns: number
  quotedValueLowAud: number
  quotedValueHighAud: number
}

export async function overview(db: D1Database, from: number): Promise<Overview> {
  const conv = await db
    .prepare(
      `SELECT
         COUNT(*)                                              AS conversations,
         COALESCE(SUM(cost_usd), 0)                            AS total_cost_usd,
         COALESCE(SUM(tokens_in), 0)                           AS tokens_in,
         COALESCE(SUM(tokens_out), 0)                          AS tokens_out,
         COALESCE(ROUND(AVG(turn_count), 1), 0)                AS avg_turns,
         COALESCE(SUM(abandoned_at_state IS NOT NULL), 0)      AS abandoned,
         -- A conversation is only ever "ended" by POST /api/generate. Closing
         -- the widget mid-interview writes nothing, so ended_at and
         -- abandoned_at_state both stay NULL forever and such a session is
         -- neither completed NOR abandoned. Counting only the first two made
         -- the dashboard report 0 and 0 against 30 conversations, which reads
         -- as "nothing to see" when in fact almost every visitor was dropping
         -- out at the first question.
         COALESCE(SUM(ended_at IS NULL), 0)                     AS unfinished,
         COALESCE(SUM(ended_at IS NOT NULL
                      AND abandoned_at_state IS NULL), 0)      AS completed
       FROM conversations WHERE started_at >= ?`,
    )
    .bind(from)
    .first<Record<string, number>>()

  // Leads and artifacts are counted against their own timestamps, not the
  // conversation's: a conversation started before the window can produce a
  // lead inside it, and attributing that lead to the earlier window would
  // make "leads this week" quietly wrong.
  const leads = await db
    .prepare('SELECT COUNT(*) AS n FROM leads WHERE created_at >= ?')
    .bind(from)
    .first<{ n: number }>()

  const briefs = await db
    .prepare('SELECT COUNT(*) AS n FROM briefs WHERE created_at >= ?')
    .bind(from)
    .first<{ n: number }>()

  const quotes = await db
    .prepare(
      `SELECT COUNT(*)                    AS n,
              COALESCE(SUM(low_aud), 0)   AS low,
              COALESCE(SUM(high_aud), 0)  AS high
       FROM quotes WHERE created_at >= ?`,
    )
    .bind(from)
    .first<{ n: number; low: number; high: number }>()

  return {
    conversations: conv?.conversations ?? 0,
    leads: leads?.n ?? 0,
    quotes: quotes?.n ?? 0,
    briefs: briefs?.n ?? 0,
    completed: conv?.completed ?? 0,
    abandoned: conv?.abandoned ?? 0,
    unfinished: conv?.unfinished ?? 0,
    totalCostUsd: conv?.total_cost_usd ?? 0,
    tokensIn: conv?.tokens_in ?? 0,
    tokensOut: conv?.tokens_out ?? 0,
    avgTurns: conv?.avg_turns ?? 0,
    quotedValueLowAud: quotes?.low ?? 0,
    quotedValueHighAud: quotes?.high ?? 0,
  }
}

export interface FunnelRow {
  state: string
  conversations: number
  pctOfTotal: number
  avgTurns: number
}

/** Drop-off by `abandoned_at_state` — a large bucket names the question people
 *  will not answer. Same grouping as `scripts/admin/funnel.sh`. */
export async function funnel(db: D1Database, from: number): Promise<FunnelRow[]> {
  const { results } = await db
    .prepare(
      `SELECT
         -- Three cases, in order: explicitly abandoned; still open (bucket by
         -- the state it is sitting in, which is where the visitor actually
         -- stopped); otherwise genuinely finished. Bucketing on
         -- abandoned_at_state alone put every unfinished conversation into one
         -- "(not abandoned)" row at 100%, hiding the real drop-off entirely.
         COALESCE(
           abandoned_at_state,
           CASE WHEN ended_at IS NULL THEN state END,
           '(completed)'
         ) AS state,
         COUNT(*)                                        AS conversations,
         COALESCE(ROUND(
           100.0 * COUNT(*) / NULLIF(
             (SELECT COUNT(*) FROM conversations WHERE started_at >= ?1), 0), 1), 0) AS pct_of_total,
         COALESCE(ROUND(AVG(turn_count), 1), 0)          AS avg_turns
       FROM conversations
       WHERE started_at >= ?1
       GROUP BY COALESCE(
         abandoned_at_state,
         CASE WHEN ended_at IS NULL THEN state END,
         '(completed)'
       )
       ORDER BY conversations DESC`,
    )
    .bind(from)
    .all<{ state: string; conversations: number; pct_of_total: number; avg_turns: number }>()

  return results.map((r) => ({
    state: r.state,
    conversations: r.conversations,
    pctOfTotal: r.pct_of_total,
    avgTurns: r.avg_turns,
  }))
}

export interface DailyRow {
  day: string
  conversations: number
  costUsd: number
  tokensIn: number
  tokensOut: number
}

/**
 * Daily spend series.
 *
 * `started_at` is MILLISECONDS, so it must be divided before `unixepoch`, which
 * expects seconds. Without the divide SQLite is handed a year ~58000 and
 * returns NULL for every row — the chart was not merely mislabelled, it was
 * empty, with every bucket keyed `null`.
 */
export async function daily(db: D1Database, from: number): Promise<DailyRow[]> {
  const { results } = await db
    .prepare(
      `SELECT
         date(started_at / 1000, 'unixepoch') AS day,
         COUNT(*)                          AS conversations,
         COALESCE(SUM(cost_usd), 0)        AS cost_usd,
         COALESCE(SUM(tokens_in), 0)       AS tokens_in,
         COALESCE(SUM(tokens_out), 0)      AS tokens_out
       FROM conversations
       WHERE started_at >= ?
       GROUP BY day
       ORDER BY day ASC`,
    )
    .bind(from)
    .all<{ day: string; conversations: number; cost_usd: number; tokens_in: number; tokens_out: number }>()

  return results.map((r) => ({
    day: r.day,
    conversations: r.conversations,
    costUsd: r.cost_usd,
    tokensIn: r.tokens_in,
    tokensOut: r.tokens_out,
  }))
}

export interface EventRow {
  type: string
  count: number
  lastAt: number
}

/**
 * Event types by frequency.
 *
 * This is the surface nothing else had. `recordEvent` writes `llm_failed`,
 * `turn_cap_reached`, `turnstile_failed`, `slots_rejected`, `forced_advance`,
 * `quote_rate_limited`, `estimate_failed` and more — every failure signal the
 * bot emits — and before this the only code touching the table was the
 * deletion path. They were being written and never read.
 */
export async function eventTypes(db: D1Database, from: number): Promise<EventRow[]> {
  const { results } = await db
    .prepare(
      `SELECT type, COUNT(*) AS count, MAX(created_at) AS last_at
       FROM events WHERE created_at >= ?
       GROUP BY type ORDER BY count DESC`,
    )
    .bind(from)
    .all<{ type: string; count: number; last_at: number }>()

  return results.map((r) => ({ type: r.type, count: r.count, lastAt: r.last_at }))
}

export interface EventDetail {
  id: string
  conversationId: string | null
  type: string
  payload: string | null
  createdAt: number
}

export async function recentEvents(
  db: D1Database,
  from: number,
  limit: number,
  type?: string,
): Promise<EventDetail[]> {
  // `type` is bound, and the IS NULL branch makes one statement serve both the
  // filtered and unfiltered case — a second concatenated SQL string is where a
  // filter parameter turns into an injection.
  const { results } = await db
    .prepare(
      `SELECT id, conversation_id, type, payload_json, created_at
       FROM events
       WHERE created_at >= ?1 AND (?2 IS NULL OR type = ?2)
       ORDER BY created_at DESC LIMIT ?3`,
    )
    .bind(from, type && type.length > 0 ? type : null, limit)
    .all<{
      id: string
      conversation_id: string | null
      type: string
      payload_json: string | null
      created_at: number
    }>()

  return results.map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    type: r.type,
    payload: r.payload_json,
    createdAt: r.created_at,
  }))
}

export interface LeadRow {
  id: string
  createdAt: number
  name: string | null
  email: string
  company: string | null
  role: string | null
  country: string | null
  utmSource: string | null
  consent: boolean
  phone: string | null
  /** Needed by the dashboard to open the transcript and the quote artifact.
   *  Null when the lead never reached a brief. */
  conversationId: string | null
  quoteId: string | null
  quotes: number
  lowAud: number
  highAud: number
}

/**
 * Recent leads with their quote totals.
 *
 * Honours the dashboard's time window, which it previously ignored. That gap
 * was not cosmetic: the `overview.leads` TILE has always been windowed, so a
 * lead older than the selected window was counted 0 in the tile while still
 * listed in the table — and the table's empty state read "Nothing in this
 * window", naming a filter that was not being applied. An operator seeing no
 * leads was told to widen a window that would change nothing.
 *
 * Carries personal information — see the note in api/admin.ts about why this
 * endpoint sets no-store.
 */
export async function leads(
  db: D1Database, limit: number, q?: string, from = 0,
): Promise<LeadRow[]> {
  const like = q && q.length > 0 ? `%${q}%` : null
  const { results } = await db
    .prepare(
      `SELECT
         l.id, l.created_at, l.name, l.email, l.company, l.role, l.country,
         l.utm_source, l.consent_marketing, l.phone,
         MAX(c.id)                     AS conversation_id,
         MAX(qt.id)                    AS quote_id,
         COUNT(qt.id)                  AS quotes,
         COALESCE(SUM(qt.low_aud), 0)  AS low_aud,
         COALESCE(SUM(qt.high_aud), 0) AS high_aud
       FROM leads l
       LEFT JOIN conversations c ON c.lead_id = l.id
       LEFT JOIN briefs b        ON b.conversation_id = c.id
       LEFT JOIN quotes qt       ON qt.brief_id = b.id
       WHERE l.created_at >= ?3
         AND (?1 IS NULL
              OR l.email LIKE ?1 OR l.name LIKE ?1 OR l.company LIKE ?1)
       GROUP BY l.id
       ORDER BY l.created_at DESC
       LIMIT ?2`,
    )
    .bind(like, limit, from)
    .all<{
      id: string
      created_at: number
      name: string | null
      email: string
      company: string | null
      role: string | null
      country: string | null
      utm_source: string | null
      consent_marketing: number
      phone: string | null
      conversation_id: string | null
      quote_id: string | null
      quotes: number
      low_aud: number
      high_aud: number
    }>()

  return results.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    name: r.name,
    email: r.email,
    company: r.company,
    role: r.role,
    country: r.country,
    utmSource: r.utm_source,
    consent: r.consent_marketing === 1,
    phone: r.phone,
    conversationId: r.conversation_id,
    quoteId: r.quote_id,
    quotes: r.quotes,
    lowAud: r.low_aud,
    highAud: r.high_aud,
  }))
}

export interface TranscriptTurn {
  seq: number
  role: string
  content: string
  createdAt: number
  offTopic: boolean
}

/**
 * The conversation as the visitor saw it.
 *
 * `messages.content` holds the visitor-facing text — the assistant's `reply`,
 * not the JSON envelope the model emitted (see llm/history for why those are
 * different). That is exactly what a human reviewing a lead wants to read.
 *
 * Carries whatever the visitor typed, so it is personal information: the route
 * exposing it sets no-store and sits behind Access, like the leads endpoint.
 */
export async function transcript(db: D1Database, conversationId: string): Promise<TranscriptTurn[]> {
  const { results } = await db
    .prepare(
      `SELECT seq, role, content, created_at, off_topic
       FROM messages WHERE conversation_id = ? ORDER BY seq ASC`,
    )
    .bind(conversationId)
    .all<{ seq: number; role: string; content: string; created_at: number; off_topic: number }>()

  return results.map((r) => ({
    seq: r.seq,
    role: r.role,
    content: r.content,
    createdAt: r.created_at,
    offTopic: r.off_topic === 1,
  }))
}

/**
 * Leads that exist but fall outside the current window.
 *
 * The number that makes an empty table honest. Without it the dashboard can
 * only say "none", which is indistinguishable from "none ever" — the ambiguity
 * that had this portal reported as broken when it was working.
 */
export async function leadsOutsideWindow(db: D1Database, from: number): Promise<number> {
  if (from <= 0) return 0
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM leads WHERE created_at < ?')
    .bind(from)
    .first<{ n: number }>()
  return row?.n ?? 0
}
