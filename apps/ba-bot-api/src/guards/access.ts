/**
 * Cloudflare Access JWT verification.
 *
 * Access terminates at the edge on the admin hostname and forwards the request
 * with a `Cf-Access-Jwt-Assertion` header. The Worker verifies that token
 * rather than trusting its presence, because presence proves nothing:
 *
 *  1. **The edge can stop enforcing.** Delete the Access application, rename
 *     its hostname, or let the policy lapse, and requests arrive with no header
 *     at all. A guard that only checks `header ? allow : deny` still denies —
 *     but a guard that checks nothing, or that trusts a header an *attacker*
 *     can set, opens the whole admin surface the moment the edge stops
 *     covering it. The Worker is reachable on `*.workers.dev` regardless of
 *     what routes wrangler.toml declares, and that hostname has no Access in
 *     front of it, so "the edge already checked" is never true here.
 *  2. **`aud` is load-bearing.** Every application in one Access team is signed
 *     by the same JWKS. Without an audience check, a token minted for any other
 *     application on the account — including one with a deliberately open
 *     policy — verifies here. This is the single most common way an Access
 *     integration is wrong, and it fails open.
 *  3. **`alg` is load-bearing.** Accepting the token's own `alg` invites
 *     algorithm confusion: `none` skips verification entirely, and `HS256`
 *     invites verifying an RSA *public* key as an HMAC *secret* — the public
 *     key is published in the JWKS, so anyone could forge. Only RS256 is
 *     accepted, and the key is imported as RSA, so an HMAC token has nothing
 *     to verify against even if the check were missed.
 *
 * WebCrypto is provided by the Workers runtime; no JWT dependency is added.
 * Nothing here compares secret bytes with `===` — the signature comparison is
 * `crypto.subtle.verify`, which is constant-time (see util/sign.ts for why
 * that matters).
 */

/** Cloudflare's identity claims. Only what this Worker actually reads. */
export interface AccessIdentity {
  email: string
  /** Access's own subject id. Stable per user, useful for an audit line. */
  sub: string
}

interface JwtHeader {
  alg?: unknown
  kid?: unknown
}

interface JwtPayload {
  aud?: unknown
  iss?: unknown
  exp?: unknown
  nbf?: unknown
  iat?: unknown
  email?: unknown
  sub?: unknown
}

/**
 * Clock skew tolerated on `nbf` / `iat` only.
 *
 * `exp` deliberately gets none. A grace period on expiry extends every
 * revoked session by that much, and Access tokens are minted with lifetimes
 * measured in hours — sixty seconds buys nothing and costs a strictly larger
 * window in which a logged-out operator still has access.
 */
const SKEW_SECONDS = 60

/** How long a fetched JWKS is reused. Cloudflare rotates these keys
 *  infrequently; an hour keeps the common request off the network without
 *  outliving a rotation long enough to matter — a rotated-out `kid` misses the
 *  cache and forces a refetch anyway (see `keyFor`). */
const JWKS_TTL_MS = 60 * 60 * 1000

/** Floor between JWKS refetches. Without it, every request carrying an unknown
 *  `kid` — which an attacker chooses freely — becomes an outbound fetch, and
 *  the admin hostname turns into a request amplifier aimed at Cloudflare. */
const REFETCH_MIN_MS = 60 * 1000

interface CachedJwks {
  keys: Map<string, CryptoKey>
  fetchedAt: number
}

/**
 * Per-isolate JWKS cache, keyed by team domain.
 *
 * Module scope is per-isolate and Cloudflare reuses isolates across requests,
 * so this is a warm cache, not a global one — a cold isolate simply refetches.
 * It holds only Cloudflare's *public* keys, so a stale or leaked entry grants
 * nothing.
 */
const jwksCache = new Map<string, CachedJwks>()

/** Base64url → bytes. Returns null for anything not decodable rather than
 *  throwing: an unhandled throw becomes a 500, and a 500 that fires only on
 *  structurally interesting input is an oracle. */
function b64urlToBytes(part: string): Uint8Array | null {
  if (part.length === 0 || !/^[A-Za-z0-9_-]+$/.test(part)) return null
  const padded = part.replace(/-/g, '+').replace(/_/g, '/')
  try {
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

function b64urlToJson<T>(part: string): T | null {
  const bytes = b64urlToBytes(part)
  if (bytes === null) return null
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
    // A bare string or array would satisfy `typeof === 'object'` checks
    // downstream in surprising ways; require a plain object.
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as T
  } catch {
    return null
  }
}

/** Normalises `aud`, which Access sends as an array but the JWT spec permits
 *  as a bare string. Anything else is treated as absent, never as a match. */
function audienceList(aud: unknown): string[] {
  if (typeof aud === 'string') return [aud]
  if (Array.isArray(aud)) return aud.filter((a): a is string => typeof a === 'string')
  return []
}

async function fetchJwks(teamDomain: string): Promise<Map<string, CryptoKey>> {
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`)
  if (!res.ok) throw new Error(`jwks fetch failed: ${res.status}`)

  const body = (await res.json()) as { keys?: unknown }
  const keys = new Map<string, CryptoKey>()
  if (!Array.isArray(body.keys)) return keys

  for (const jwk of body.keys) {
    if (jwk === null || typeof jwk !== 'object') continue
    const { kid, kty, alg } = jwk as { kid?: unknown; kty?: unknown; alg?: unknown }
    // Import only what we are willing to verify with. A JWKS that ever carries
    // an EC or oct key must not silently become an accepted algorithm.
    if (typeof kid !== 'string' || kty !== 'RSA' || (alg !== undefined && alg !== 'RS256')) continue
    try {
      keys.set(
        kid,
        await crypto.subtle.importKey(
          'jwk',
          { ...(jwk as JsonWebKey), alg: 'RS256', ext: true },
          { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
          false,
          ['verify'],
        ),
      )
    } catch {
      // One malformed key must not deny every other key in the set.
      continue
    }
  }
  return keys
}

/**
 * Resolves a `kid` to a verified public key, refetching once on a miss.
 *
 * The refetch is what makes key rotation survivable without a deploy: a token
 * signed by a key minted after our cache was filled would otherwise fail for a
 * full TTL. It is bounded to one extra fetch per unknown `kid` per isolate, so
 * a flood of tokens bearing junk kids cannot turn into a fetch amplifier — the
 * refetched (still missing) result replaces the cache and the next junk kid
 * hits the same fresh cache.
 */
async function keyFor(teamDomain: string, kid: string): Promise<CryptoKey | null> {
  const cached = jwksCache.get(teamDomain)

  if (cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS && cached.keys.has(kid)) {
    return cached.keys.get(kid) ?? null
  }

  // Either the cache is stale or this kid is not in it. Both are answered by a
  // refetch, rate-limited so that a flood of tokens bearing junk kids becomes
  // one fetch per minute rather than one fetch per request.
  if (cached && Date.now() - cached.fetchedAt < REFETCH_MIN_MS) return null

  const keys = await fetchJwks(teamDomain)
  jwksCache.set(teamDomain, { keys, fetchedAt: Date.now() })
  return keys.get(kid) ?? null
}

/** Test seam. Clears the per-isolate JWKS cache so a test can control what the
 *  next verification sees; never called from request paths. */
export function __resetJwksCache(): void {
  jwksCache.clear()
}

/**
 * Verifies a Cloudflare Access JWT and returns the identity it asserts, or
 * null if the token is missing, malformed, unsigned, expired, signed by an
 * unknown key, issued by another team, or scoped to another application.
 *
 * Never throws for attacker-controlled input, and never distinguishes *why* a
 * token failed to its caller — one null covers every case, so the endpoint
 * cannot accidentally turn the reason into an oracle.
 */
export async function verifyAccessJwt(
  token: string | null | undefined,
  teamDomain: string,
  audience: string,
): Promise<AccessIdentity | null> {
  // An unset team domain or audience means the Worker was deployed without its
  // Access configuration. Failing closed is the only safe reading: the
  // alternative verifies a token against the empty string and admits everyone.
  if (!token || !teamDomain || !audience) return null

  const parts = token.split('.')
  // A four-part token is JWE, not JWS, and has no signature to check — the
  // length test is what makes the assertion below true, so keep them adjacent.
  if (parts.length !== 3) return null
  const [rawHeader, rawPayload, rawSignature] = parts as [string, string, string]

  const header = b64urlToJson<JwtHeader>(rawHeader)
  if (!header || header.alg !== 'RS256' || typeof header.kid !== 'string') return null

  const payload = b64urlToJson<JwtPayload>(rawPayload)
  if (!payload) return null

  const signature = b64urlToBytes(rawSignature)
  if (signature === null) return null

  let key: CryptoKey | null
  try {
    key = await keyFor(teamDomain, header.kid)
  } catch {
    // JWKS unreachable. Deny — a network blip must not become an open door.
    return null
  }
  if (!key) return null

  const signed = new TextEncoder().encode(`${rawHeader}.${rawPayload}`)
  let valid = false
  try {
    valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signed)
  } catch {
    // Defence in depth: verify is not supposed to reject for anything
    // reachable here, but denial is the only safe answer if it ever does.
    return null
  }
  if (!valid) return null

  // Claims are only meaningful once the signature holds — checking them first
  // would be reading attacker-controlled JSON and acting on it.
  if (payload.iss !== `https://${teamDomain}`) return null
  if (!audienceList(payload.aud).includes(audience)) return null

  const now = Math.floor(Date.now() / 1000)
  if (typeof payload.exp !== 'number' || payload.exp <= now) return null
  if (typeof payload.nbf === 'number' && payload.nbf > now + SKEW_SECONDS) return null
  if (typeof payload.iat === 'number' && payload.iat > now + SKEW_SECONDS) return null

  if (typeof payload.email !== 'string' || payload.email.length === 0) return null
  if (typeof payload.sub !== 'string') return null

  return { email: payload.email, sub: payload.sub }
}

/** Access sends the assertion as a header on every proxied request, and as a
 *  cookie on browser navigations. The header is preferred: a cookie is
 *  ambient authority that a cross-site request can carry, whereas this header
 *  is set by the Access edge and cannot be set cross-origin by a page. */
export function readAccessToken(req: Request): string | null {
  const header = req.headers.get('Cf-Access-Jwt-Assertion')
  if (header) return header

  const cookie = req.headers.get('Cookie')
  if (!cookie) return null
  for (const part of cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === 'CF_Authorization' && rest.length > 0) return rest.join('=')
  }
  return null
}
