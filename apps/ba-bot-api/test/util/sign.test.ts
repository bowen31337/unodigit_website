import { describe, it, expect } from 'vitest'
import { signId, verifyId } from '../../src/util/sign'

const KEY = 'c0ffee00deadbeef1122334455667788c0ffee00deadbeef1122334455667788'
const OTHER_KEY = '00000000111111112222222233333333444444445555555566666666777777aa'
const ID = 'quote_9f2c1b7a4e5d40a1b8c3d2e1f0a9b8c7'

describe('signId', () => {
  it('produces a 64-character lowercase hex HMAC-SHA256', async () => {
    const sig = await signId(ID, KEY)
    expect(sig).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic for the same id and key', async () => {
    // The link is emailed once and read later, possibly by a different isolate.
    // A nondeterministic signature would 403 every real client.
    expect(await signId(ID, KEY)).toBe(await signId(ID, KEY))
  })

  it('produces different signatures for different ids', async () => {
    expect(await signId(ID, KEY)).not.toBe(await signId(`${ID}z`, KEY))
  })

  it('produces different signatures under different keys', async () => {
    expect(await signId(ID, KEY)).not.toBe(await signId(ID, OTHER_KEY))
  })
})

describe('verifyId', () => {
  it('round-trips a signature it produced', async () => {
    expect(await verifyId(ID, await signId(ID, KEY), KEY)).toBe(true)
  })

  // Three distinct negative cases. A tampered id, a tampered signature and a
  // wrong key are different failures: only the last one actually tests that the
  // key is load-bearing, and only the first tests that the id is bound to it.
  it('rejects a tampered id', async () => {
    const sig = await signId(ID, KEY)
    expect(await verifyId(`${ID}x`, sig, KEY)).toBe(false)
    expect(await verifyId(ID.replace('9f2c', '9f2d'), sig, KEY)).toBe(false)
  })

  it('rejects a tampered signature', async () => {
    const sig = await signId(ID, KEY)
    // Flip one hex character, preserving the length — so this fails on the MAC
    // comparison, not on a structural length check.
    const tampered = (sig[0] === 'a' ? 'b' : 'a') + sig.slice(1)
    expect(tampered).toHaveLength(sig.length)
    expect(await verifyId(ID, tampered, KEY)).toBe(false)
  })

  it('rejects a signature made with a different key', async () => {
    // Deliberately NOT a mutated signature: this is a well-formed, correct HMAC
    // over the same id, and must fail purely because the key differs.
    const forged = await signId(ID, OTHER_KEY)
    expect(forged).toMatch(/^[0-9a-f]{64}$/)
    expect(await verifyId(ID, forged, KEY)).toBe(false)
  })

  // An unhandled throw becomes a 500, which is itself an oracle: it tells an
  // attacker their input was structurally interesting. Every malformed shape
  // must return false, and `resolves.toBe(false)` fails on a rejection too.
  it('is length-safe and never throws on a malformed signature', async () => {
    const sig = await signId(ID, KEY)
    const malformed: Array<[string, string]> = [
      ['empty', ''],
      ['too short (even)', sig.slice(0, 62)],
      ['too short (odd)', sig.slice(0, 63)],
      ['one hex char', 'a'],
      ['too long', sig + sig],
      ['too long by one byte', `${sig}ab`],
      ['odd length', `${sig}a`],
      ['non-hex', 'z'.repeat(64)],
      ['base64-ish', 'AAAA++//AAAA++//AAAA++//AAAA++//AAAA++//AAAA++//AAAA++//AAAA++//'],
      ['whitespace', ' '.repeat(64)],
      ['uppercase garbage', 'ZZZZ'],
    ]
    for (const [label, candidate] of malformed) {
      await expect(verifyId(ID, candidate, KEY), label).resolves.toBe(false)
    }
  })

  it('accepts an uppercase-hex rendering of a valid signature', async () => {
    // Hex case is not secret material; a mail client that upper-cases the query
    // string must not lock a client out of their own quote.
    const sig = await signId(ID, KEY)
    expect(await verifyId(ID, sig.toUpperCase(), KEY)).toBe(true)
  })

  it('fails closed when the signing key is unset', async () => {
    // WebCrypto rejects a zero-length HMAC key, so an unconfigured Worker
    // throws inside importKey. That must surface as `false`, never as an
    // unhandled throw (a 500) and never as `true` — a fail-OPEN here would
    // make every quote in the database readable to anyone who guesses an id.
    // src/index.ts additionally 503s on the missing secret; this is the
    // second line of defence, and it is what makes the catch load-bearing.
    await expect(verifyId(ID, await signId(ID, KEY), '')).resolves.toBe(false)
    await expect(verifyId(ID, 'ab'.repeat(32), '')).resolves.toBe(false)
  })

  it('rejects an empty id signed as empty', async () => {
    // A blank path segment must not authenticate anything.
    expect(await verifyId(ID, await signId('', KEY), KEY)).toBe(false)
  })
})

/**
 * Constant-time verification has NO observable behaviour: `sig === expected`
 * and `crypto.subtle.verify` return the same booleans for every input, and
 * differ only in how long they take to say so. A behavioural mutation test
 * proves this — replacing the body of `verifyId` with a `===` comparison
 * against a freshly computed signature leaves all 147 other tests green.
 *
 * So the property is pinned structurally instead, against the shipped function
 * body. This is not a style check: a short-circuiting comparison returns on the
 * first differing byte, and an attacker who can time responses walks the
 * signature out one byte at a time — 16 x 64 requests instead of 2^256.
 */
const verifyBody = verifyId
  .toString()
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/[^\n]*/g, '')

describe('verifyId is constant-time', () => {
  it('delegates the MAC comparison to crypto.subtle.verify', () => {
    expect(verifyBody).toContain('crypto.subtle.verify')
  })

  it('never re-signs and compares', () => {
    // `signId(id, key) === sig` is the canonical timing-leak shape, and it is
    // exactly the mutation that survives every behavioural assertion above.
    expect(verifyBody).not.toMatch(/\bsignId\b/)
  })

  it('contains no short-circuiting comparison other than the decode null-check', () => {
    // `fromHex` returns null for input that cannot be decoded at all. That
    // branch tests a public structural property of attacker-supplied input,
    // not secret material, so it is the one permitted equality. Anything else
    // is a comparison of secret-dependent bytes.
    const withoutDecodeGuard = verifyBody.replace(/bytes === null/g, '')
    expect(withoutDecodeGuard).not.toMatch(/[=!]==?/)
    expect(verifyBody).not.toMatch(/localeCompare|startsWith|endsWith|indexOf/)
  })
})
