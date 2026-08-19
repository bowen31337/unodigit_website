import { env } from 'cloudflare:workers'
import { describe, it, expect } from 'vitest'
import { quoteFromRow } from '../../src/api/generate'
import { createConversation, insertBrief, insertQuote, getQuoteById } from '../../src/db/queries'
import { newId } from '../../src/util/ids'

/** conversation -> brief -> quote. D1 enforces foreign keys, so a brief must
 *  exist before a quote can reference it. */
async function seedQuoteRow(overrides: {
  weightedTasks: number
  rateAud: number
  belowFloor: boolean
}): Promise<string> {
  const conversationId = newId('conv')
  await createConversation(env.DB, conversationId, Date.now())

  const briefId = newId('brief')
  await insertBrief(env.DB, {
    id: briefId,
    conversationId,
    markdown: '# Project Brief',
    sectionsJson: '{}',
    createdAt: Date.now(),
  })

  const quoteId = newId('quote')
  await insertQuote(env.DB, {
    id: quoteId,
    briefId,
    markdown: '# Indicative Quote',
    mode: 'single',
    totalTasks: 100,
    weightedTasks: overrides.weightedTasks,
    rateAud: overrides.rateAud,
    lowAud: 1000,
    highAud: 2000,
    weeks: 5,
    confidence: 'high',
    categoriesJson: '[]',
    subsystemsJson: null,
    validUntil: Date.now() + 86_400_000,
    createdAt: Date.now(),
    belowFloor: overrides.belowFloor,
  })

  return quoteId
}

describe('below_floor persistence — quoteFromRow reads the stored verdict, never re-derives it', () => {
  it('round-trips belowFloor:true for a quote priced under the floor', async () => {
    // 50 * 10 = 500, well under any plausible floor.
    const id = await seedQuoteRow({ weightedTasks: 50, rateAud: 10, belowFloor: true })
    const row = await getQuoteById(env.DB, id)
    expect(quoteFromRow(row!).belowFloor).toBe(true)
  })

  it('round-trips belowFloor:false for a quote priced above the floor', async () => {
    // 1000 * 100 = 100,000, well above any plausible floor.
    const id = await seedQuoteRow({ weightedTasks: 1000, rateAud: 100, belowFloor: false })
    const row = await getQuoteById(env.DB, id)
    expect(quoteFromRow(row!).belowFloor).toBe(false)
  })

  /**
   * THE REGRESSION TEST.
   *
   * `weighted_tasks * rate_aud` here is 100,000 — nowhere near the CURRENT
   * MINIMUM_ENGAGEMENT_AUD (6000, wrangler.toml, read via `env` below). If
   * `quoteFromRow` re-derived the verdict from the current live env var (the
   * pre-fix behaviour), it would recompute `100000 < 6000 = false` — directly
   * CONTRADICTING the `belowFloor: true` that was actually rendered into the
   * stored markdown and already emailed to the client under whatever floor
   * was in effect when this row was written.
   *
   * The stored column is the only way to avoid that: a quote is written once,
   * under whatever MINIMUM_ENGAGEMENT_AUD was live at the time, and every
   * later read — including one after that env var has since changed — must
   * return exactly the verdict that was stored, never one recomputed against
   * whatever the var happens to hold today.
   */
  it('returns the STORED belowFloor verdict even though re-deriving under the CURRENT minimum would disagree', async () => {
    const id = await seedQuoteRow({ weightedTasks: 1000, rateAud: 100, belowFloor: true })
    const row = await getQuoteById(env.DB, id)

    // Prove this assertion is not vacuous: naive re-derivation under the
    // CURRENT env minimum genuinely disagrees with what was stored.
    const currentMinimum = Number(env.MINIMUM_ENGAGEMENT_AUD)
    const wouldRederiveTo = row!.weighted_tasks * row!.rate_aud < currentMinimum
    expect(wouldRederiveTo).toBe(false)

    expect(quoteFromRow(row!).belowFloor).toBe(true)
  })
})
