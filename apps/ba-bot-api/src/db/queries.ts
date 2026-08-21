export interface ConversationRow {
  id: string
  lead_id: string | null
  started_at: number
  ended_at: number | null
  state: string
  turn_count: number
  tokens_in: number
  tokens_out: number
  cost_usd: number
  abandoned_at_state: string | null
}

export interface MessageRow {
  id: string
  conversation_id: string
  seq: number
  role: string
  content: string
  slots_json: string | null
  off_topic: number
  /** Optional because it arrives in migration 0004: a row written before that
   *  has no such column, and `SELECT *` simply omits the key. */
  ready_to_advance?: number
  created_at: number
}

export interface MessageInsert {
  id: string
  conversationId: string
  seq: number
  role: 'user' | 'assistant'
  content: string
  slotsJson: string | null
  offTopic: boolean
  /** Assistant rows only — it is one of the four keys the model must emit, and
   *  llm/history replays it. A user row never advances anything, so it is
   *  optional and defaults to false. */
  readyToAdvance?: boolean
  createdAt: number
}

export interface LeadInsert {
  id: string
  createdAt: number
  name: string | null
  email: string
  company: string | null
  role: string | null
  /** Optional mobile (migration 0005). */
  phone: string | null
  ipHash: string
  country: string | null
  asn: string | null
  userAgent: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  referrer: string | null
  landingPage: string | null
  consentMarketing: boolean
  consentTs: number | null
}

export async function createConversation(db: D1Database, id: string, now: number): Promise<void> {
  await db
    .prepare('INSERT INTO conversations (id, started_at, state, turn_count) VALUES (?, ?, ?, 0)')
    .bind(id, now, 'GREETING')
    .run()
}

export async function getConversation(db: D1Database, id: string): Promise<ConversationRow | null> {
  return await db
    .prepare('SELECT * FROM conversations WHERE id = ?')
    .bind(id)
    .first<ConversationRow>()
}

export async function updateConversationState(
  db: D1Database, id: string, state: string, turnCount: number,
): Promise<void> {
  await db
    .prepare('UPDATE conversations SET state = ?, turn_count = ? WHERE id = ?')
    .bind(state, turnCount, id)
    .run()
}

export async function appendMessage(db: D1Database, row: MessageInsert): Promise<void> {
  await db
    .prepare(
      `INSERT INTO messages (id, conversation_id, seq, role, content, slots_json, off_topic, ready_to_advance, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id, row.conversationId, row.seq, row.role, row.content,
      row.slotsJson, row.offTopic ? 1 : 0, row.readyToAdvance ? 1 : 0, row.createdAt,
    )
    .run()
}

/** Append a message, choosing `seq` inside the INSERT itself.
 *
 * Computing `seq` in the Worker (read length, await the LLM, then insert) lets
 * two concurrent turns on one conversation pick the same number and collide on
 * `idx_messages_conv_seq`. SQLite evaluates the sub-select and the insert as a
 * single serialised statement, so concurrent callers get distinct numbers.
 * Returns the seq that was actually written. */
export async function appendMessageAtNextSeq(
  db: D1Database, row: Omit<MessageInsert, 'seq'>,
): Promise<number> {
  const inserted = await db
    .prepare(
      `INSERT INTO messages (id, conversation_id, seq, role, content, slots_json, off_topic, ready_to_advance, created_at)
       SELECT ?, ?, COALESCE(MAX(seq), 0) + 1, ?, ?, ?, ?, ?, ?
       FROM messages WHERE conversation_id = ?
       RETURNING seq`,
    )
    .bind(
      row.id, row.conversationId, row.role, row.content,
      row.slotsJson, row.offTopic ? 1 : 0, row.readyToAdvance ? 1 : 0,
      row.createdAt, row.conversationId,
    )
    .first<{ seq: number }>()
  return inserted!.seq
}

export async function listMessages(db: D1Database, conversationId: string): Promise<MessageRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY seq ASC')
    .bind(conversationId)
    .all<MessageRow>()
  return results
}

export async function recordEvent(
  db: D1Database, conversationId: string | null, type: string, payload: unknown,
): Promise<void> {
  await db
    .prepare('INSERT INTO events (id, conversation_id, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(
      `evt_${crypto.randomUUID().replace(/-/g, '')}`,
      conversationId, type, JSON.stringify(payload ?? null), Date.now(),
    )
    .run()
}

export async function insertLead(db: D1Database, row: LeadInsert): Promise<string> {
  await db
    .prepare(
      `INSERT INTO leads (
         id, created_at, name, email, company, role, phone, ip_hash, country, asn, user_agent,
         utm_source, utm_medium, utm_campaign, referrer, landing_page, consent_marketing, consent_ts
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      row.id, row.createdAt, row.name, row.email, row.company, row.role, row.phone,
      row.ipHash, row.country, row.asn, row.userAgent, row.utmSource, row.utmMedium,
      row.utmCampaign, row.referrer, row.landingPage, row.consentMarketing ? 1 : 0, row.consentTs,
    )
    .run()
  return row.id
}

export interface BriefRow {
  id: string
  conversation_id: string
  markdown: string
  sections_json: string
  created_at: number
}

export interface QuoteRow {
  id: string
  brief_id: string
  markdown: string
  mode: string
  total_tasks: number
  weighted_tasks: number
  rate_aud: number
  low_aud: number
  high_aud: number
  weeks: number
  confidence: string
  categories_json: string
  subsystems_json: string | null
  valid_until: number
  created_at: number
  // Appended by migration 0003 — ALTER TABLE puts new columns after every
  // existing one, so this is physically last in the row too, not adjacent to
  // its logical siblings above. INTEGER 0/1, matching this schema's boolean
  // convention (see leads.consent_marketing, messages.off_topic).
  below_floor: number
}

export interface BriefInsert {
  id: string
  conversationId: string
  markdown: string
  sectionsJson: string
  createdAt: number
}

export interface QuoteInsert {
  id: string
  briefId: string
  markdown: string
  mode: string
  totalTasks: number
  weightedTasks: number
  rateAud: number
  lowAud: number
  highAud: number
  weeks: number
  confidence: string
  categoriesJson: string
  subsystemsJson: string | null
  validUntil: number
  createdAt: number
  // The pricing verdict at write time. Stored, not re-derived on read — see
  // migrations/0003_quotes_below_floor.sql.
  belowFloor: boolean
}

export async function insertBrief(db: D1Database, row: BriefInsert): Promise<void> {
  await db
    .prepare(
      `INSERT INTO briefs (id, conversation_id, markdown, sections_json, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(row.id, row.conversationId, row.markdown, row.sectionsJson, row.createdAt)
    .run()
}

// 16 columns / 16 placeholders / 16 binds. Count all three before changing this:
// every value is string|number, so a transposition type-checks, passes any test
// that does not assert the swapped fields, and silently corrupts every quote.
export async function insertQuote(db: D1Database, row: QuoteInsert): Promise<void> {
  await db
    .prepare(
      `INSERT INTO quotes (
         id, brief_id, markdown, mode, total_tasks, weighted_tasks, rate_aud,
         low_aud, high_aud, weeks, confidence, categories_json, subsystems_json,
         valid_until, created_at, below_floor
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      row.id, row.briefId, row.markdown, row.mode, row.totalTasks,
      row.weightedTasks, row.rateAud, row.lowAud, row.highAud, row.weeks,
      row.confidence, row.categoriesJson, row.subsystemsJson, row.validUntil,
      row.createdAt, row.belowFloor ? 1 : 0,
    )
    .run()
}

export async function getQuoteById(db: D1Database, id: string): Promise<QuoteRow | null> {
  return await db.prepare('SELECT * FROM quotes WHERE id = ?').bind(id).first<QuoteRow>()
}

export async function getBriefByConversation(
  db: D1Database,
  conversationId: string,
): Promise<BriefRow | null> {
  return await db
    .prepare('SELECT * FROM briefs WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1')
    .bind(conversationId)
    .first<BriefRow>()
}

/* `getLeadEmailByConversation` used to live here: the one read of `leads.email`
 * outside the contact route, existing solely to address the quote email. Email
 * delivery was decommissioned in US-010 and the function went with it, on
 * purpose rather than as tidying. Australian Privacy Act APP 8 is best served by
 * an address that cannot be read at all: with no accessor, `leads.email` is now
 * structurally incapable of reaching src/llm/, src/graph/prompts.ts,
 * src/estimator/, the renderers, or any event payload during generation. If a
 * future story genuinely needs it, add it back deliberately — do not widen an
 * existing lead query to smuggle it. */
