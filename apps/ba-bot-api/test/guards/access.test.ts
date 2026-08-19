import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { verifyAccessJwt, readAccessToken, __resetJwksCache } from '../../src/guards/access'

/**
 * These tests mint real RS256 tokens against a real generated key pair and
 * serve a real JWKS, because the properties worth asserting are cryptographic:
 * a hand-rolled "does the string look like a JWT" fake would pass every one of
 * them while verifying nothing.
 *
 * The negative cases matter more than the positive one. Each corresponds to a
 * documented way an Access integration fails *open*.
 */

const TEAM = 'unotest.cloudflareaccess.com'
const AUD = 'a1b2c3d4e5f60718293a4b5c6d7e8f901a2b3c4d5e6f708192a3b4c5d6e7f809'
const KID = 'test-key-1'

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const b64urlJson = (value: unknown): string =>
  b64url(new TextEncoder().encode(JSON.stringify(value)))

let signingKey: CryptoKeyPair
let publicJwk: JsonWebKey
/** A second, unrelated pair — the "signed by someone else" case. */
let foreignKey: CryptoKeyPair

async function generatePair(): Promise<CryptoKeyPair> {
  return (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair
}

interface Claims {
  aud?: unknown
  iss?: string
  exp?: number
  nbf?: number
  iat?: number
  email?: unknown
  sub?: unknown
}

/** Mints a token signed by `key`, defaulting every claim to a valid value so a
 *  test only has to state the one thing it is making wrong. */
async function mint(claims: Claims = {}, opts: { key?: CryptoKey; kid?: string; alg?: string } = {}) {
  const now = Math.floor(Date.now() / 1000)
  const header = b64urlJson({ alg: opts.alg ?? 'RS256', kid: opts.kid ?? KID, typ: 'JWT' })
  const payload = b64urlJson({
    aud: [AUD],
    iss: `https://${TEAM}`,
    exp: now + 3600,
    iat: now - 10,
    nbf: now - 10,
    email: 'ops@unodigit.com.au',
    sub: 'sub-123',
    ...claims,
  })
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    opts.key ?? signingKey.privateKey,
    new TextEncoder().encode(`${header}.${payload}`),
  )
  return `${header}.${payload}.${b64url(new Uint8Array(signature))}`
}

let jwksHits = 0

beforeEach(async () => {
  signingKey ??= await generatePair()
  foreignKey ??= await generatePair()
  // exportKey is typed as JsonWebKey | ArrayBuffer across all formats; 'jwk'
  // always yields the former.
  publicJwk ??= (await crypto.subtle.exportKey('jwk', signingKey.publicKey)) as JsonWebKey

  jwksHits = 0
  __resetJwksCache()

  vi.spyOn(globalThis, 'fetch').mockImplementation((async (input: unknown) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url === `https://${TEAM}/cdn-cgi/access/certs`) {
      jwksHits += 1
      return new Response(JSON.stringify({ keys: [{ ...publicJwk, kid: KID, alg: 'RS256', use: 'sig' }] }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }
    throw new Error(`unexpected fetch: ${url}`)
  }) as unknown as typeof fetch)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('verifyAccessJwt — the happy path', () => {
  it('accepts a well-formed token and returns the identity', async () => {
    expect(await verifyAccessJwt(await mint(), TEAM, AUD)).toEqual({
      email: 'ops@unodigit.com.au',
      sub: 'sub-123',
    })
  })
})

describe('verifyAccessJwt — the ways an Access guard fails open', () => {
  it('rejects a token minted for a DIFFERENT application in the same team', async () => {
    // The single most common Access mistake: same team, same JWKS, so the
    // signature is genuinely valid. Only the aud check stops it.
    const other = await mint({ aud: ['some-other-application-aud'] })
    expect(await verifyAccessJwt(other, TEAM, AUD)).toBeNull()
  })

  it('rejects alg:none, which would skip verification entirely', async () => {
    const now = Math.floor(Date.now() / 1000)
    const header = b64urlJson({ alg: 'none', kid: KID })
    const payload = b64urlJson({ aud: [AUD], iss: `https://${TEAM}`, exp: now + 3600, email: 'a@b.c', sub: 's' })
    expect(await verifyAccessJwt(`${header}.${payload}.`, TEAM, AUD)).toBeNull()
  })

  it('rejects HS256, which invites verifying the public key as an HMAC secret', async () => {
    expect(await verifyAccessJwt(await mint({}, { alg: 'HS256' }), TEAM, AUD)).toBeNull()
  })

  it('rejects a token signed by a key that is not in the JWKS', async () => {
    expect(await verifyAccessJwt(await mint({}, { key: foreignKey.privateKey }), TEAM, AUD)).toBeNull()
  })

  it('rejects a tampered payload even though the signature is well-formed', async () => {
    const token = await mint()
    const [h, , s] = token.split('.')
    const forged = b64urlJson({
      aud: [AUD], iss: `https://${TEAM}`, exp: Math.floor(Date.now() / 1000) + 3600,
      email: 'attacker@evil.test', sub: 'sub-123',
    })
    expect(await verifyAccessJwt(`${h}.${forged}.${s}`, TEAM, AUD)).toBeNull()
  })

  it('rejects an issuer from another Access team', async () => {
    expect(await verifyAccessJwt(await mint({ iss: 'https://evil.cloudflareaccess.com' }), TEAM, AUD)).toBeNull()
  })

  it('rejects an expired token with no grace period', async () => {
    const now = Math.floor(Date.now() / 1000)
    expect(await verifyAccessJwt(await mint({ exp: now - 1 }), TEAM, AUD)).toBeNull()
  })

  it('rejects a token with no exp at all', async () => {
    expect(await verifyAccessJwt(await mint({ exp: undefined }), TEAM, AUD)).toBeNull()
  })

  it('rejects a not-yet-valid token beyond the skew allowance', async () => {
    const now = Math.floor(Date.now() / 1000)
    expect(await verifyAccessJwt(await mint({ nbf: now + 3600 }), TEAM, AUD)).toBeNull()
  })

  it('fails closed when the team domain or audience is unconfigured', async () => {
    const token = await mint()
    expect(await verifyAccessJwt(token, '', AUD)).toBeNull()
    expect(await verifyAccessJwt(token, TEAM, '')).toBeNull()
  })

  it('denies rather than throwing when the JWKS endpoint is down', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((async () =>
      new Response('nope', { status: 500 })) as unknown as typeof fetch)
    __resetJwksCache()
    expect(await verifyAccessJwt(await mint(), TEAM, AUD)).toBeNull()
  })
})

describe('verifyAccessJwt — malformed input never throws', () => {
  it.each([
    ['empty', ''],
    ['null', null],
    ['undefined', undefined],
    ['not a jwt', 'hello'],
    ['two parts', 'aaa.bbb'],
    ['four parts (JWE, not JWS)', 'aaa.bbb.ccc.ddd'],
    ['non-base64url', 'a!b.c@d.e#f'],
    ['valid base64url, not JSON', 'aGVsbG8.d29ybGQ.c2ln'],
    ['payload is an array, not an object', `${b64urlJson({ alg: 'RS256', kid: KID })}.${b64url(new TextEncoder().encode('[1,2]'))}.c2ln`],
  ])('returns null for %s', async (_label, token) => {
    await expect(verifyAccessJwt(token, TEAM, AUD)).resolves.toBeNull()
  })
})

describe('JWKS caching', () => {
  it('fetches once across repeated verifications', async () => {
    const token = await mint()
    await verifyAccessJwt(token, TEAM, AUD)
    await verifyAccessJwt(token, TEAM, AUD)
    await verifyAccessJwt(token, TEAM, AUD)
    expect(jwksHits).toBe(1)
  })

  it('does not refetch per request for an unknown kid', async () => {
    // Otherwise an attacker choosing a fresh kid each time turns the admin
    // hostname into a request amplifier aimed at Cloudflare.
    for (let i = 0; i < 5; i += 1) {
      await verifyAccessJwt(await mint({}, { kid: `junk-${i}` }), TEAM, AUD)
    }
    expect(jwksHits).toBe(1)
  })
})

describe('readAccessToken', () => {
  const req = (headers: Record<string, string>) => new Request('https://admin.test/', { headers })

  it('prefers the Access header', () => {
    expect(readAccessToken(req({ 'Cf-Access-Jwt-Assertion': 'from-header', Cookie: 'CF_Authorization=from-cookie' })))
      .toBe('from-header')
  })

  it('falls back to the CF_Authorization cookie for browser navigations', () => {
    expect(readAccessToken(req({ Cookie: 'other=1; CF_Authorization=from-cookie; x=2' }))).toBe('from-cookie')
  })

  it('keeps a JWT intact when the cookie value contains "="', () => {
    expect(readAccessToken(req({ Cookie: 'CF_Authorization=a.b.c==' }))).toBe('a.b.c==')
  })

  it('returns null when neither is present', () => {
    expect(readAccessToken(req({}))).toBeNull()
    expect(readAccessToken(req({ Cookie: 'unrelated=1' }))).toBeNull()
  })
})
