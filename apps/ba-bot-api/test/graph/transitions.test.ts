import { describe, it, expect } from 'vitest'
import { initialState, step, type ConversationState } from '../../src/graph/transitions'

const at = (state: ConversationState['state'], over: Partial<ConversationState> = {}): ConversationState => ({
  ...initialState(), state, ...over,
})

describe('step()', () => {
  it('starts at GREETING with empty slots', () => {
    const s = initialState()
    expect(s.state).toBe('GREETING')
    expect(s.turnsInState).toBe(0)
    expect(s.totalTurns).toBe(0)
    expect(s.forcedAdvances).toEqual([])
  })

  it('off-topic input consumes a total turn but not a state turn', () => {
    const r = step(at('PROJECT_IDENTITY'), { slots: {}, readyToAdvance: false, offTopic: true })
    expect(r.next.state).toBe('PROJECT_IDENTITY')
    expect(r.next.turnsInState).toBe(0)
    expect(r.next.totalTurns).toBe(1)
    expect(r.advanced).toBe(false)
  })

  it('off-topic input does not merge slots', () => {
    const r = step(at('PROJECT_IDENTITY'), {
      slots: { project_name: 'injected' }, readyToAdvance: true, offTopic: true,
    })
    expect(r.next.slots).toEqual({})
  })

  it('merges slots and stays put when the gate is unmet', () => {
    const r = step(at('PROJECT_IDENTITY'), {
      slots: { project_name: 'Acme' }, readyToAdvance: true, offTopic: false,
    })
    expect(r.next.state).toBe('PROJECT_IDENTITY')
    expect(r.next.slots).toEqual({ project_name: 'Acme' })
    expect(r.next.turnsInState).toBe(1)
    expect(r.advanced).toBe(false)
  })

  it('stays put when the gate is met but the model is not ready', () => {
    const r = step(at('PROJECT_IDENTITY'), {
      slots: { project_name: 'A', audience: 'B', problem: 'C' },
      readyToAdvance: false, offTopic: false,
    })
    expect(r.next.state).toBe('PROJECT_IDENTITY')
    expect(r.advanced).toBe(false)
  })

  it('advances when gate met and ready, resetting turnsInState', () => {
    const r = step(at('PROJECT_IDENTITY', { turnsInState: 2 }), {
      slots: { project_name: 'A', audience: 'B', problem: 'C' },
      readyToAdvance: true, offTopic: false,
    })
    expect(r.next.state).toBe('SOLUTION_SHAPE')
    expect(r.next.turnsInState).toBe(0)
    expect(r.advanced).toBe(true)
    expect(r.forced).toBe(false)
  })

  it('force-advances at maxTurns even with an unmet gate', () => {
    // PROJECT_IDENTITY.maxTurns is 6
    const r = step(at('PROJECT_IDENTITY', { turnsInState: 5 }), {
      slots: {}, readyToAdvance: false, offTopic: false,
    })
    expect(r.next.state).toBe('SOLUTION_SHAPE')
    expect(r.forced).toBe(true)
    expect(r.advanced).toBe(true)
    expect(r.next.forcedAdvances).toEqual(['PROJECT_IDENTITY'])
  })

  it('preserves slots collected before a forced advance', () => {
    const r = step(at('PROJECT_IDENTITY', { turnsInState: 5, slots: { project_name: 'A' } }), {
      slots: { audience: 'B' }, readyToAdvance: false, offTopic: false,
    })
    expect(r.next.slots).toEqual({ project_name: 'A', audience: 'B' })
  })

  it('marks finished when advancing into DONE', () => {
    const r = step(at('GENERATE'), { slots: {}, readyToAdvance: true, offTopic: false })
    expect(r.next.state).toBe('DONE')
    expect(r.finished).toBe(true)
  })

  it('is terminal at DONE', () => {
    const r = step(at('DONE'), { slots: {}, readyToAdvance: true, offTopic: false })
    expect(r.next.state).toBe('DONE')
    expect(r.finished).toBe(true)
  })

  it('does not mutate the input state', () => {
    const before = at('PROJECT_IDENTITY')
    const snapshot = JSON.stringify(before)
    step(before, { slots: { project_name: 'A' }, readyToAdvance: true, offTopic: false })
    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('CONTACT never force-advances at maxTurns with an unmet exit gate', () => {
    // CONTACT.maxTurns is 3; no lead_id means the exit gate is unmet.
    const r = step(at('CONTACT', { turnsInState: 3 }), {
      slots: {}, readyToAdvance: false, offTopic: false,
    })
    expect(r.next.state).toBe('CONTACT')
    expect(r.forced).toBe(false)
    expect(r.advanced).toBe(false)
    expect(r.next.forcedAdvances).toEqual([])
  })

  it('CONTACT still advances normally to GENERATE once the form submits', () => {
    const r = step(at('CONTACT'), {
      slots: { lead_id: 'lead_123' }, readyToAdvance: true, offTopic: false,
    })
    expect(r.next.state).toBe('GENERATE')
    expect(r.advanced).toBe(true)
    expect(r.forced).toBe(false)
  })

  it('other states still force-advance at their cap (mechanism intact)', () => {
    // PROJECT_IDENTITY.maxTurns is 6
    const r = step(at('PROJECT_IDENTITY', { turnsInState: 6 }), {
      slots: {}, readyToAdvance: false, offTopic: false,
    })
    expect(r.next.state).toBe('SOLUTION_SHAPE')
    expect(r.forced).toBe(true)
    expect(r.advanced).toBe(true)
  })
})

describe('array slot accumulation', () => {
  // A shallow spread replaced arrays wholesale, so every array-based exit gate
  // counted only the LAST turn. Live, FEATURE_MAP burned all 12 turns and
  // force-advanced with zero categories recorded, though the visitor had walked
  // all seven areas.
  const base = { ...initialState(), state: 'FEATURE_MAP' as const }

  it('accumulates array slots across turns instead of replacing them', () => {
    const first = step(base, {
      slots: { covered_categories: ['Core functionality', 'Data management'] },
      readyToAdvance: false, offTopic: false,
    })
    const second = step(first.next, {
      slots: { covered_categories: ['UI/UX', 'API layer'] },
      readyToAdvance: false, offTopic: false,
    })

    expect(second.next.slots['covered_categories']).toEqual([
      'Core functionality', 'Data management', 'UI/UX', 'API layer',
    ])
  })

  it('does not duplicate a value the visitor repeats', () => {
    const first = step(base, {
      slots: { mvp_must: ['scan in/out'] }, readyToAdvance: false, offTopic: false,
    })
    const second = step(first.next, {
      slots: { mvp_must: ['scan in/out', 'low-stock alerts'] },
      readyToAdvance: false, offTopic: false,
    })

    expect(second.next.slots['mvp_must']).toEqual(['scan in/out', 'low-stock alerts'])
  })

  it('still overwrites scalar slots', () => {
    const first = step(base, {
      slots: { timeline: 'six months' }, readyToAdvance: false, offTopic: false,
    })
    const second = step(first.next, {
      slots: { timeline: 'three months' }, readyToAdvance: false, offTopic: false,
    })

    expect(second.next.slots['timeline']).toBe('three months')
  })
})
