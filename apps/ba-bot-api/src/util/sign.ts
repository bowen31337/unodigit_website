/**
 * HMAC-SHA256 over a quote id, hex-encoded.
 *
 * The emailed quote link is read with no account and no login, so the URL *is*
 * the credential. Two properties follow, and neither is optional:
 *
 *  1. The signature must be unforgeable without QUOTE_LINK_SIGNING_KEY.
 *  2. Verification must be constant-time. A short-circuiting comparison
 *     (`===`, `==`, `.localeCompare`) returns on the first differing byte, so
 *     an attacker who can time responses recovers the signature one byte at a
 *     time — roughly 16 x 64 requests instead of 2^256 guesses. Every
 *     comparison of secret-dependent bytes here goes through
 *     `crypto.subtle.verify`, which compares the full MAC in constant time.
 *
 * WebCrypto is provided by the Workers runtime; no crypto dependency is added.
 */

const encoder = new TextEncoder()

async function hmacKey(key: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

const toHex = (bytes: Uint8Array): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')

/**
 * Decodes hex, or returns null for anything that is not decodable at all.
 *
 * The comparisons here are on the *length and character class of attacker-
 * supplied input* — both public, both already visible to whoever sent the
 * request — never on the MAC bytes, so short-circuiting on them leaks nothing.
 * Returning null rather than throwing is the point: an unhandled throw becomes
 * a 500, and a 500 is itself an oracle telling an attacker their input was
 * structurally interesting.
 *
 * Wrong-but-decodable lengths are deliberately NOT rejected here. They are
 * passed to `crypto.subtle.verify`, which returns false for a length mismatch
 * without throwing, keeping the whole comparison on the constant-time path.
 */
function fromHex(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0) return null
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

/** HMAC-SHA256(id) under `key`, lowercase hex. Deterministic: the same id and
 *  key always produce the same signature, so an emailed link keeps working. */
export async function signId(id: string, key: string): Promise<string> {
  const mac = await crypto.subtle.sign('HMAC', await hmacKey(key), encoder.encode(id))
  return toHex(new Uint8Array(mac))
}

/**
 * True only if `sig` is a valid HMAC over `id` under `key`.
 *
 * Never throws: a malformed, truncated, over-long or non-hex signature returns
 * false. The MAC comparison itself is delegated to `crypto.subtle.verify` —
 * there is no `===` on signature bytes anywhere in this module.
 */
export async function verifyId(id: string, sig: string, key: string): Promise<boolean> {
  const bytes = fromHex(sig)
  if (bytes === null) return false
  try {
    return await crypto.subtle.verify('HMAC', await hmacKey(key), bytes, encoder.encode(id))
  } catch {
    // Defence in depth. Verification is not supposed to reject for any input
    // reachable here, but a false is the only safe answer if it ever does: a
    // throw would surface as a 500 and become the oracle described above.
    return false
  }
}
