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

  it('FEATURE_MAP exit gate requires at least three covered categories', () => {
    const gate = STATES.FEATURE_MAP.exitGate
    expect(gate({ covered_categories: ['Core functionality'] })).toBe(false)
    expect(gate({
      covered_categories: ['Core functionality', 'Data management', 'UI/UX'],
    })).toBe(true)
  })

  it('exposes the seven claw-forge categories', () => {
    expect(FEATURE_CATEGORIES).toHaveLength(7)
    expect(FEATURE_CATEGORIES).toContain('Integrations')
  })
})
