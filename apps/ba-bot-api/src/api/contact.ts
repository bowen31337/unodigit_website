import type { Hono } from 'hono'
import { ContactRequestSchema } from '@unodigit/ba-bot-contract'
import type { Env } from '../env'
import { getConversation, insertLead, recordEvent } from '../db/queries'
import { verifyTurnstile } from '../guards/turnstile'
import { hashIp } from '../util/hash'
import { newId } from '../util/ids'
import { step } from '../graph/transitions'
import { loadSession, persistSession } from '../session'

const Body = ContactRequestSchema

export function registerContactRoutes(app: Hono<{ Bindings: Env }>): void {
  app.post('/api/contact', async (c) => {
    const parsed = Body.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

    const b = parsed.data
    const ip = c.req.header('cf-connecting-ip') ?? null

    // Existence check first: `events.conversation_id` is a foreign key, so
    // recording a turnstile failure against an unknown conversation throws a
    // constraint error and turns this 403 into a 500 — on the single most
    // bot-hit path in the app.
    if (!(await getConversation(c.env.DB, b.conversationId))) {
      return c.json({ error: 'not_found' }, 404)
    }

    if (!(await verifyTurnstile(b.turnstileToken, c.env.TURNSTILE_SECRET, ip))) {
      await recordEvent(c.env.DB, b.conversationId, 'turnstile_failed', {})
      return c.json({ error: 'challenge_failed' }, 403)
    }

    // The graph only leaves CONTACT via this endpoint, and it may only be
    // entered from CONTACT. Accepting a post from any state would advance an
    // interview that has not been conducted — a fresh GREETING conversation
    // could jump straight to PROJECT_IDENTITY with a lead attached.
    const session = await loadSession(c.env, b.conversationId)
    if (session.state !== 'CONTACT') {
      return c.json({ error: 'wrong_state', state: session.state }, 409)
    }

    const now = Date.now()
    const cf = (c.req.raw as Request & { cf?: IncomingRequestCfProperties }).cf
    const leadId = newId('lead')

    await insertLead(c.env.DB, {
      id: leadId,
      createdAt: now,
      name: b.name ?? null,
      email: b.email,
      company: b.company ?? null,
      role: b.role ?? null,
      ipHash: await hashIp(ip ?? 'unknown', c.env.IP_HASH_SALT),
      country: (cf?.country as string | undefined) ?? null,
      asn: cf?.asn ? String(cf.asn) : null,
      userAgent: c.req.header('user-agent') ?? null,
      utmSource: b.utm?.source ?? null,
      utmMedium: b.utm?.medium ?? null,
      utmCampaign: b.utm?.campaign ?? null,
      referrer: b.referrer ?? null,
      landingPage: b.landingPage ?? null,
      consentMarketing: true,
      consentTs: now,
    })

    await c.env.DB
      .prepare('UPDATE conversations SET lead_id = ? WHERE id = ?')
      .bind(leadId, b.conversationId)
      .run()

    const result = step(
      { ...session, slots: { ...session.slots, lead_id: leadId } },
      { slots: {}, readyToAdvance: true, offTopic: false },
    )

    await persistSession(c.env, b.conversationId, result.next)

    return c.json({ leadId, state: result.next.state })
  })
}
