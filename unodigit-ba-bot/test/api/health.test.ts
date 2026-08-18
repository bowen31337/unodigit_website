import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import worker from '../../src/index'

describe('GET /health', () => {
  it('returns ok', async () => {
    const req = new Request('https://api.test/health')
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })
})
