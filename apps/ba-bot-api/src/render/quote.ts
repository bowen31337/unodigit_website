import type { EstimateShape, Quote, Subsystem } from '@unodigit/ba-bot-contract'
import { CATEGORY_WEIGHTS } from '../estimator/categories'

const aud = (n: number): string => `A$${n.toLocaleString('en-AU')}`

const day = (ts: number): string =>
  new Date(ts).toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })

/**
 * Orders subsystems so prerequisites come first, producing the delivery phases.
 * A malformed `depends_on` (cycle, unknown name) must not lose the quote — fall
 * back to declaration order rather than throwing.
 */
export function phaseOrder(subsystems: Subsystem[]): Subsystem[] {
  const byName = new Map(subsystems.map((s) => [s.name, s]))
  const done = new Set<string>()
  const out: Subsystem[] = []

  let progressed = true
  while (out.length < subsystems.length && progressed) {
    progressed = false
    for (const s of subsystems) {
      if (done.has(s.name)) continue
      const ready = s.depends_on.every((d) => !byName.has(d) || done.has(d))
      if (ready) {
        out.push(s)
        done.add(s.name)
        progressed = true
      }
    }
  }

  // Cycle: append whatever is left, in declaration order.
  for (const s of subsystems) if (!done.has(s.name)) out.push(s)
  return out
}

function categoryTable(cats: EstimateShape extends never ? never : { name: string; bullets: number; sample: string }[]): string {
  return [
    '| Area | Tasks | Weight | Example',
    '|---|---:|---:|---|',
    ...cats.map(
      (c) => `| ${c.name} | ${c.bullets} | ${CATEGORY_WEIGHTS[c.name as keyof typeof CATEGORY_WEIGHTS]}× | ${c.sample} |`,
    ),
  ].join('\n')
}

export function renderQuote(input: {
  quote: Quote
  shape: EstimateShape
  projectName: string
  validUntil: number
  rateShown: boolean
}): string {
  const { quote: q, shape, projectName, validUntil, rateShown } = input
  const out: string[] = [`# ${projectName} — Indicative Quote`, '']

  if (q.belowFloor) {
    // Quoting a figure the business cannot service profitably attracts leads it
    // must then reject — worse for the brand than not quoting.
    out.push(
      `This looks like a **smaller piece of work than our usual engagements** — around **${q.totalTasks} tasks**, roughly **${q.weeks} week${q.weeks === 1 ? '' : 's'}**.`,
      '',
      'Rather than quote a figure that would not serve you well, let us talk about a fixed-price starter engagement that fits the scope.',
      '',
    )
  } else {
    out.push(
      `**~${q.totalTasks} tasks · estimated ${aud(q.lowAud)}–${aud(q.highAud)} · roughly ${q.weeks} week${q.weeks === 1 ? '' : 's'}**`,
      '',
      `Confidence: ${q.confidence}.`,
      '',
    )
  }

  if (shape.mode === 'single') {
    out.push('## Breakdown', '', categoryTable(shape.categories), '')
  } else {
    out.push(`## ${shape.umbrella} — delivery phases`, '')
    phaseOrder(shape.subsystems).forEach((s, i) => {
      out.push(
        `### Phase ${i + 1} — ${s.name} (${s.total_tasks} tasks)`,
        s.depends_on.length ? `_Depends on: ${s.depends_on.join(', ')}_` : '',
        '',
        categoryTable(s.categories),
        '',
      )
    })
  }

  if (shape.drivers.length) {
    out.push('## What drives the size', '', ...shape.drivers.map((d) => `- ${d}`), '')
  }

  if (rateShown && !q.belowFloor) {
    out.push(
      '## How this is calculated',
      '',
      `Each task is one unit of work our agent harness executes and verifies. Tasks are weighted by area — integration work costs more than interface work — giving **${q.weightedTasks.toFixed(1)} weighted tasks** at **${aud(q.rateAud)} per task**.`,
      '',
    )
  }

  out.push(
    '## Assumptions and exclusions',
    '',
    '- Scope is as described in the accompanying project brief.',
    '- Third-party service costs (hosting, APIs, licences) are not included.',
    '- Content, branding, and copywriting are not included unless stated.',
    '',
    `_This is an **indicative** estimate produced from a short interview, not a fixed-price offer. It is valid until **${day(validUntil)}** and is subject to a scoping call._`,
    '',
  )

  return out.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n')
}
