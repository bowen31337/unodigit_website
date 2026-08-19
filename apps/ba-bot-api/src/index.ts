import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './env'
import { registerChatRoutes } from './api/chat'
import { registerContactRoutes } from './api/contact'
import { registerGenerateRoutes } from './api/generate'
import { registerQuoteRoutes } from './api/quote'

const app = new Hono<{ Bindings: Env }>()

/** Secrets whose absence silently degrades a control rather than failing:
 * an unset IP_HASH_SALT hashes every IP under a constant, publicly-known
 * prefix (a rainbow-table lookup away from the raw address), and an unset
 * TURNSTILE_SECRET or LLM_API_KEY turns a guard into a no-op. A misconfigured
 * deploy must refuse traffic, not serve it with the guardrails off.
 *
 * QUOTE_LINK_SIGNING_KEY joins the list here, in the first commit that reads
 * it: an unset key HMACs every quote id under the empty string, which anyone
 * can reproduce, so every quote in the database becomes world-readable to
 * anyone who can guess an id. Refusing traffic is the correct failure.
 * NOTE: the key must exist in 1Password and be pushed by
 * scripts/sync-secrets.sh BEFORE the next deploy, or /api/* returns 503. */
const REQUIRED_SECRETS = [
  'LLM_API_KEY', 'IP_HASH_SALT', 'TURNSTILE_SECRET', 'QUOTE_LINK_SIGNING_KEY',
] as const

// ALLOWED_ORIGIN is a comma-separated allowlist: the site is reachable on more
// than one origin (www, apex, localhost during `pnpm dev`), and a single string
// would silently lock out all but one of them. Entries are trimmed so the var
// stays readable in wrangler.toml.
app.use('/api/*', (c, next) =>
  cors({
    origin: c.env.ALLOWED_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean),
    allowMethods: ['GET', 'POST', 'OPTIONS'],
  })(c, next),
)

app.use('/api/*', async (c, next) => {
  if (REQUIRED_SECRETS.some((k) => !c.env[k])) {
    return c.json({ error: 'not_configured' }, 503)
  }
  await next()
})

// Unexpected throws (a D1 constraint, a binding outage) would otherwise
// surface as a bare 500 with an HTML-ish body the widget cannot parse.
app.onError((err, c) => {
  console.error('unhandled', err)
  return c.json({ error: 'internal_error' }, 500)
})

app.get('/health', (c) => c.json({ status: 'ok' }))

registerChatRoutes(app)
registerContactRoutes(app)
registerGenerateRoutes(app)
registerQuoteRoutes(app)

export default app
