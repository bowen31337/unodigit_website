/**
 * Lead deletion — the Privacy Act path, over HTTP.
 *
 * `db/admin.ts` used to say the destructive path was deliberately NOT exposed
 * over HTTP, "because its safety comes from a confirmation step that means
 * nothing once a browser can issue it". That reasoning was sound and the
 * decision has now been reversed on request, so the safety has to be rebuilt
 * rather than dropped:
 *
 *   - the route is POST, never GET, so no prefetch or crawl can fire it;
 *   - the caller must send back the lead's own email, which the operator has
 *     to read off the row and type — the browser equivalent of the script's
 *     "type the id, not y", and the same anti-reflex property;
 *   - the UI shows the real per-table row counts first, from the same query
 *     that drives the deletion, so the confirmation describes the actual plan
 *     rather than a summary of it.
 *
 * Everything below mirrors scripts/admin/delete-lead.sh, which remains the
 * reference implementation. Divergence between the two is a bug.
 */

export interface LeadDeletionImpact {
  quotes: number
  briefs: number
  messages: number
  events: number
  conversations: number
  leads: number
}

/** Pure SELECT. The dry run and the real run count with the same statement,
 *  so what the operator is shown is the plan, not a description of it. */
export async function leadDeletionImpact(
  db: D1Database, leadId: string,
): Promise<LeadDeletionImpact> {
  const row = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM quotes q
            JOIN briefs b        ON q.brief_id = b.id
            JOIN conversations c ON b.conversation_id = c.id
           WHERE c.lead_id = ?1)                                            AS quotes,
         (SELECT COUNT(*) FROM briefs
           WHERE conversation_id IN (SELECT id FROM conversations WHERE lead_id = ?1)) AS briefs,
         (SELECT COUNT(*) FROM messages
           WHERE conversation_id IN (SELECT id FROM conversations WHERE lead_id = ?1)) AS messages,
         (SELECT COUNT(*) FROM events
           WHERE conversation_id IN (SELECT id FROM conversations WHERE lead_id = ?1)) AS events,
         (SELECT COUNT(*) FROM conversations WHERE lead_id = ?1)            AS conversations,
         (SELECT COUNT(*) FROM leads WHERE id = ?1)                         AS leads`,
    )
    .bind(leadId)
    .first<LeadDeletionImpact>()

  return row ?? { quotes: 0, briefs: 0, messages: 0, events: 0, conversations: 0, leads: 0 }
}

/**
 * Delete a lead and everything derived from it, children before parents.
 *
 * The order is about REACHABILITY, not just foreign keys: once the
 * conversations rows are gone there is no way left to find that lead's
 * messages, briefs or events, and they would be orphaned forever.
 *
 * `rate_limit` and `rate_limit_turns` are deliberately untouched. They are
 * keyed by a salted SHA-256 of an IP, which is not personal information and
 * cannot be reversed to one — and they are the only thing standing between the
 * bot and an unmetered provider bill. If deletion cleared them, "delete my
 * data" would double as a quota reset an abuser could request daily. The
 * lead's own ip_hash lives on the leads row and does go with it.
 *
 * Returns false when the id matches no lead, so a typo cannot be reported back
 * as a completed deletion.
 */
export async function deleteLeadCascade(db: D1Database, leadId: string): Promise<boolean> {
  const before = await leadDeletionImpact(db, leadId)
  if (before.leads !== 1) return false

  const child = 'SELECT id FROM conversations WHERE lead_id = ?'

  // One statement per step, in order. D1 may or may not enforce foreign keys,
  // so correctness cannot depend on the pragma.
  await db
    .prepare(
      `DELETE FROM quotes WHERE brief_id IN (
         SELECT b.id FROM briefs b
         JOIN conversations c ON b.conversation_id = c.id
         WHERE c.lead_id = ?)`,
    )
    .bind(leadId)
    .run()
  await db.prepare(`DELETE FROM briefs WHERE conversation_id IN (${child})`).bind(leadId).run()
  await db.prepare(`DELETE FROM messages WHERE conversation_id IN (${child})`).bind(leadId).run()
  await db.prepare(`DELETE FROM events WHERE conversation_id IN (${child})`).bind(leadId).run()
  await db.prepare('DELETE FROM conversations WHERE lead_id = ?').bind(leadId).run()
  await db.prepare('DELETE FROM leads WHERE id = ?').bind(leadId).run()

  // Log THAT a deletion happened, never WHAT was deleted. No lead id, email,
  // name or conversation id — retaining any of them would defeat the deletion.
  // A compliance question asks whether a request was honoured and when, and
  // that is exactly what this row answers. conversation_id is NULL, which the
  // column allows.
  await db
    .prepare(
      `INSERT INTO events (id, conversation_id, type, payload_json, created_at)
       VALUES (?, NULL, 'lead_deleted', ?, ?)`,
    )
    .bind(
      `evt_${crypto.randomUUID().replace(/-/g, '')}`,
      JSON.stringify({
        source: 'admin dashboard',
        reason: 'privacy_act_deletion_request',
        note: 'subject identifiers intentionally not retained',
        rows: before,
      }),
      Date.now(),
    )
    .run()

  return true
}
