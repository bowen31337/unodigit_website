import type { EstimateShape, Quote, Confidence } from '@unodigit/ba-bot-contract'
import { CATEGORY_WEIGHTS } from '../estimator/categories'

export interface PricingConfig {
  rateAud: number
  minimumAud: number
  tasksPerWeek: number
  quoteValidDays: number
}

/**
 * Band width by estimator confidence. A band converts better than a point
 * estimate and protects against estimation error; a point estimate invites
 * haggling over the decomposition rather than the outcome.
 */
const BAND: Record<Confidence, number> = {
  high: 0.25,
  medium: 0.35,
  low: 0.5,
}

export function weightedTasks(shape: EstimateShape): number {
  const cats =
    shape.mode === 'single'
      ? shape.categories
      : shape.subsystems.flatMap((s) => s.categories)

  return cats.reduce((sum, c) => sum + c.bullets * CATEGORY_WEIGHTS[c.name], 0)
}

export function priceQuote(shape: EstimateShape, cfg: PricingConfig): Quote {
  const weighted = weightedTasks(shape)
  const midpoint = weighted * cfg.rateAud
  const band = BAND[shape.confidence]

  return {
    mode: shape.mode,
    totalTasks: shape.total_tasks,
    weightedTasks: weighted,
    rateAud: cfg.rateAud,
    lowAud: Math.round(midpoint * (1 - band)),
    highAud: Math.round(midpoint * (1 + band)),
    // Never report zero weeks — a quote promising delivery in no time reads as
    // a bug, not as speed.
    weeks: Math.max(1, Math.ceil(weighted / cfg.tasksPerWeek)),
    confidence: shape.confidence,
    belowFloor: midpoint < cfg.minimumAud,
  }
}
