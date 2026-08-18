import { describe, it, expect } from 'vitest'
import { buildBriefSections, renderBrief } from '../../src/render/brief'
import { renderQuote } from '../../src/render/quote'
import type { EstimateShape, Quote } from '@unodigit/ba-bot-contract'

const slots = {
  project_name: 'PawBook',
  audience: 'Independent dog groomers in Sydney',
  problem: 'Bookings are managed by phone and double-booked constantly',
  solution_summary: 'A mobile-first booking calendar with SMS reminders',
  differentiator: 'Built for solo operators, not salons',
  personas: ['Groomer', 'Pet owner'],
  mvp_must: ['Online booking', 'SMS reminder'],
  mvp_wont: ['Payments'],
  covered_categories: ['Core functionality', 'UI/UX', 'Integrations'],
  features: ['User can book a slot', 'System sends an SMS reminder'],
  timeline: 'Before spring',
  budget_band: 'Under 20k',
  stack_preference: 'No preference',
  integrations: ['Twilio'],
}

const shape: EstimateShape = {
  mode: 'single',
  categories: [
    { name: 'Core functionality', bullets: 52, sample: 'User can book a slot (returns 201 with booking_id)' },
    { name: 'Integrations', bullets: 20, sample: 'System sends an SMS via Twilio (emits sms_sent)' },
  ],
  total_tasks: 72,
  confidence: 'medium',
  drivers: ['one integration'],
}

// belowFloor is false here — most tests in the `renderQuote` block below
// exercise the normal band-showing path; only the "flags a project below the
// engagement floor" test overrides this to true for its own case. The plan's
// literal fixture set this to `true` unconditionally, which is self-
// contradictory: it silently broke the "shows the band" and "per-task rate"
// tests in the same block, since `belowFloor: true` is documented (deliberate
// point 4) to replace the band with a starter-engagement message and suppress
// the per-task-rate section entirely. Fixed minimally by flipping the shared
// default and overriding per-test where the true intent is belowFloor.
const quote: Quote = {
  mode: 'single', totalTasks: 72, weightedTasks: 92.4, rateAud: 10,
  lowAud: 601, highAud: 1247, weeks: 4, confidence: 'medium', belowFloor: false,
}

describe('buildBriefSections', () => {
  it('fills every section from slots', () => {
    const s = buildBriefSections(slots)
    expect(s.problem).toContain('double-booked')
    expect(s.users).toContain('Groomer')
    expect(s.scope).toContain('Online booking')
  })

  it('degrades gracefully when a slot is missing', () => {
    const s = buildBriefSections({ project_name: 'X' })
    expect(s.problem.length).toBeGreaterThan(0)
    expect(s.problem.toLowerCase()).toContain('not captured')
  })
})

describe('renderBrief', () => {
  it('emits markdown with the expected headings', () => {
    const md = renderBrief(buildBriefSections(slots), 'PawBook')
    expect(md).toMatch(/^# /m)
    expect(md).toContain('## Problem')
    expect(md).toContain('## Proposed solution')
    expect(md).toContain('## MVP scope')
  })

  it('never contains a lead field', () => {
    const md = renderBrief(buildBriefSections(slots), 'PawBook')
    expect(md).not.toMatch(/@/)
  })
})

describe('renderQuote', () => {
  const base = { quote, shape, projectName: 'PawBook', validUntil: Date.UTC(2026, 8, 17) }

  it('shows the band and the task count', () => {
    const md = renderQuote({ ...base, rateShown: true })
    expect(md).toContain('72')
    expect(md).toMatch(/601/)
    expect(md).toMatch(/1,?247/)
  })

  it('breaks down every category', () => {
    const md = renderQuote({ ...base, rateShown: true })
    expect(md).toContain('Core functionality')
    expect(md).toContain('Integrations')
  })

  it('includes the per-task rate only when rateShown is true', () => {
    expect(renderQuote({ ...base, rateShown: true })).toContain('per task')
    expect(renderQuote({ ...base, rateShown: false })).not.toContain('per task')
  })

  it('states that the figure is indicative and when it expires', () => {
    const md = renderQuote({ ...base, rateShown: true })
    expect(md.toLowerCase()).toContain('indicative')
    expect(md).toContain('2026')
  })

  it('flags a project below the engagement floor rather than quoting it', () => {
    const md = renderQuote({ ...base, quote: { ...quote, belowFloor: true }, rateShown: true })
    expect(md.toLowerCase()).toMatch(/smaller than|minimum|starter/)

    // The criterion is that belowFloor REPLACES the band, not that it adds a
    // message beside it. Asserting only the message's presence would pass on a
    // renderer that printed both — which is the commercially harmful case this
    // whole branch exists to prevent. Assert the numbers are absent.
    expect(md).not.toContain('601')
    expect(md).not.toContain('1,247')
    expect(md).not.toContain('per task')
  })

  it('orders phases by dependency, not declaration order', () => {
    // Scheduling is declared FIRST but depends on Identity, so a renderer that
    // ignored depends_on and emitted declaration order would still satisfy a
    // test that only checked "Phase 1 exists" and "both names appear".
    const prog: EstimateShape = {
      mode: 'program', umbrella: 'Platform',
      subsystems: [
        { name: 'Scheduling', categories: [{ name: 'Core functionality', bullets: 184, sample: 'y' }], total_tasks: 184, depends_on: ['Identity'] },
        { name: 'Identity', categories: [{ name: 'Authentication & User Management', bullets: 96, sample: 'x' }], total_tasks: 96, depends_on: [] },
      ],
      total_tasks: 280, confidence: 'low', drivers: [],
    }
    const md = renderQuote({ ...base, shape: prog, quote: { ...quote, mode: 'program' }, rateShown: true })

    expect(md).toMatch(/### Phase 1 — Identity/)
    expect(md).toMatch(/### Phase 2 — Scheduling/)
  })

  it('falls back to declaration order on a dependency cycle without throwing', () => {
    // A malformed depends_on from the model must still yield a complete
    // artifact. Mis-ordered phases are acceptable; a 500, or a subsystem
    // silently dropped from the quote, is not.
    const cyclic: EstimateShape = {
      mode: 'program', umbrella: 'Platform',
      subsystems: [
        { name: 'Alpha', categories: [{ name: 'Core functionality', bullets: 96, sample: 'x' }], total_tasks: 96, depends_on: ['Beta'] },
        { name: 'Beta', categories: [{ name: 'Core functionality', bullets: 184, sample: 'y' }], total_tasks: 184, depends_on: ['Alpha'] },
      ],
      total_tasks: 280, confidence: 'low', drivers: [],
    }

    let md = ''
    expect(() => {
      md = renderQuote({ ...base, shape: cyclic, quote: { ...quote, mode: 'program' }, rateShown: true })
    }).not.toThrow()

    // Both subsystems must survive the cycle — losing one would understate the
    // quote a client is reading.
    expect(md).toMatch(/### Phase 1 — Alpha/)
    expect(md).toMatch(/### Phase 2 — Beta/)
  })

  it('lists subsystems and phase order in program mode', () => {
    const prog: EstimateShape = {
      mode: 'program', umbrella: 'Platform',
      subsystems: [
        { name: 'Identity', categories: [{ name: 'Authentication & User Management', bullets: 96, sample: 'x' }], total_tasks: 96, depends_on: [] },
        { name: 'Scheduling', categories: [{ name: 'Core functionality', bullets: 184, sample: 'y' }], total_tasks: 184, depends_on: ['Identity'] },
      ],
      total_tasks: 280, confidence: 'low', drivers: [],
    }
    const md = renderQuote({ ...base, shape: prog, quote: { ...quote, mode: 'program' }, rateShown: true })
    expect(md).toContain('Identity')
    expect(md).toContain('Scheduling')
    expect(md).toMatch(/Phase 1/)
  })
})
