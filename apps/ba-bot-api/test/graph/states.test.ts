import { describe, it, expect } from 'vitest'
import { STATES, FEATURE_CATEGORIES, type StateId } from '../../src/graph/states'

describe('state registry', () => {
  it('every state declares a positive maxTurns', () => {
    for (const def of Object.values(STATES)) {
      expect(def.maxTurns).toBeGreaterThan(0)
    }
  })

  it('chains from GREETING to DONE with no orphans', () => {
    const seen = new Set<StateId>()
    let cur: StateId | null = 'GREETING'
    while (cur !== null) {
      expect(seen.has(cur)).toBe(false)
      seen.add(cur)
      cur = STATES[cur].next
    }
    expect(seen.size).toBe(Object.keys(STATES).length)
    expect(seen.has('DONE')).toBe(true)
  })

  it('DONE is terminal', () => {
    expect(STATES.DONE.next).toBeNull()
  })

  it('PROJECT_IDENTITY exit gate requires all three slots', () => {
    const gate = STATES.PROJECT_IDENTITY.exitGate
    expect(gate({})).toBe(false)
    expect(gate({ project_name: 'X', audience: 'Y' })).toBe(false)
    expect(gate({ project_name: 'X', audience: 'Y', problem: 'Z' })).toBe(true)
  })

  // Raised from 3 to 5. At 3, four whole areas — UI/UX, API layer, Admin,
  // Integrations — were routinely never discussed, and they are real task
  // volume: a richer brief measured 121 tasks against 87 for the same project.
  it('FEATURE_MAP exit gate requires at least five covered categories', () => {
    const gate = STATES.FEATURE_MAP.exitGate
    expect(gate({ covered_categories: ['Core functionality'] })).toBe(false)
    expect(gate({
      covered_categories: ['Core functionality', 'Data management', 'UI/UX'],
    })).toBe(false)
    expect(gate({
      covered_categories: [
        'Authentication & User Management', 'Core functionality',
        'Data management', 'UI/UX', 'API layer',
      ],
    })).toBe(true)
  })

  it('SOLUTION_SHAPE requires a differentiator, not just a summary', () => {
    const gate = STATES.SOLUTION_SHAPE.exitGate
    expect(gate({ solution_summary: 'live stock view' })).toBe(false)
    expect(gate({ solution_summary: 'live stock view', differentiator: 'real time' })).toBe(true)
  })

  it('USERS_AND_SCOPE requires two personas, three must-haves and a boundary', () => {
    const gate = STATES.USERS_AND_SCOPE.exitGate
    expect(gate({ personas: ['staff'], mvp_must: ['a', 'b', 'c'], mvp_wont: ['x'] })).toBe(false)
    expect(gate({ personas: ['staff', 'manager'], mvp_must: ['a'], mvp_wont: ['x'] })).toBe(false)
    expect(gate({ personas: ['staff', 'manager'], mvp_must: ['a', 'b', 'c'] })).toBe(false)
    expect(gate({
      personas: ['staff', 'manager'], mvp_must: ['a', 'b', 'c'], mvp_wont: ['x'],
    })).toBe(true)
  })

  // Timeline is mandatory; budget is not, so a visitor who will not name a
  // number can still progress on a technical answer.
  it('CONSTRAINTS requires a timeline plus either budget or stack', () => {
    const gate = STATES.CONSTRAINTS.exitGate
    expect(gate({ budget_band: '80-120k' })).toBe(false)
    expect(gate({ timeline: 'three months' })).toBe(false)
    expect(gate({ timeline: 'three months', budget_band: '80-120k' })).toBe(true)
    expect(gate({ timeline: 'three months', stack_preference: 'Azure' })).toBe(true)
  })

  it('exposes the seven claw-forge categories', () => {
    expect(FEATURE_CATEGORIES).toHaveLength(7)
    expect(FEATURE_CATEGORIES).toContain('Integrations')
  })
})
