import { z } from 'zod'
import type { StateId } from '@unodigit/ba-bot-contract'

// Re-exported so existing importers of `StateId` from this module keep
// working; the union itself is now the wire contract's source of truth.
export type { StateId }

export type Slots = Record<string, unknown>

export interface StateDef {
  id: StateId
  next: StateId | null
  slotSchema: z.ZodTypeAny
  exitGate: (slots: Slots) => boolean
  maxTurns: number
  /**
   * Whether `maxTurns` is allowed to force-advance this state when its exit
   * gate is unmet. Defaults to true. Set false for states whose exit gate is
   * satisfied by an out-of-band I/O effect (not by anything step() can see in
   * `slots` from the LLM turn alone) where reaching maxTurns without that
   * effect means the visitor abandoned, not that the state timed out.
   */
  forceAdvance?: boolean
}

/** The seven categories claw-forge's create-spec walks. Order is stable. */
export const FEATURE_CATEGORIES = [
  'Authentication & User Management',
  'Core functionality',
  'Data management',
  'UI/UX',
  'API layer',
  'Admin features',
  'Integrations',
] as const

const str = (s: Slots, k: string): string =>
  typeof s[k] === 'string' ? (s[k] as string).trim() : ''

const arr = (s: Slots, k: string): unknown[] => (Array.isArray(s[k]) ? (s[k] as unknown[]) : [])

/**
 * Slots that are not owned by any one topic.
 *
 * A client volunteers these whenever they feel like it, and a strict per-state
 * schema silently discards anything the CURRENT state does not declare. Both
 * were learned the hard way:
 *
 *  - `complexity_driver` — three real interviews named the hardest part in
 *    three different states (PROJECT_IDENTITY, SOLUTION_SHAPE, FEATURE_MAP).
 *    Declaring it on one meant the single most estimate-relevant sentence in
 *    the conversation was folded into `problem`, or thrown away entirely.
 *  - `industry` — inferred as soon as the sector is apparent, which is usually
 *    the first message but need not be.
 *
 * Merged into every ELICITATION state, and deliberately not into CONTACT,
 * GENERATE or DONE: those declare no slots at all, and keeping them empty is
 * part of what makes `lead_id` unforgeable.
 */
const GLOBAL_SLOTS = {
  industry: z.string().optional(),
  complexity_driver: z.string().optional(),
}

export const STATES: Record<StateId, StateDef> = {
  GREETING: {
    id: 'GREETING',
    next: 'PROJECT_IDENTITY',
    slotSchema: z.object({}).strict(),
    exitGate: () => true,
    maxTurns: 2,
  },

  PROJECT_IDENTITY: {
    id: 'PROJECT_IDENTITY',
    next: 'SOLUTION_SHAPE',
    slotSchema: z
      .object({
        project_name: z.string().optional(),
        audience: z.string().optional(),
        problem: z.string().optional(),
        ...GLOBAL_SLOTS,
      })
      .strict(),
    exitGate: (s) => !!str(s, 'project_name') && !!str(s, 'audience') && !!str(s, 'problem'),
    maxTurns: 6,
  },

  SOLUTION_SHAPE: {
    id: 'SOLUTION_SHAPE',
    next: 'USERS_AND_SCOPE',
    slotSchema: z
      .object({
        solution_summary: z.string().optional(),
        differentiator: z.string().optional(),
        ...GLOBAL_SLOTS,
      })
      .strict(),
    // `differentiator` was a declared slot the gate never asked for, so the
    // state exited after a single turn. It is the one field that separates
    // "a stock tracker" from "a stock tracker that beats their spreadsheet",
    // and the estimator sizes against that distinction.
    exitGate: (s) => !!str(s, 'solution_summary') && !!str(s, 'differentiator'),
    maxTurns: 5,
  },

  USERS_AND_SCOPE: {
    id: 'USERS_AND_SCOPE',
    next: 'FEATURE_MAP',
    slotSchema: z
      .object({
        personas: z.array(z.string()).optional(),
        mvp_must: z.array(z.string()).optional(),
        mvp_wont: z.array(z.string()).optional(),
        ...GLOBAL_SLOTS,
      })
      .strict(),
    // Was personas >= 1 && mvp_must >= 1, which one sentence satisfies. A
    // single must-have is not an MVP, and `mvp_wont` — never required before —
    // is what makes an estimate defensible: without a stated boundary every
    // later disagreement is about scope nobody wrote down.
    exitGate: (s) =>
      arr(s, 'personas').length >= 2 &&
      arr(s, 'mvp_must').length >= 3 &&
      arr(s, 'mvp_wont').length >= 1,
    maxTurns: 7,
  },

  FEATURE_MAP: {
    id: 'FEATURE_MAP',
    next: 'CONSTRAINTS',
    slotSchema: z
      .object({
        covered_categories: z.array(z.string()).optional(),
        features: z.array(z.string()).optional(),
        ...GLOBAL_SLOTS,
      })
      .strict(),
    // 3 of 7 meant four whole areas — UI/UX, API layer, Admin, Integrations —
    // were routinely never discussed, and they are real task volume. 5 rather
    // than 7 because the prompt tells the model to skip areas that genuinely
    // do not apply, and a hard 7 would force it to invent them.
    exitGate: (s) => arr(s, 'covered_categories').length >= 5,
    maxTurns: 12,
  },

  CONSTRAINTS: {
    id: 'CONSTRAINTS',
    next: 'CONTACT',
    slotSchema: z
      .object({
        stack_preference: z.string().optional(),
        timeline: z.string().optional(),
        budget_band: z.string().optional(),
        integrations: z.array(z.string()).optional(),
        ...GLOBAL_SLOTS,
      })
      .strict(),
    // Was timeline OR budget_band. Timeline is now required — it is the one
    // constraint that changes the shape of a proposal — plus at least one of
    // budget or stack, so a visitor who will not name a number can still
    // progress on a technical answer.
    exitGate: (s) =>
      !!str(s, 'timeline') && (!!str(s, 'budget_band') || !!str(s, 'stack_preference')),
    maxTurns: 6,
  },

  // Handled by POST /api/contact, not by the LLM. The graph only waits here.
  // Must never force-advance: doing so would push a visitor into GENERATE
  // with no lead_id and no lead row in D1. A visitor who ignores the form
  // stays here until the global MAX_TOTAL_TURNS cap ends the session, so the
  // abandonment is correctly recorded as abandoned_at_state = 'CONTACT'.
  CONTACT: {
    id: 'CONTACT',
    next: 'GENERATE',
    slotSchema: z.object({}).strict(),
    exitGate: (s) => !!str(s, 'lead_id'),
    maxTurns: 3,
    forceAdvance: false,
  },

  // Orchestrator-driven; no LLM conversation turns occur in this state.
  GENERATE: {
    id: 'GENERATE',
    next: 'DONE',
    slotSchema: z.object({}).strict(),
    exitGate: () => true,
    maxTurns: 1,
  },

  DONE: {
    id: 'DONE',
    next: null,
    slotSchema: z.object({}).strict(),
    exitGate: () => true,
    maxTurns: 1,
  },
}
