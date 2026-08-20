import { describe, it, expect } from 'vitest'
import { contactHandoffReply, CONTACT_HANDOFF } from '../../src/graph/handoff'

describe('contactHandoffReply', () => {
  // Both cases below are verbatim from production.

  it('strips a trailing question the visitor can no longer answer', () => {
    const out = contactHandoffReply(
      "Perfect — that's your baseline. To wrap this stage, any third-party services to integrate?",
    )

    expect(out).toBe(`Perfect — that's your baseline. ${CONTACT_HANDOFF}`)
    expect(out).not.toContain('?')
  })

  it('strips a promise of a next topic that never arrives', () => {
    const out = contactHandoffReply(
      'Thanks for the clarity — Azure preferred, three-month live date, 80–120k AUD budget. ' +
      'That completes the constraints topic. Moving to the next topic.',
    )

    expect(out).toContain('Azure preferred')
    expect(out).not.toMatch(/next topic/i)
    expect(out.endsWith(CONTACT_HANDOFF)).toBe(true)
  })

  it('keeps the acknowledgement — it confirms what was captured', () => {
    const out = contactHandoffReply('Got it: three-month timeline and an 80-120k band. Next up: your team.')
    expect(out).toContain('three-month timeline and an 80-120k band')
  })

  it('falls back to the hand-off alone when the whole reply was a question', () => {
    expect(contactHandoffReply('Any third-party services to integrate?')).toBe(CONTACT_HANDOFF)
  })

  it('strips several trailing danglers, not just the last one', () => {
    const out = contactHandoffReply('Noted. That covers constraints. Anything else? Moving on.')
    expect(out).toBe(`Noted. That covers constraints. ${CONTACT_HANDOFF}`)
  })

  it('appends cleanly to a reply that already closes properly', () => {
    const out = contactHandoffReply('Thanks — I have everything I need.')
    expect(out).toBe(`Thanks — I have everything I need. ${CONTACT_HANDOFF}`)
  })

  // "next" is ordinary English. Only a TRAILING continuation promise is a
  // dangler; the same word mid-reply is content and must survive.
  it('does not strip "next" used as ordinary content mid-reply', () => {
    const out = contactHandoffReply('You want this live for the next financial year. Understood.')
    expect(out).toContain('next financial year')
  })

  it('handles a reply with no sentence terminator at all', () => {
    expect(contactHandoffReply('Understood')).toBe(`Understood ${CONTACT_HANDOFF}`)
  })

  it('never returns an empty reply', () => {
    for (const input of ['', '?', 'Moving on.', '   ']) {
      expect(contactHandoffReply(input).length).toBeGreaterThan(0)
    }
  })
})
