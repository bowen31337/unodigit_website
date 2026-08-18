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
  createdAt: number
}

export interface LeadInsert {
  id: string
  createdAt: number
  name: string | null
  email: string
  company: string | null
  role: string | null
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
      `INSERT INTO messages (id, conversation_id, seq, role, content, slots_json, off_topic, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id, row.conversationId, row.seq, row.role, row.content,
      row.slotsJson, row.offTopic ? 1 : 0, row.createdAt,
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
      `INSERT INTO messages (id, conversation_id, seq, role, content, slots_json, off_topic, created_at)
       SELECT ?, ?, COALESCE(MAX(seq), 0) + 1, ?, ?, ?, ?, ?
       FROM messages WHERE conversation_id = ?
       RETURNING seq`,
    )
    .bind(
      row.id, row.conversationId, row.role, row.content,
      row.slotsJson, row.offTopic ? 1 : 0, row.createdAt, row.conversationId,
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
         id, created_at, name, email, company, role, ip_hash, country, asn, user_agent,
         utm_source, utm_medium, utm_campaign, referrer, landing_page, consent_marketing, consent_ts
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      row.id, row.createdAt, row.name, row.email, row.company, row.role,
      row.ipHash, row.country, row.asn, row.userAgent, row.utmSource, row.utmMedium,
      row.utmCampaign, row.referrer, row.landingPage, row.consentMarketing ? 1 : 0, row.consentTs,
    )
    .run()
  return row.id
}
