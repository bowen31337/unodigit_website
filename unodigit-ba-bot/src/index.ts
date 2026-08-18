import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './env'
import { registerChatRoutes } from './api/chat'

const app = new Hono<{ Bindings: Env }>()

app.use('/api/*', (c, next) =>
  cors({ origin: c.env.ALLOWED_ORIGIN, allowMethods: ['GET', 'POST', 'OPTIONS'] })(c, next),
)

app.get('/health', (c) => c.json({ status: 'ok' }))

registerChatRoutes(app)

export default app
