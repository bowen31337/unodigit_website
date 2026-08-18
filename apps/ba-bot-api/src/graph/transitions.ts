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

  const slots: Slots = { ...current.slots, ...input.slots }
  const turnsInState = current.turnsInState + 1

  const gateMet = def.exitGate(slots) && input.readyToAdvance
  const forced = !gateMet && turnsInState >= def.maxTurns

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
