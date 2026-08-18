import { env } from 'cloudflare:workers'
import { describe, it, expect } from 'vitest'
import { quotesToday, recordQuote, utcDay } from '../../src/guards/ratelimit'
import { hashIp } from '../../src/util/hash'

describe('rate limit ledger', () => {
  it('formats a UTC day key', () => {
    expect(utcDay(Date.UTC(2026, 7, 18, 23, 59))).toBe('2026-08-18')
  })

  it('starts at zero for an unseen ip', async () => {
    expect(await quotesToday(env.DB, 'unseen', '2026-08-18')).toBe(0)
  })

  it('increments on each recorded quote', async () => {
    const ip = await hashIp('203.0.113.9', 'test-salt')
    await recordQuote(env.DB, ip, '2026-08-18')
    expect(await quotesToday(env.DB, ip, '2026-08-18')).toBe(1)
    await recordQuote(env.DB, ip, '2026-08-18')
    expect(await quotesToday(env.DB, ip, '2026-08-18')).toBe(2)
  })

  it('scopes counts per day', async () => {
    const ip = await hashIp('203.0.113.10', 'test-salt')
    await recordQuote(env.DB, ip, '2026-08-18')
    expect(await quotesToday(env.DB, ip, '2026-08-19')).toBe(0)
  })
})

describe('hashIp', () => {
  it('is deterministic for the same salt', async () => {
    expect(await hashIp('1.1.1.1', 's')).toBe(await hashIp('1.1.1.1', 's'))
  })

  it('differs across salts, so the ledger is not a rainbow table', async () => {
    expect(await hashIp('1.1.1.1', 'a')).not.toBe(await hashIp('1.1.1.1', 'b'))
  })

  it('does not contain the raw ip', async () => {
    expect(await hashIp('1.1.1.1', 's')).not.toContain('1.1.1.1')
  })
})
