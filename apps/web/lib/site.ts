/**
 * The canonical facts about the business, in one place.
 *
 * Everything that describes Uno Digit to a machine reads from here: the
 * JSON-LD entity graph, sitemap.xml, robots.txt and llms.txt. Keeping one
 * source means a fact can never be true in the sitemap and stale in the
 * schema.
 *
 * RULE FOR THIS FILE: every value must be independently verifiable from the
 * site itself or from a link below. Structured data is what answer engines
 * quote back to people as fact, so an invented street address, phone number,
 * headcount or star rating is not "filling in a field" — it is publishing a
 * false record that Google, ChatGPT and Perplexity will repeat. Where we do
 * not have a fact (street address, phone, ABN, reviews), the property is
 * OMITTED. An absent property costs a little rich-result eligibility; a
 * fabricated one costs trust and can earn a manual action.
 */

/**
 * The canonical host is `www`. The apex `unodigit.com.au` has NO A/AAAA/CNAME
 * record at OnlyDomains (where this zone's DNS lives) — it resolves to nothing,
 * so it cannot serve the site and cannot even issue a redirect. Only
 * `www.unodigit.com.au` is a Cloudflare Pages custom domain with a certificate.
 *
 * This constant previously said the apex, which meant every canonical, og:url,
 * sitemap <loc> and JSON-LD @id on the live site pointed at a hostname that
 * does not resolve. Do not change it back without first giving the apex a
 * record; the apex's MX/SPF (Zoho mail) are unaffected either way.
 */
export const SITE_URL = 'https://www.unodigit.com.au'

/** trailingSlash: true in next.config.js — canonical URLs must match it. */
export function absoluteUrl(path = '/'): string {
  const clean = path.startsWith('/') ? path : `/${path}`
  const withSlash = clean.endsWith('/') ? clean : `${clean}/`
  return `${SITE_URL}${withSlash === '//' ? '/' : withSlash}`
}

export const ORG = {
  name: 'Uno Digit',
  legalName: 'Uno Digit',
  /** Stable @id so every page's JSON-LD points at ONE entity node, not six. */
  id: `${SITE_URL}/#organization`,
  url: `${SITE_URL}/`,
  logo: `${SITE_URL}/logo.png`,
  email: 'info@unodigit.com.au',
  foundingYear: 2018,
  description:
    "Uno Digit is a Sydney-based AI and digital transformation consultancy. It partners with enterprises to build AI strategy, machine learning systems, data platforms and the applications around them.",
  /** Locality only. There is no street address published anywhere on the site. */
  address: {
    locality: 'Sydney',
    region: 'NSW',
    country: 'AU',
  },
  /** Verifiable profiles — these are how a knowledge graph reconciles the entity. */
  sameAs: [
    'https://www.linkedin.com/company/101707731',
    'https://github.com/organizations/unodigit/',
  ],
} as const

/**
 * Where the work happens. "Based in Sydney, working worldwide" is the claim
 * the footer already makes, so the served area is the country plus the world,
 * with Sydney as the place of business.
 */
export const AREA_SERVED = [
  { type: 'City', name: 'Sydney' },
  { type: 'State', name: 'New South Wales' },
  { type: 'Country', name: 'Australia' },
] as const

/** Mirrors the six cards on /services. Kept in sync by hand — they are copy. */
export const SERVICES = [
  { name: 'AI Strategy & Consulting', description: 'Strategic roadmaps for AI adoption that align with your business objectives.' },
  { name: 'Machine Learning Solutions', description: 'Custom ML models for predictive analytics, NLP and computer vision.' },
  { name: 'Data Engineering', description: 'Robust data pipelines and infrastructure for AI-ready organisations.' },
  { name: 'Web & App Development', description: 'Modern, scalable applications built with current technology.' },
  { name: 'Process Automation', description: 'Intelligent automation to streamline operations and reduce cost.' },
  { name: 'Cloud & MLOps', description: 'Enterprise-grade infrastructure for deploying and scaling AI solutions.' },
] as const

/** Static routes, in navigation order. /q is excluded — it is noindex. */
export const STATIC_ROUTES = ['/', '/about', '/services', '/work', '/insights', '/contact'] as const

/**
 * The article `date` fields are display strings ("Dec 15, 2024"). Schema.org
 * and OpenGraph both want ISO 8601, and `publishedTime` was being handed the
 * display string verbatim — an invalid date that crawlers drop.
 *
 * Date precision only (no time, no zone): the site records a publication day,
 * and inventing "T00:00:00Z" would assert a UTC midnight nobody published at.
 */
export function toIsoDate(display: string): string | undefined {
  const parsed = new Date(`${display} 12:00:00`)
  if (Number.isNaN(parsed.getTime())) return undefined
  const m = `${parsed.getMonth() + 1}`.padStart(2, '0')
  const d = `${parsed.getDate()}`.padStart(2, '0')
  return `${parsed.getFullYear()}-${m}-${d}`
}
