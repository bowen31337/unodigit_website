import { env } from 'cloudflare:workers'
import { describe, it, expect, beforeAll } from 'vitest'
import {
  since, overview, funnel, daily, leads, transcript, leadsOutsideWindow, modelUsage,
} from '../../src/db/admin'
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

describe('leads window', () => {
  // The tile has always been windowed and the table was not, so a lead older
  // than the selected range was counted 0 in the tile while still listed in
  // the table — under an empty-state that read "Nothing in this window",
  // naming a filter that was not being applied.
  async function seedLead(id: string, createdAt: number, email: string) {
    await insertLead(env.DB, {
      id, createdAt, name: null, email, company: null, role: null, phone: null,
      ipHash: 'h', country: null, asn: null, userAgent: null, utmSource: null,
      utmMedium: null, utmCampaign: null, referrer: null, landingPage: null,
      consentMarketing: true, consentTs: createdAt,
    })
  }

  beforeAll(async () => {
    await env.DB.prepare('DELETE FROM leads').run()
    await seedLead(newId('lead'), NOW - 2 * DAY, 'recent@example.com')
    await seedLead(newId('lead'), NOW - 45 * DAY, 'ancient@example.com')
  })

  it('excludes a lead older than the window', async () => {
    const rows = await leads(env.DB, 50, undefined, since(7, NOW))
    expect(rows.map((r) => r.email)).toEqual(['recent@example.com'])
  })

  it('includes everything when the window is all time', async () => {
    const rows = await leads(env.DB, 50, undefined, since(0, NOW))
    expect(rows).toHaveLength(2)
  })

  it('agrees with the overview tile for the same window', async () => {
    const from = since(7, NOW)
    const rows = await leads(env.DB, 50, undefined, from)
    const o = await overview(env.DB, from)
    expect(rows).toHaveLength(o.leads)
  })

  // The number that makes an empty table honest: "none in this window, N
  // older" rather than a bare "none", which reads as "none ever".
  it('counts the leads that fall outside the window', async () => {
    expect(await leadsOutsideWindow(env.DB, since(7, NOW))).toBe(1)
    expect(await leadsOutsideWindow(env.DB, since(0, NOW))).toBe(0)
  })
})

describe('lead attribution surfaced to the dashboard', () => {
  // "direct" in the Source column only means "no UTM tags". Without the
  // referrer beside it, a typed URL and an untagged LinkedIn click are
  // indistinguishable — which is the whole reason social traffic looked like
  // direct traffic.
  it('returns the referrer and all three UTM fields, not just the source', async () => {
    await env.DB.prepare('DELETE FROM leads').run()
    await insertLead(env.DB, {
      id: newId('lead'), createdAt: NOW - DAY, name: null, email: 'social@example.com',
      company: null, role: null, phone: null, ipHash: 'h', country: null, asn: null,
      userAgent: null, utmSource: 'linkedin', utmMedium: 'social', utmCampaign: 'launch',
      referrer: 'https://www.linkedin.com/feed/', landingPage: 'https://www.unodigit.com.au/',
      consentMarketing: true, consentTs: NOW - DAY,
    })

    const [row] = await leads(env.DB, 10, undefined, since(0, NOW))

    expect(row!.utmSource).toBe('linkedin')
    expect(row!.utmMedium).toBe('social')
    expect(row!.utmCampaign).toBe('launch')
    expect(row!.referrer).toBe('https://www.linkedin.com/feed/')
  })

  it('reports a null referrer for a genuinely direct lead', async () => {
    await env.DB.prepare('DELETE FROM leads').run()
    await insertLead(env.DB, {
      id: newId('lead'), createdAt: NOW - DAY, name: null, email: 'typed@example.com',
      company: null, role: null, phone: null, ipHash: 'h', country: null, asn: null,
      userAgent: null, utmSource: null, utmMedium: null, utmCampaign: null,
      referrer: null, landingPage: 'https://www.unodigit.com.au/',
      consentMarketing: true, consentTs: NOW - DAY,
    })

    const [row] = await leads(env.DB, 10, undefined, since(0, NOW))
    expect(row!.utmSource).toBeNull()
    expect(row!.referrer).toBeNull()
  })
})

describe('industry on the lead row', () => {
  it('surfaces the sector recorded against the conversation', async () => {
    for (const t of ['quotes', 'briefs', 'messages', 'conversations', 'leads']) {
      await env.DB.prepare(`DELETE FROM ${t}`).run()
    }
    const leadId = newId('lead')
    const convId = newId('conv')
    await insertLead(env.DB, {
      id: leadId, createdAt: NOW - DAY, name: null, email: 'builder@example.com',
      company: null, role: null, phone: null, ipHash: 'h', country: null, asn: null,
      userAgent: null, utmSource: null, utmMedium: null, utmCampaign: null,
      referrer: null, landingPage: null, consentMarketing: true, consentTs: NOW - DAY,
    })
    await createConversation(env.DB, convId, NOW - DAY)
    await env.DB
      .prepare('UPDATE conversations SET lead_id = ?, industry = ? WHERE id = ?')
      .bind(leadId, 'construction', convId).run()

    const [row] = await leads(env.DB, 10, undefined, since(0, NOW))
    expect(row!.industry).toBe('construction')
  })

  // Every conversation from before migration 0006 has none, and the column
  // must read as absent rather than break the row.
  it('reports null for a conversation that never recorded one', async () => {
    await env.DB.prepare('UPDATE conversations SET industry = NULL').run()
    const [row] = await leads(env.DB, 10, undefined, since(0, NOW))
    expect(row!.industry).toBeNull()
  })
})

describe('modelUsage', () => {
  // conversations.tokens_in/out sums every call into one pair of counters, so
  // it can answer neither "what is the estimator costing" nor "is the prefix
  // cache working". This is why the table exists.
  beforeAll(async () => {
    await env.DB.prepare('DELETE FROM llm_usage').run()
    const rows: Array<[string, string, number, number, number, number]> = [
      ['deepseek-v4-flash', 'chat', 1000, 800, 120, NOW - DAY],
      ['deepseek-v4-flash', 'chat', 1200, 900, 140, NOW - DAY],
      ['deepseek-v4-pro', 'estimate', 900, 0, 4200, NOW - DAY],
      ['deepseek-v4-flash', 'chat', 500, 400, 60, NOW - 60 * DAY], // outside 7d
    ]
    for (const [model, purpose, p, cached, comp, at] of rows) {
      await env.DB
        .prepare(`INSERT INTO llm_usage
          (id, conversation_id, model, purpose, prompt_tokens, cached_tokens, completion_tokens, created_at)
          VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`)
        .bind(newId('usg'), model, purpose, p, cached, comp, at)
        .run()
    }
  })

  it('splits usage by model and purpose', async () => {
    const rows = await modelUsage(env.DB, since(7, NOW))
    const chat = rows.find((r) => r.purpose === 'chat')!
    const est = rows.find((r) => r.purpose === 'estimate')!

    expect(chat.model).toBe('deepseek-v4-flash')
    expect(chat.calls).toBe(2)
    expect(chat.promptTokens).toBe(2200)
    expect(chat.cachedTokens).toBe(1700)
    expect(est.model).toBe('deepseek-v4-pro')
    expect(est.completionTokens).toBe(4200)
  })

  it('honours the window', async () => {
    const week = await modelUsage(env.DB, since(7, NOW))
    const all = await modelUsage(env.DB, since(0, NOW))
    expect(week.find((r) => r.purpose === 'chat')!.calls).toBe(2)
    expect(all.find((r) => r.purpose === 'chat')!.calls).toBe(3)
  })

  // cached_tokens is a SUBSET of prompt_tokens, so a hit rate is
  // cached/prompt. Asserting the invariant keeps the dashboard's percentage
  // honest if the provider mapping ever changes.
  it('keeps cached tokens within prompt tokens', async () => {
    for (const r of await modelUsage(env.DB, since(0, NOW))) {
      expect(r.cachedTokens).toBeLessThanOrEqual(r.promptTokens)
    }
  })
})
