import type { Hono } from 'hono'
import type { Env } from '../env'
import { readAccessToken, verifyAccessJwt } from '../guards/access'
import { dashboardCsp, dashboardHtml } from '../admin/dashboard'
import {
  daily, eventTypes, funnel, leads, overview, recentEvents, since,
} from '../db/admin'

/** Lets the gate hand the verified identity to handlers without re-verifying,
 *  and keeps `c.get('adminEmail')` typed rather than `any`. */
declare module 'hono' {
  interface ContextVariableMap {
    adminEmail: string
  }
}

/**
 * The admin surface, served from the Worker on its own hostname.
 *
 * Dashboard HTML and its JSON endpoints share one origin on purpose. The
 * alternative — a Pages app on `admin.` calling an API on `api.` — needs the
 * browser to send Access cookies cross-origin, which means `credentials:
 * 'include'`, per-application CORS configuration inside Access, and two
 * policies that must not drift apart. Same-origin removes all three.
 *
 * Two independent gates, because either alone fails open in a way the other
 * covers:
 *
 *  1. **Hostname.** Every Worker is reachable at `*.workers.dev` no matter what
 *     `routes` says, and that hostname has no Access in front of it. Without
 *     this check the admin surface is published on the open internet the day it
 *     ships. This is the gate that matters most and it is deliberately first.
 *  2. **Access JWT.** See guards/access.ts. Covers the case where the Access
 *     application is deleted, misconfigured, or its hostname reassigned, and
 *     the edge silently stops enforcing.
 */
export function registerAdminRoutes(app: Hono<{ Bindings: Env }>): void {
  app.use('/admin/*', async (c, next) => {
    const configured = c.env.ADMIN_HOSTNAME
    // Unset means "no admin surface on this deployment". Failing closed keeps
    // a half-configured deploy from publishing the dashboard.
    if (!configured) return c.notFound()

    // `host` rather than the full URL: the hostname is what Access binds to,
    // and a port or scheme difference is not an authorisation difference.
    const host = new URL(c.req.url).hostname
    if (host !== configured) {
      // 404, not 403. A 403 confirms the admin surface exists and that the
      // caller merely reached it on the wrong hostname, which is a map for
      // someone probing workers.dev.
      return c.notFound()
    }

    const identity = await verifyAccessJwt(
      readAccessToken(c.req.raw),
      c.env.ACCESS_TEAM_DOMAIN,
      c.env.ACCESS_AUD,
    )
    if (!identity) return c.json({ error: 'unauthorized' }, 401)

    c.set('adminEmail', identity.email)
    await next()
  })

  // Nothing under /admin may be cached. These responses carry leads' names,
  // emails and companies, and a shared cache or a browser's back-forward cache
  // holding them is a second copy of personal information that the deletion
  // path in delete-lead.sh cannot reach.
  app.use('/admin/*', async (c, next) => {
    await next()
    c.header('Cache-Control', 'no-store, max-age=0')
    c.header('Referrer-Policy', 'no-referrer')
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('X-Frame-Options', 'DENY')
  })

  app.get('/admin', (c) => {
    c.header('Content-Security-Policy', dashboardCsp())
    return c.html(dashboardHtml())
  })

  /** Query window in days. Rejects junk rather than silently reading it as
   *  all-time: a typo'd `?days=3O` quietly returning every row since launch is
   *  a wrong answer presented as a right one. */
  const windowDays = (c: { req: { query: (k: string) => string | undefined } }): number | null => {
    const raw = c.req.query('days')
    if (raw === undefined || raw === '') return 30
    if (!/^\d{1,5}$/.test(raw)) return null
    return Number(raw)
  }

  /**
   * Row cap. A number is clamped, never rejected for being large — rejecting
   * `?limit=99999` while clamping `?limit=9999` is an arbitrary line that only
   * shows up as a confusing 400. Non-numeric input still fails loudly, because
   * that is a caller bug rather than an ambitious caller.
   *
   * Bounded at 9 digits so the parse cannot reach Infinity or lose precision
   * before `Math.min` sees it.
   */
  const rowLimit = (raw: string | undefined, fallback: number, max: number): number | null => {
    if (raw === undefined || raw === '') return fallback
    if (!/^\d{1,9}$/.test(raw)) return null
    return Math.min(Math.max(Number(raw), 1), max)
  }

  app.get('/admin/api/summary', async (c) => {
    const days = windowDays(c)
    if (days === null) return c.json({ error: 'invalid_days' }, 400)
    const from = since(days)

    // One round trip per aggregate, run concurrently. D1 has no multi-result
    // batch for reads with different shapes, and serialising six queries adds
    // their latencies together for no reason.
    const [summary, funnelRows, dailyRows, events] = await Promise.all([
      overview(c.env.DB, from),
      funnel(c.env.DB, from),
      daily(c.env.DB, from),
      eventTypes(c.env.DB, from),
    ])

    return c.json({ days, overview: summary, funnel: funnelRows, daily: dailyRows, events })
  })

  app.get('/admin/api/leads', async (c) => {
    const limit = rowLimit(c.req.query('limit'), 25, 200)
    if (limit === null) return c.json({ error: 'invalid_limit' }, 400)
    return c.json({ leads: await leads(c.env.DB, limit, c.req.query('q')) })
  })

  app.get('/admin/api/events', async (c) => {
    const days = windowDays(c)
    if (days === null) return c.json({ error: 'invalid_days' }, 400)
    const limit = rowLimit(c.req.query('limit'), 50, 500)
    if (limit === null) return c.json({ error: 'invalid_limit' }, 400)
    return c.json({ events: await recentEvents(c.env.DB, since(days), limit, c.req.query('type')) })
  })

  /** Who Access says you are. The dashboard shows it so an operator can tell at
   *  a glance which identity they are acting as. */
  app.get('/admin/api/whoami', (c) => c.json({ email: c.get('adminEmail') }))
}
