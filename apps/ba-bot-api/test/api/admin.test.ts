import { env, exports } from 'cloudflare:workers'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { __resetJwksCache } from '../../src/guards/access'

/**
 * The admin surface has two independent gates. These tests exist because each
 * one, alone, has a failure mode the other covers — so "it works when I'm
 * logged in" proves almost nothing.
 */

const TEAM = 'unotest.cloudflareaccess.com'
const AUD = 'aud-for-the-admin-application'
const HOST = 'admin.claw-forge.net'
const KID = 'admin-test-key'

const b64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const b64urlJson = (v: unknown) => b64url(new TextEncoder().encode(JSON.stringify(v)))

let pair: CryptoKeyPair
let jwk: JsonWebKey

async function token(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000)
  const header = b64urlJson({ alg: 'RS256', kid: KID, typ: 'JWT' })
  const payload = b64urlJson({
    aud: [AUD], iss: `https://${TEAM}`, exp: now + 3600, iat: now - 5,
    email: 'ops@unodigit.com.au', sub: 'sub-1', ...overrides,
  })
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${header}.${payload}`),
  )
  return `${header}.${payload}.${b64url(new Uint8Array(sig))}`
}

/**
 * Calls the Worker exactly as the edge would: a real hostname in the URL.
 *
 * `redirect: 'manual'` so a status assertion means what it says. The runtime
 * follows redirects by default, which would report the *destination's* 200 for
 * a request that was actually redirected — and silently turn the /admin → /
 * assertion into a test of the dashboard route it already covers.
 */
async function call(path: string, opts: { host?: string; jwt?: string } = {}) {
  const headers: Record<string, string> = {}
  if (opts.jwt) headers['Cf-Access-Jwt-Assertion'] = opts.jwt
  return await exports.default.fetch(
    new Request(`https://${opts.host ?? HOST}${path}`, { headers, redirect: 'manual' }),
  )
}

beforeEach(async () => {
  pair ??= (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify'],
  )) as CryptoKeyPair
  jwk ??= (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey

  __resetJwksCache()
  Object.assign(env, { ADMIN_HOSTNAME: HOST, ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD })

  vi.spyOn(globalThis, 'fetch').mockImplementation((async (input: unknown) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url === `https://${TEAM}/cdn-cgi/access/certs`) {
      return new Response(JSON.stringify({ keys: [{ ...jwk, kid: KID, alg: 'RS256', use: 'sig' }] }))
    }
    throw new Error(`unexpected fetch: ${url}`)
  }) as unknown as typeof fetch)
})

afterEach(() => {
  vi.restoreAllMocks()
  Object.assign(env, { ADMIN_HOSTNAME: '', ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '' })
})

describe('gate 1 — hostname', () => {
  it('404s on workers.dev even with a perfectly valid Access token', async () => {
    // The gate that matters. A Worker answers on *.workers.dev whatever
    // `routes` says, and that hostname has no Access in front of it — so a
    // token-only guard publishes the dashboard to the open internet.
    const res = await call('/admin', { host: 'unodigit-ba-bot.unodigit.workers.dev', jwt: await token() })
    expect(res.status).toBe(404)
  })

  it('404s when ADMIN_HOSTNAME is unset, so a half-configured deploy ships nothing', async () => {
    Object.assign(env, { ADMIN_HOSTNAME: '' })
    expect((await call('/admin', { jwt: await token() })).status).toBe(404)
  })

  it('404s on the root path on workers.dev, where the dashboard now lives', async () => {
    // Moving the page from /admin to / moves it onto a path that exists on
    // every hostname this Worker answers. If the gate were left mounted on
    // /admin/* alone, this is the request that would serve the dashboard to
    // anyone.
    const res = await call('/', { host: 'unodigit-ba-bot.unodigit.workers.dev', jwt: await token() })
    expect(res.status).toBe(404)
    expect(await res.text()).not.toContain('BA bot · metrics')
  })

  it('404s on the root path on the public API hostname', async () => {
    const res = await call('/', { host: 'api.claw-forge.net', jwt: await token() })
    expect(res.status).toBe(404)
    expect(await res.text()).not.toContain('BA bot · metrics')
  })

  it('404s rather than 403s, so probing cannot confirm the surface exists', async () => {
    const res = await call('/admin/api/summary', { host: 'api.claw-forge.net', jwt: await token() })
    expect(res.status).toBe(404)
    expect(await res.text()).not.toContain('unauthorized')
  })
})

describe('gate 2 — Access JWT', () => {
  it('401s on the admin hostname with no token', async () => {
    expect((await call('/admin')).status).toBe(401)
  })

  it('401s on the root path with no token', async () => {
    expect((await call('/')).status).toBe(401)
  })

  it('401s for a token minted for another application in the same team', async () => {
    expect((await call('/admin', { jwt: await token({ aud: ['another-app'] }) })).status).toBe(401)
  })

  it('401s for an expired token', async () => {
    const now = Math.floor(Date.now() / 1000)
    expect((await call('/admin', { jwt: await token({ exp: now - 1 }) })).status).toBe(401)
  })

  it('fails closed when ACCESS_AUD is unset', async () => {
    Object.assign(env, { ACCESS_AUD: '' })
    expect((await call('/admin', { jwt: await token() })).status).toBe(401)
  })
})

describe('the dashboard and its data', () => {
  it('serves the page at the root to a verified operator', async () => {
    const res = await call('/', { jwt: await token() })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/html')
    expect(await res.text()).toContain('BA bot · metrics')
  })

  it('redirects the legacy /admin path to the root', async () => {
    // 302, not 301: a permanent redirect is cached by the browser, and
    // reverting this change would leave operators bounced off a URL that works.
    const res = await call('/admin', { jwt: await token() })
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('/')
  })

  it('never lets a response carrying leads be cached', async () => {
    const res = await call('/admin/api/leads', { jwt: await token() })
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store, max-age=0')
  })

  it('sets a CSP with no external origin on the page', async () => {
    const csp = (await call('/', { jwt: await token() })).headers.get('Content-Security-Policy')
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("connect-src 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
  })

  it('returns the shape the dashboard reads', async () => {
    const res = await call('/admin/api/summary?days=30', { jwt: await token() })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['daily', 'days', 'events', 'funnel', 'overview'])
  })

  it('reports who Access says you are', async () => {
    const res = await call('/admin/api/whoami', { jwt: await token() })
    expect(await res.json()).toEqual({ email: 'ops@unodigit.com.au' })
  })

  it('rejects a malformed window rather than silently reading it as all-time', async () => {
    // `?days=3O` (letter O) quietly returning every row since launch is a
    // wrong answer presented as a right one.
    const res = await call('/admin/api/summary?days=3O', { jwt: await token() })
    expect(res.status).toBe(400)
  })

  it('caps limit rather than trusting it', async () => {
    expect((await call('/admin/api/leads?limit=99999', { jwt: await token() })).status).toBe(200)
    expect((await call('/admin/api/leads?limit=abc', { jwt: await token() })).status).toBe(400)
  })
})

describe('the public API is unaffected', () => {
  it('still answers /health on any hostname', async () => {
    const res = await exports.default.fetch('https://api.claw-forge.net/health')
    expect(res.status).toBe(200)
  })
})
