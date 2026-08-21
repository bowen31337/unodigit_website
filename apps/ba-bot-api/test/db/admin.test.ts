import { env } from 'cloudflare:workers'
import { describe, it, expect, beforeAll } from 'vitest'
import { since, overview, funnel, daily, leads, transcript } from '../../src/db/admin'
import { appendMessageAtNextSeq, createConversation, insertLead } from '../../src/db/queries'
import { newId } from '../../src/util/ids'

const DAY = 86_400_000
const NOW = 1_787_231_034_416 // fixed; Date.now() would make windows flaky

/** Every timestamp column in this schema is written from Date.now(), i.e.
 *  milliseconds. These fixtures use the same unit deliberately — the bug this
 *  file exists for was a seconds/milliseconds mismatch. */
async function conversation(o: {
  startedAt: number; state: string; endedAt?: number | null
  abandonedAt?: string | null; turns?: number; leadId?: string | null
}): Promise<string> {
  const id = newId('conv')
  await createConversation(env.DB, id, o.startedAt)
  await env.DB
    .prepare('UPDATE conversations SET state=?, ended_at=?, abandoned_at_state=?, turn_count=?, lead_id=? WHERE id=?')
    .bind(o.state, o.endedAt ?? null, o.abandonedAt ?? null, o.turns ?? 1, o.leadId ?? null, id)
    .run()
  return id
}

describe('since', () => {
  // The bug: this returned seconds while every column stores milliseconds, so
  // `created_at >= since(7)` compared ~1.79e12 against ~1.79e9 and was always
  // true. Every window silently returned all time.
  it('returns a millisecond bound, matching the columns it is compared against', () => {
    expect(since(7, NOW)).toBe(NOW - 7 * DAY)
  })

  it('is within the range of real stored timestamps, not 1000x below them', () => {
    // A seconds bound would be ~1.79e9; a real row is ~1.79e12.
    expect(since(30, NOW)).toBeGreaterThan(1e12)
  })

  it('treats a non-positive or non-finite window as all time', () => {
    for (const d of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(since(d, NOW)).toBe(0)
    }
  })
})

describe('admin aggregates', () => {
  beforeAll(async () => {
    await env.DB.prepare('DELETE FROM quotes').run()
    await env.DB.prepare('DELETE FROM briefs').run()
    await env.DB.prepare('DELETE FROM events').run()
    await env.DB.prepare('DELETE FROM messages').run()
    await env.DB.prepare('DELETE FROM conversations').run()
    await env.DB.prepare('DELETE FROM leads').run()

    // Two inside a 7-day window, one well outside it.
    await conversation({ startedAt: NOW - 1 * DAY, state: 'GREETING', turns: 1 })
    await conversation({ startedAt: NOW - 2 * DAY, state: 'PROJECT_IDENTITY', turns: 3 })
    await conversation({
      startedAt: NOW - 40 * DAY, state: 'DONE',
      endedAt: NOW - 40 * DAY, abandonedAt: null, turns: 9,
    })
  })

  it('excludes rows outside the window — the whole point of the unit fix', async () => {
    const o = await overview(env.DB, since(7, NOW))
    expect(o.conversations).toBe(2)

    const all = await overview(env.DB, since(0, NOW))
    expect(all.conversations).toBe(3)
  })

  // Reported symptom: 30 conversations, 0 completed and 0 abandoned, which
  // reads as "nothing to see". They were unfinished — a third state that was
  // not being counted at all.
  it('counts an unfinished conversation as neither completed nor abandoned', async () => {
    const o = await overview(env.DB, since(7, NOW))
    expect(o.completed).toBe(0)
    expect(o.abandoned).toBe(0)
    expect(o.unfinished).toBe(2)
  })

  it('counts a genuinely finished conversation as completed', async () => {
    const all = await overview(env.DB, since(0, NOW))
    expect(all.completed).toBe(1)
    expect(all.unfinished).toBe(2)
  })

  // Bucketing on abandoned_at_state alone put every unfinished conversation in
  // one "(not abandoned)" row at 100%, hiding where visitors actually stop.
  it('buckets unfinished conversations by the state they stopped in', async () => {
    const rows = await funnel(env.DB, since(7, NOW))
    const byState = Object.fromEntries(rows.map((r) => [r.state, r.conversations]))

    expect(byState['GREETING']).toBe(1)
    expect(byState['PROJECT_IDENTITY']).toBe(1)
    expect(byState['(not abandoned)']).toBeUndefined()
  })

  it('labels a finished conversation as completed rather than by its state', async () => {
    const rows = await funnel(env.DB, since(0, NOW))
    expect(rows.map((r) => r.state)).toContain('(completed)')
  })

  // date(ms,'unixepoch') is out of range and returns NULL, so every bucket key
  // was null and the chart drew nothing.
  it('produces real calendar days, not nulls', async () => {
    const rows = await daily(env.DB, since(7, NOW))

    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})

describe('leads listing', () => {
  it('returns a recorded lead, with its quote totals defaulting to zero', async () => {
    await env.DB.prepare('DELETE FROM leads').run()
    const id = newId('lead')
    await insertLead(env.DB, {
      id, createdAt: NOW - DAY, name: 'Test Person', email: 'lead@example.com',
      company: 'Acme', role: 'CTO', phone: '+61 400 000 000', ipHash: 'h', country: 'AU', asn: null,
      userAgent: null, utmSource: null, utmMedium: null, utmCampaign: null,
      referrer: null, landingPage: null, consentMarketing: true, consentTs: NOW - DAY,
    })

    const rows = await leads(env.DB, 20)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.email).toBe('lead@example.com')
    expect(rows[0]!.consent).toBe(true)
    expect(rows[0]!.quotes).toBe(0)
  })
})

describe('transcript', () => {
  it('returns the conversation in sequence order, as the visitor saw it', async () => {
    const id = newId('conv')
    await createConversation(env.DB, id, NOW)
    await appendMessageAtNextSeq(env.DB, {
      id: newId('msg'), conversationId: id, role: 'user',
      content: 'We need stock tracking', slotsJson: null, offTopic: false, createdAt: NOW,
    })
    await appendMessageAtNextSeq(env.DB, {
      id: newId('msg'), conversationId: id, role: 'assistant',
      content: 'Who will use it day to day?', slotsJson: '{}', offTopic: false,
      readyToAdvance: true, createdAt: NOW,
    })

    const turns = await transcript(env.DB, id)

    expect(turns.map((t) => t.role)).toEqual(['user', 'assistant'])
    // The visitor-facing reply, not the JSON envelope the model emitted.
    expect(turns[1]!.content).toBe('Who will use it day to day?')
    expect(turns[0]!.seq).toBeLessThan(turns[1]!.seq)
  })

  // An unknown id must not be distinguishable from a real one with no messages:
  // the endpoint would otherwise confirm which conversation ids exist.
  it('returns an empty array for an unknown conversation', async () => {
    expect(await transcript(env.DB, 'conv_does_not_exist')).toEqual([])
  })
})
