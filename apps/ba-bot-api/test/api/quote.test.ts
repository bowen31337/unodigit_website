import { env, exports } from 'cloudflare:workers'
import { describe, it, expect } from 'vitest'
import { QuoteSchema } from '@unodigit/ba-bot-contract'
import { createConversation, insertBrief, insertQuote } from '../../src/db/queries'
import { signId } from '../../src/util/sign'
import { newId } from '../../src/util/ids'

const OTHER_KEY = 'not-the-key-that-this-worker-was-configured-with-0123456789abcdef'

const MARKDOWN = '# Quote — PawBook\n\n~137 tasks · A$8,691–A$14,486\n\nA$77 per task.'

/** conversation -> brief -> quote. D1 enforces foreign keys, so the order is
 *  not cosmetic: quotes.brief_id references briefs(id), which references
 *  conversations(id). */
async function seedQuote(): Promise<string> {
  const conversationId = newId('conv')
  await createConversation(env.DB, conversationId, Date.now())

  const briefId = newId('brief')
  await insertBrief(env.DB, {
    id: briefId,
    conversationId,
    markdown: '# Project Brief\n\nPawBook.',
    sectionsJson: JSON.stringify({ problem: 'Booking a groomer takes six phone calls.' }),
    createdAt: Date.now(),
  })

  const quoteId = newId('quote')
  await insertQuote(env.DB, {
    id: quoteId,
    briefId,
    markdown: MARKDOWN,
    mode: 'single',
    totalTasks: 137,
    weightedTasks: 150.5,
    rateAud: 77,
    lowAud: 8691,
    highAud: 14486,
    weeks: 7,
    confidence: 'high',
    categoriesJson: JSON.stringify([{ name: 'Core functionality', bullets: 60 }]),
    subsystemsJson: null,
    validUntil: Date.now() + 14 * 86_400_000,
    createdAt: Date.now(),
  })
  return quoteId
}

// `exports.default` is a pre-bound loopback stub: fetch(input, init?) only.
const get = (id: string, sig?: string) =>
  exports.default.fetch(
    `https://api.test/api/quote/${encodeURIComponent(id)}` +
      (sig === undefined ? '' : `?sig=${encodeURIComponent(sig)}`),
  )

interface Body {
  markdown: string
  quote: {
    mode: string
    totalTasks: number
    weightedTasks: number
    rateAud: number
    lowAud: number
    highAud: number
    weeks: number
    confidence: string
    belowFloor: boolean
  }
}

describe('GET /api/quote/:id', () => {
  it('returns the markdown and the quote payload for a valid signature', async () => {
    const id = await seedQuote()
    const res = await get(id, await signId(id, env.QUOTE_LINK_SIGNING_KEY))

    expect(res.status).toBe(200)
    const json = await res.json<Body>()
    expect(json.markdown).toBe(MARKDOWN)
    expect(QuoteSchema.safeParse(json.quote).success).toBe(true)
    expect(json.quote).toEqual({
      mode: 'single',
      totalTasks: 137,
      weightedTasks: 150.5,
      rateAud: 77,
      lowAud: 8691,
      highAud: 14486,
      weeks: 7,
      confidence: 'high',
      belowFloor: false,
    })
  })

  it('403s on a tampered signature', async () => {
    const id = await seedQuote()
    const sig = await signId(id, env.QUOTE_LINK_SIGNING_KEY)
    const tampered = (sig[0] === 'a' ? 'b' : 'a') + sig.slice(1)

    const res = await get(id, tampered)
    expect(res.status).toBe(403)
    expect(await res.text()).not.toContain(MARKDOWN.slice(0, 20))
  })

  it('403s on a signature made with a different key', async () => {
    const id = await seedQuote()
    const res = await get(id, await signId(id, OTHER_KEY))
    expect(res.status).toBe(403)
  })

  it('403s when the signature is missing entirely', async () => {
    const id = await seedQuote()
    expect((await get(id)).status).toBe(403)
    expect((await get(id, '')).status).toBe(403)
  })

  it('403s — not 500 — on a malformed signature', async () => {
    // A 500 is an oracle of its own: it tells an attacker their input was
    // structurally interesting.
    const id = await seedQuote()
    for (const sig of ['zz', 'a', 'not-hex-at-all', 'ab'.repeat(200), '%%%']) {
      expect((await get(id, sig)).status).toBe(403)
    }
  })

  // Quote ids must not be enumerable. A 404-for-unknown / 403-for-bad-signature
  // split hands an attacker an existence oracle in the status code alone, so the
  // unknown-id response is asserted BYTE-IDENTICAL to the bad-signature one —
  // same status AND same body. "Both are 403" would pass on an implementation
  // that returned {error:'not_found'} in one case and {error:'forbidden'} in the
  // other, which is the same leak wearing a different hat.
  it('403s on an unknown id, indistinguishably from a bad signature', async () => {
    const unknownId = newId('quote')
    // Signed with the REAL key, so verification passes and the miss can only
    // come from the database lookup — this exercises the unknown-id branch
    // rather than failing earlier at the signature check.
    const unknown = await get(unknownId, await signId(unknownId, env.QUOTE_LINK_SIGNING_KEY))

    const existingId = await seedQuote()
    const badSig = await get(existingId, await signId(existingId, OTHER_KEY))

    expect(unknown.status).toBe(403)
    expect(badSig.status).toBe(403)
    expect(unknown.status).toBe(badSig.status)
    expect(await unknown.text()).toBe(await badSig.text())
  })

  it('403s on an unknown id even when the signature is also wrong', async () => {
    const res = await get(newId('quote'), 'deadbeef'.repeat(8))
    expect(res.status).toBe(403)
  })

  it('does not accept another quote\'s signature', async () => {
    const a = await seedQuote()
    const b = await seedQuote()
    // The signature is over the id, so a valid link for quote A must not open B.
    const res = await get(b, await signId(a, env.QUOTE_LINK_SIGNING_KEY))
    expect(res.status).toBe(403)
    expect(a).not.toBe(b)
  })
})
