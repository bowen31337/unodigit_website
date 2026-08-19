import { env } from 'cloudflare:workers'
import { describe, it, expect } from 'vitest'
import {
  createConversation,
  insertBrief, insertQuote, getQuoteById, getBriefByConversation,
} from '../../src/db/queries'
import { newId } from '../../src/util/ids'

async function seedBrief(conversationId: string, createdAt: number, markdown: string) {
  const briefId = newId('brief')
  await insertBrief(env.DB, {
    id: briefId,
    conversationId,
    markdown,
    sectionsJson: JSON.stringify({ problem: 'Bookings are handled by phone.' }),
    createdAt,
  })
  return briefId
}

describe('brief persistence', () => {
  it('inserts a brief and reads it back by conversation', async () => {
    const convId = newId('conv')
    await createConversation(env.DB, convId, 1000)
    const briefId = await seedBrief(convId, 1001, '# Project Brief\n\nBookings.')

    const row = await getBriefByConversation(env.DB, convId)
    expect(row).not.toBeNull()
    expect(row!.id).toBe(briefId)
    expect(row!.conversation_id).toBe(convId)
    expect(row!.markdown).toBe('# Project Brief\n\nBookings.')
    expect(JSON.parse(row!.sections_json)).toEqual({ problem: 'Bookings are handled by phone.' })
    expect(row!.created_at).toBe(1001)
  })

  it('returns null for a conversation with no brief', async () => {
    const convId = newId('conv')
    await createConversation(env.DB, convId, 1000)
    expect(await getBriefByConversation(env.DB, convId)).toBeNull()
  })

  it('returns the most recent brief, not the earlier one', async () => {
    const convId = newId('conv')
    await createConversation(env.DB, convId, 1000)
    const oldId = await seedBrief(convId, 1001, '# Older')
    const newestId = await seedBrief(convId, 2002, '# Newest')

    const row = await getBriefByConversation(env.DB, convId)
    expect(row!.id).toBe(newestId)
    expect(row!.id).not.toBe(oldId)
    expect(row!.markdown).toBe('# Newest')
    expect(row!.markdown).not.toBe('# Older')
  })
})

describe('quote persistence', () => {
  it('inserts a program-mode quote and reads it back by id', async () => {
    const convId = newId('conv')
    await createConversation(env.DB, convId, 1000)
    const briefId = await seedBrief(convId, 1001, '# Project Brief')

    const quoteId = newId('quote')
    await insertQuote(env.DB, {
      id: quoteId,
      briefId,
      markdown: '# Indicative Quote\n\nA$14,000-18,500',
      mode: 'program',
      totalTasks: 420,
      weightedTasks: 512.5,
      rateAud: 10,
      lowAud: 3844,
      highAud: 6406,
      weeks: 21,
      confidence: 'medium',
      categoriesJson: JSON.stringify([{ name: 'Backend & Data', bullets: 120 }]),
      subsystemsJson: JSON.stringify([{ name: 'Identity', total_tasks: 200 }]),
      validUntil: 9000,
      createdAt: 1002,
      belowFloor: true, // 512.5 * 10 = 5,125, under the 6,000 floor
    })

    const row = await getQuoteById(env.DB, quoteId)
    expect(row).not.toBeNull()
    expect(row!.id).toBe(quoteId)
    expect(row!.brief_id).toBe(briefId)
    expect(row!.markdown).toBe('# Indicative Quote\n\nA$14,000-18,500')
    expect(row!.mode).toBe('program')
    expect(row!.total_tasks).toBe(420)
    expect(row!.weighted_tasks).toBe(512.5)
    expect(row!.rate_aud).toBe(10)
    expect(row!.low_aud).toBe(3844)
    expect(row!.high_aud).toBe(6406)
    expect(row!.weeks).toBe(21)
    expect(row!.confidence).toBe('medium')
    expect(JSON.parse(row!.categories_json)).toEqual([{ name: 'Backend & Data', bullets: 120 }])
    expect(JSON.parse(row!.subsystems_json!)).toEqual([{ name: 'Identity', total_tasks: 200 }])
    expect(row!.valid_until).toBe(9000)
    expect(row!.created_at).toBe(1002)
    expect(row!.below_floor).toBe(1)
  })

  it('round-trips subsystems_json as null in single mode', async () => {
    const convId = newId('conv')
    await createConversation(env.DB, convId, 1000)
    const briefId = await seedBrief(convId, 1001, '# Project Brief')

    const quoteId = newId('quote')
    await insertQuote(env.DB, {
      id: quoteId,
      briefId,
      markdown: '# Indicative Quote',
      mode: 'single',
      totalTasks: 137,
      weightedTasks: 150,
      rateAud: 10,
      lowAud: 1125,
      highAud: 1875,
      weeks: 6,
      confidence: 'high',
      categoriesJson: JSON.stringify([{ name: 'UI/UX', bullets: 40 }]),
      subsystemsJson: null,
      validUntil: 9000,
      createdAt: 1002,
      belowFloor: false, // arbitrary — this test doesn't assert on belowFloor
    })

    const row = await getQuoteById(env.DB, quoteId)
    expect(row!.subsystems_json).toBeNull()
    expect(row!.subsystems_json).not.toBe('null')
    expect(row!.subsystems_json).not.toBe('[]')
    expect(typeof row!.subsystems_json).toBe('object')
  })

  it('returns null for an unknown quote id', async () => {
    expect(await getQuoteById(env.DB, 'quote_missing')).toBeNull()
  })

  it('rejects a quote whose brief_id does not exist (foreign keys are enforced)', async () => {
    let caught: unknown
    try {
      await insertQuote(env.DB, {
        id: newId('quote'),
        briefId: 'brief_does_not_exist',
        markdown: '# Orphan',
        mode: 'single',
        totalTasks: 100,
        weightedTasks: 110,
        rateAud: 10,
        lowAud: 825,
        highAud: 1375,
        weeks: 5,
        confidence: 'high',
        categoriesJson: '[]',
        subsystemsJson: null,
        validUntil: 9000,
        createdAt: 1002,
        belowFloor: false, // arbitrary — this insert is expected to throw before persisting
      })
    } catch (e) {
      caught = e
    }

    expect(caught).toBeInstanceOf(Error)
    expect(String((caught as Error).message)).toMatch(/FOREIGN KEY constraint failed/)

    const { results } = await env.DB
      .prepare('SELECT id FROM quotes WHERE brief_id = ?')
      .bind('brief_does_not_exist')
      .all<{ id: string }>()
    expect(results).toHaveLength(0)
  })
})
