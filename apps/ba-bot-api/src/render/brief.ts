import type { Slots } from '../graph/states'

export interface BriefSections {
  executiveSummary: string
  problem: string
  solution: string
  users: string
  scope: string
  constraints: string
}

/** A brief with a visible gap is more useful to sales than one that hides it —
 *  the gap tells them what to ask on the call. */
const MISSING = '_Not captured during the interview._'

const str = (s: Slots, k: string): string =>
  typeof s[k] === 'string' && (s[k] as string).trim() ? (s[k] as string).trim() : ''

const list = (s: Slots, k: string): string[] =>
  Array.isArray(s[k]) ? (s[k] as unknown[]).filter((x): x is string => typeof x === 'string') : []

const bullets = (items: string[]): string =>
  items.length ? items.map((i) => `- ${i}`).join('\n') : MISSING

const para = (text: string): string => (text ? text : MISSING)

export function buildBriefSections(slots: Slots): BriefSections {
  const name = str(slots, 'project_name') || 'the project'
  const audience = str(slots, 'audience')
  const problem = str(slots, 'problem')
  const solution = str(slots, 'solution_summary')
  const differentiator = str(slots, 'differentiator')

  const summary =
    solution && audience
      ? `${name} is ${solution.charAt(0).toLowerCase()}${solution.slice(1)} for ${audience}.`
      : ''

  return {
    executiveSummary: para(summary),
    problem: para(problem),
    solution: para([solution, differentiator && `Differentiator: ${differentiator}`].filter(Boolean).join('\n\n')),
    users: bullets(list(slots, 'personas')),
    scope: [
      '**Must have**',
      bullets(list(slots, 'mvp_must')),
      '',
      '**Explicitly out of scope**',
      bullets(list(slots, 'mvp_wont')),
    ].join('\n'),
    constraints: bullets(
      [
        str(slots, 'timeline') && `Timeline: ${str(slots, 'timeline')}`,
        str(slots, 'budget_band') && `Budget expectation: ${str(slots, 'budget_band')}`,
        str(slots, 'stack_preference') && `Stack preference: ${str(slots, 'stack_preference')}`,
        list(slots, 'integrations').length && `Integrations: ${list(slots, 'integrations').join(', ')}`,
      ].filter((x): x is string => typeof x === 'string' && x.length > 0),
    ),
  }
}

export function renderBrief(sections: BriefSections, projectName: string): string {
  return [
    `# ${projectName} — Project Brief`,
    '',
    '## Executive summary',
    sections.executiveSummary,
    '',
    '## Problem',
    sections.problem,
    '',
    '## Proposed solution',
    sections.solution,
    '',
    '## Target users',
    sections.users,
    '',
    '## MVP scope',
    sections.scope,
    '',
    '## Constraints',
    sections.constraints,
    '',
  ].join('\n')
}
