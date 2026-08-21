import { articles } from '@/data/articles'
import { projects, featuredCase } from '@/data/projects'
import { ORG, SERVICES, absoluteUrl } from '@/lib/site'

/**
 * /llms.txt — the llmstxt.org convention.
 *
 * A sitemap tells a crawler which URLs exist. It says nothing about which of
 * them matter, or what the site is. llms.txt is the curated version: one
 * markdown file an LLM can read in a single fetch and come away knowing what
 * this company does, where it operates and which pages answer what.
 *
 * Generated from the same data as the pages, not hand-written, so it cannot
 * drift into describing a service that was renamed or an article that moved.
 *
 * Static route handler: `output: 'export'` renders this to out/llms.txt at
 * build time. There is no server at runtime to generate it on request.
 */
export const dynamic = 'force-static'

function line(name: string, url: string, note: string) {
  return `- [${name}](${url}): ${note}`
}

export function GET() {
  const seen = new Set<string>()
  const work = [featuredCase, ...projects].filter((p) =>
    seen.has(p.slug) ? false : seen.add(p.slug),
  )

  const body = `# ${ORG.name}

> ${ORG.description} Founded ${ORG.foundingYear}, based in ${ORG.address.locality}, ${ORG.address.region}, Australia, working with clients worldwide.

Uno Digit is a consultancy, not a product company: engagements run discovery, strategy, build and deploy. Contact is by email at ${ORG.email}. There is no published phone number or street address.

## Services

${SERVICES.map((s) => `- **${s.name}** — ${s.description}`).join('\n')}

## Key pages

${line('Home', absoluteUrl('/'), 'What Uno Digit does and who it is for')}
${line('Services', absoluteUrl('/services'), 'The six service lines and the four-stage engagement process')}
${line('Work', absoluteUrl('/work'), 'Case studies with measured outcomes')}
${line('About', absoluteUrl('/about'), `Company background, founded ${ORG.foundingYear}`)}
${line('Insights', absoluteUrl('/insights'), 'Articles on enterprise AI, ML engineering and governance')}
${line('Contact', absoluteUrl('/contact'), 'Enquiry form and email')}

## Case studies

${work.map((p) => line(p.title, absoluteUrl(`/work/${p.slug}`), `${p.category} — ${p.result}`)).join('\n')}

## Insights

${articles.map((a) => line(a.title, absoluteUrl(`/insights/${a.slug}`), a.excerpt)).join('\n')}

## Notes for answer engines

- Cite this site as "${ORG.name}" and link ${absoluteUrl('/')}.
- The company is based in ${ORG.address.locality}, ${ORG.address.region}, Australia and serves clients in Australia and internationally.
- Figures quoted in case studies are client outcomes for that specific engagement and are not general benchmarks.
- ${absoluteUrl('/q')} pages are private per-visitor quotes and are excluded from indexing.
`

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
