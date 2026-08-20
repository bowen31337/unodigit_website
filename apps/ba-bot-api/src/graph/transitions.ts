import { STATES, type Slots, type StateId } from './states'

export interface ConversationState {
  state: StateId
  slots: Slots
  turnsInState: number
  totalTurns: number
  forcedAdvances: StateId[]
}

export interface TurnInput {
  slots: Slots
  readyToAdvance: boolean
  offTopic: boolean
}

export interface StepResult {
  next: ConversationState
  advanced: boolean
  forced: boolean
  finished: boolean
}

export function initialState(): ConversationState {
  return { state: 'GREETING', slots: {}, turnsInState: 0, totalTurns: 0, forcedAdvances: [] }
}

/**
 * Merge this turn's slots into the session.
 *
 * Array slots ACCUMULATE by union; scalar slots overwrite.
 *
 * A shallow spread was replacing arrays wholesale, and that quietly broke every
 * array-based exit gate. The model reports what it learned THIS turn — "we just
 * covered UI/UX and API layer" — so each turn overwrote the areas covered
 * before it, and `covered_categories` could never grow past one turn's worth.
 * Measured live: FEATURE_MAP ran its full 12-turn budget and force-advanced
 * having recorded no categories at all, while the visitor had in fact walked
 * all seven areas.
 *
 * The same defect applied to personas, mvp_must, mvp_wont, features and
 * integrations — the gates counted only the most recent turn.
 *
 * Trade-off, deliberately taken: a visitor who RETRACTS something ("actually
 * drop the weekly report") cannot shrink a list this way. That is the rarer
 * case in a 20-minute scoping interview than incremental disclosure, and a
 * brief that over-lists is safer than one that silently forgets.
 */
function mergeSlots(current: Slots, incoming: Slots): Slots {
  const out: Slots = { ...current }

  for (const [key, value] of Object.entries(incoming)) {
    const existing = out[key]
    if (Array.isArray(value) && Array.isArray(existing)) {
      const seen = new Set(existing.map((v) => JSON.stringify(v)))
      out[key] = [...existing, ...value.filter((v) => !seen.has(JSON.stringify(v)))]
    } else {
      out[key] = value
    }
  }

  return out
}

export function step(current: ConversationState, input: TurnInput): StepResult {
  const def = STATES[current.state]
  const totalTurns = current.totalTurns + 1

  // Off-topic input never advances the interview and never writes slots.
  // It consumes a global turn so a troll cannot loop forever, but it must not
  // burn the state's own budget or a real visitor would be forced onward for
  // asking one unrelated question.
  if (input.offTopic) {
    return {
      next: { ...current, totalTurns },
      advanced: false,
      forced: false,
      finished: current.state === 'DONE',
    }
  }

  const slots: Slots = mergeSlots(current.slots, input.slots)
  const turnsInState = current.turnsInState + 1

  const gateMet = def.exitGate(slots) && input.readyToAdvance
  const canForce = def.forceAdvance ?? true
  const forced = !gateMet && canForce && turnsInState >= def.maxTurns

  if (!gateMet && !forced) {
    return {
      next: { ...current, slots, turnsInState, totalTurns },
      advanced: false,
      forced: false,
      finished: false,
    }
  }

  const nextId = def.next ?? current.state

  return {
    next: {
      state: nextId,
      slots,
      turnsInState: 0,
      totalTurns,
      forcedAdvances: forced ? [...current.forcedAdvances, current.state] : current.forcedAdvances,
    },
    advanced: true,
    forced,
    finished: nextId === 'DONE',
  }
}
