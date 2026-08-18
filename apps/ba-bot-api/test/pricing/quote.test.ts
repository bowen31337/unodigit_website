import { describe, it, expect } from 'vitest'
import { CATEGORY_WEIGHTS } from '../../src/estimator/categories'
import { weightedTasks, priceQuote, type PricingConfig } from '../../src/pricing/quote'
import type { EstimateShape } from '@unodigit/ba-bot-contract'

const cfg: PricingConfig = {
  rateAud: 10,
  minimumAud: 6000,
  tasksPerWeek: 25,
  quoteValidDays: 30,
}

const single = (cats: Array<[string, number]>, confidence: 'high' | 'medium' | 'low' = 'high'): EstimateShape => ({
  mode: 'single',
  categories: cats.map(([name, bullets]) => ({ name: name as never, bullets, sample: 'User can do a thing (returns 201)' })),
  total_tasks: cats.reduce((n, [, b]) => n + b, 0),
  confidence,
  drivers: [],
})

describe('CATEGORY_WEIGHTS', () => {
  it('covers all seven categories', () => {
    expect(Object.keys(CATEGORY_WEIGHTS)).toHaveLength(7)
  })

  it('weights integrations above UI/UX', () => {
    expect(CATEGORY_WEIGHTS['Integrations']).toBeGreaterThan(CATEGORY_WEIGHTS['UI/UX'])
  })
})

describe('weightedTasks', () => {
  it('applies the per-category weight', () => {
    // 10 Integrations @1.5 = 15; 10 UI/UX @0.8 = 8 -> 23
    const shape = single([['Integrations', 10], ['UI/UX', 10]])
    expect(weightedTasks(shape)).toBeCloseTo(23, 5)
  })

  it('sums across subsystems in program mode', () => {
    const shape: EstimateShape = {
      mode: 'program',
      umbrella: 'Platform',
      subsystems: [
        { name: 'A', categories: [{ name: 'Integrations', bullets: 10, sample: 'x' }], total_tasks: 10, depends_on: [] },
        { name: 'B', categories: [{ name: 'UI/UX', bullets: 10, sample: 'x' }], total_tasks: 10, depends_on: ['A'] },
      ],
      total_tasks: 20,
      confidence: 'low',
      drivers: [],
    }
    expect(weightedTasks(shape)).toBeCloseTo(23, 5)
  })
})

describe('priceQuote', () => {
  it('bands +/-25% at high confidence', () => {
    const q = priceQuote(single([['API layer', 100]], 'high'), cfg)
    // 100 tasks @1.0 weight @ $10 = $1000 midpoint
    expect(q.weightedTasks).toBeCloseTo(100, 5)
    expect(q.lowAud).toBe(750)
    expect(q.highAud).toBe(1250)
  })

  it('widens the band at medium and low confidence', () => {
    expect(priceQuote(single([['API layer', 100]], 'medium'), cfg).lowAud).toBe(650)
    expect(priceQuote(single([['API layer', 100]], 'low'), cfg).lowAud).toBe(500)
  })

  it('flags projects below the engagement floor', () => {
    // 100 tasks -> $1000 midpoint, under the $6000 minimum
    expect(priceQuote(single([['API layer', 100]]), cfg).belowFloor).toBe(true)
  })

  it('does not flag projects at or above the floor', () => {
    expect(priceQuote(single([['API layer', 600]]), cfg).belowFloor).toBe(false)
  })

  it('derives a whole number of weeks, rounding up', () => {
    // 100 weighted / 25 per week = 4
    expect(priceQuote(single([['API layer', 100]]), cfg).weeks).toBe(4)
    // 101 weighted -> 4.04 -> 5
    expect(priceQuote(single([['API layer', 101]]), cfg).weeks).toBe(5)
  })

  it('always reports at least one week', () => {
    expect(priceQuote(single([['API layer', 1]]), cfg).weeks).toBe(1)
  })

  it('returns whole-dollar band bounds', () => {
    const q = priceQuote(single([['Integrations', 37]], 'medium'), cfg)
    expect(Number.isInteger(q.lowAud)).toBe(true)
    expect(Number.isInteger(q.highAud)).toBe(true)
  })

  it('carries mode, totalTasks and confidence through', () => {
    const q = priceQuote(single([['API layer', 100]], 'medium'), cfg)
    expect(q.mode).toBe('single')
    expect(q.totalTasks).toBe(100)
    expect(q.confidence).toBe('medium')
    expect(q.rateAud).toBe(10)
  })
})
