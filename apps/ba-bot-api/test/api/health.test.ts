import { exports } from 'cloudflare:workers'
import { describe, it, expect } from 'vitest'

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await exports.default.fetch('https://api.test/health')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })
})
