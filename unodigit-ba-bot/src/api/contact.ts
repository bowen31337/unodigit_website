import type { Hono } from 'hono'
import { z } from 'zod'
import type { Env } from '../env'
import { getConversation, insertLead, recordEvent } from '../db/queries'
import { verifyTurnstile } from '../guards/turnstile'
import { hashIp } from '../util/hash'
import { newId } from '../util/ids'
import { step } from '../graph/transitions'
import { loadSession, saveSession } from '../session'

const Body = z.object({
  conversationId: z.string(),
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().max(200),
  company: z.string().max(160).optional(),
  role: z.string().max(120).optional(),
  consent: z.literal(true),
  turnstileToken: z.string().min(1),
  utm: z.object({
    source: z.string().optional(),
    medium: z.string().optional(),
    campaign: z.string().optional(),
  }).optional(),
  referrer: z.string().max(500).optional(),
  landingPage: z.string().max(500).optional(),
})

export function registerContactRoutes(app: Hono<{ Bindings: Env }>): void {
  app.post('/api/contact', async (c) => {
    const parsed = Body.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

    const b = parsed.data
    const ip = c.req.header('cf-connecting-ip') ?? null

    if (!(await verifyTurnstile(b.turnstileToken, c.env.TURNSTILE_SECRET, ip))) {
      await recordEvent(c.env.DB, b.conversationId, 'turnstile_failed', {})
      return c.json({ error: 'challenge_failed' }, 403)
    }

    if (!(await getConversation(c.env.DB, b.conversationId))) {
      return c.json({ error: 'not_found' }, 404)
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

    const session = await loadSession(c.env, b.conversationId)

    const result = step(
      { ...session, slots: { ...session.slots, lead_id: leadId } },
      { slots: {}, readyToAdvance: true, offTopic: false },
    )

    await saveSession(c.env, b.conversationId, result.next)
    await c.env.DB
      .prepare('UPDATE conversations SET state = ? WHERE id = ?')
      .bind(result.next.state, b.conversationId)
      .run()

    return c.json({ leadId, state: result.next.state })
  })
}
