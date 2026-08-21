import { env } from 'cloudflare:workers'
import { describe, it, expect, beforeEach } from 'vitest'
import { deleteLeadCascade, leadDeletionImpact } from '../../src/db/delete-lead'
import {
  appendMessageAtNextSeq, createConversation, insertBrief, insertLead,
  insertQuote, recordEvent,
} from '../../src/db/queries'
import { newId } from '../../src/util/ids'

const NOW = 1_787_300_000_000

/** A lead with the full tree beneath it: conversation, messages, brief, quote,
 *  event — every table delete-lead.sh walks. */
async function seedFullLead(): Promise<{ leadId: string; convId: string }> {
  const leadId = newId('lead')
  const convId = newId('conv')
  const briefId = newId('brief')

  await insertLead(env.DB, {
    id: leadId, createdAt: NOW, name: 'Doomed', email: 'doomed@example.com',
    company: null, role: null, phone: '+61 400 000 000', ipHash: 'h', country: null,
    asn: null, userAgent: null, utmSource: null, utmMedium: null, utmCampaign: null,
    referrer: null, landingPage: null, consentMarketing: true, consentTs: NOW,
  })
  await createConversation(env.DB, convId, NOW)
  await env.DB.prepare('UPDATE conversations SET lead_id = ? WHERE id = ?').bind(leadId, convId).run()
  await appendMessageAtNextSeq(env.DB, {
    id: newId('msg'), conversationId: convId, role: 'user', content: 'hello',
    slotsJson: null, offTopic: false, createdAt: NOW,
  })
  await recordEvent(env.DB, convId, 'forced_advance', { state: 'GREETING' })
  await insertBrief(env.DB, {
    id: briefId, conversationId: convId, markdown: '# b', sectionsJson: '{}', createdAt: NOW,
  })
  await insertQuote(env.DB, {
    id: newId('quote'), briefId, markdown: '# q', mode: 'single', totalTasks: 10,
    weightedTasks: 10, rateAud: 10, lowAud: 100, highAud: 200, weeks: 1,
    confidence: 'medium', categoriesJson: '[]', subsystemsJson: null,
    validUntil: NOW, createdAt: NOW, belowFloor: false,
  })
  return { leadId, convId }
}

describe('deleteLeadCascade', () => {
  beforeEach(async () => {
    for (const t of ['quotes', 'briefs', 'messages', 'events', 'conversations', 'leads']) {
      await env.DB.prepare(`DELETE FROM ${t}`).run()
    }
    await env.DB.prepare('DELETE FROM rate_limit').run()
  })

  it('counts every table before deleting anything', async () => {
    const { leadId } = await seedFullLead()
    const impact = await leadDeletionImpact(env.DB, leadId)

    expect(impact).toEqual({
      quotes: 1, briefs: 1, messages: 1, events: 1, conversations: 1, leads: 1,
    })
    // A dry run must not have deleted anything.
    expect((await leadDeletionImpact(env.DB, leadId)).leads).toBe(1)
  })

  // Children before parents, for reachability: once the conversation is gone
  // there is no way left to find its messages, briefs or events, and they
  // would be orphaned forever.
  it('removes the whole tree, leaving nothing orphaned', async () => {
    const { leadId, convId } = await seedFullLead()

    expect(await deleteLeadCascade(env.DB, leadId)).toBe(true)

    const after = await leadDeletionImpact(env.DB, leadId)
    expect(after).toEqual({
      quotes: 0, briefs: 0, messages: 0, events: 0, conversations: 0, leads: 0,
    })

    // Asserted directly too: the impact query joins through conversations, so
    // once those are gone it would report 0 whether or not the rows survived.
    const orphans = await env.DB
      .prepare('SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?')
      .bind(convId).first<{ n: number }>()
    expect(orphans!.n).toBe(0)
  })

  // Salted hashes are not personal information, and clearing them would turn
  // "delete my data" into a rate-limit reset an abuser could request daily.
  it('leaves the rate-limit counters intact', async () => {
    const { leadId } = await seedFullLead()
    await env.DB
      .prepare('INSERT INTO rate_limit (ip_hash, day, quote_count) VALUES (?, ?, 1)')
      .bind('some-hash', '2026-08-21').run()

    await deleteLeadCascade(env.DB, leadId)

    const rl = await env.DB.prepare('SELECT COUNT(*) AS n FROM rate_limit').first<{ n: number }>()
    expect(rl!.n).toBe(1)
  })

  it('records that a deletion happened without retaining who it was', async () => {
    const { leadId, convId } = await seedFullLead()
    await deleteLeadCascade(env.DB, leadId)

    const ev = await env.DB
      .prepare("SELECT payload_json, conversation_id FROM events WHERE type = 'lead_deleted'")
      .first<{ payload_json: string; conversation_id: string | null }>()

    expect(ev).not.toBeNull()
    expect(ev!.conversation_id).toBeNull()
    // The audit row answers "was a request honoured, and when" — it must not
    // answer "for whom", or it defeats the deletion it records.
    expect(ev!.payload_json).not.toContain(leadId)
    expect(ev!.payload_json).not.toContain(convId)
    expect(ev!.payload_json).not.toContain('doomed@example.com')
    expect(ev!.payload_json).toContain('privacy_act_deletion_request')
  })

  // A typo must not be reported back to a requester as a completed deletion.
  it('returns false for an unknown lead id', async () => {
    expect(await deleteLeadCascade(env.DB, 'lead_nope')).toBe(false)
  })
})
