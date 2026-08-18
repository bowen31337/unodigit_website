import { z } from 'zod'

export type StateId =
  | 'GREETING'
  | 'PROJECT_IDENTITY'
  | 'SOLUTION_SHAPE'
  | 'USERS_AND_SCOPE'
  | 'FEATURE_MAP'
  | 'CONSTRAINTS'
  | 'CONTACT'
  | 'GENERATE'
  | 'DONE'

export type Slots = Record<string, unknown>

export interface StateDef {
  id: StateId
  next: StateId | null
  slotSchema: z.ZodTypeAny
  exitGate: (slots: Slots) => boolean
  maxTurns: number
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
      })
      .strict(),
    exitGate: (s) => !!str(s, 'solution_summary'),
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
      })
      .strict(),
    exitGate: (s) => arr(s, 'personas').length > 0 && arr(s, 'mvp_must').length > 0,
    maxTurns: 6,
  },

  FEATURE_MAP: {
    id: 'FEATURE_MAP',
    next: 'CONSTRAINTS',
    slotSchema: z
      .object({
        covered_categories: z.array(z.string()).optional(),
        features: z.array(z.string()).optional(),
      })
      .strict(),
    exitGate: (s) => arr(s, 'covered_categories').length >= 3,
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
      })
      .strict(),
    exitGate: (s) => !!str(s, 'timeline') || !!str(s, 'budget_band'),
    maxTurns: 5,
  },

  // Handled by POST /api/contact, not by the LLM. The graph only waits here.
  CONTACT: {
    id: 'CONTACT',
    next: 'GENERATE',
    slotSchema: z.object({}).strict(),
    exitGate: (s) => !!str(s, 'lead_id'),
    maxTurns: 3,
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
