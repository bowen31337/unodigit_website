import type { Hono } from 'hono'
import type { Env } from '../env'
import { getQuoteById } from '../db/queries'
import { verifyId } from '../util/sign'
import { quoteFromRow } from './generate'

/**
 * The ONE response for every failure. A bad signature and an unknown id must be
 * indistinguishable: if unknown ids answered 404 while bad signatures answered
 * 403, the status code alone would tell an attacker which quote ids exist, and
 * the ids are the whole access-control mechanism. Same status, same body, no
 * detail — `{ error: 'forbidden' }` for a tampered link, a forged signature, a
 * missing signature, and an id that was never issued alike.
 */
const FORBIDDEN = { error: 'forbidden' } as const

export function registerQuoteRoutes(app: Hono<{ Bindings: Env }>): void {
  app.get('/api/quote/:id', async (c) => {
    const id = c.req.param('id')
    // A missing `sig` is not a different kind of failure from a wrong one.
    const sig = c.req.query('sig') ?? ''

    // Verify BEFORE touching the database. Doing the lookup first would let an
    // unauthenticated caller drive D1 reads with arbitrary ids, and it buys
    // nothing: an attacker cannot produce a valid signature for an id they do
    // not already hold a link to, so the branch they can actually reach always
    // ends at the same 403 without a query.
    if (!(await verifyId(id, sig, c.env.QUOTE_LINK_SIGNING_KEY))) {
      return c.json(FORBIDDEN, 403)
    }

    const row = await getQuoteById(c.env.DB, id)
    if (!row) return c.json(FORBIDDEN, 403)

    // The markdown is the canonical stored artifact — the client reads exactly
    // what was rendered and emailed, never something re-derived at read time.
    return c.json({
      markdown: row.markdown,
      quote: quoteFromRow(row, Number(c.env.MINIMUM_ENGAGEMENT_AUD)),
    })
  })
}
