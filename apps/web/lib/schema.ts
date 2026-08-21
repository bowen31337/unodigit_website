/**
 * The JSON-LD entity graph.
 *
 * WHY A GRAPH AND NOT ONE BLOB PER PAGE
 * -------------------------------------
 * Answer engines and knowledge graphs reconcile entities by `@id`. Six pages
 * that each declare an unlinked `Organization` named "Uno Digit" can resolve
 * to six different organisations with no authority between them. So every
 * page emits ONE `@graph` whose nodes carry stable `@id`s and reference each
 * other: the Organization node is always `{SITE_URL}/#organization`, and each
 * page's WebPage node points `isPartOf` -> WebSite and `about`/`publisher` ->
 * Organization.
 *
 * This is the highest-leverage GEO change on the site: ChatGPT, Perplexity and
 * Google's AI Overviews all lean on structured data to decide *who* is making
 * a claim, and an unattributed page is a page not worth citing.
 *
 * Nothing here invents a fact — see the rule at the top of lib/site.ts.
 */
import { ORG, SITE_URL, AREA_SERVED, SERVICES, absoluteUrl } from './site'

type Node = Record<string, unknown>

const WEBSITE_ID = `${SITE_URL}/#website`

/** The organisation, as ProfessionalService — a consultancy, not a shop. */
function organizationNode(): Node {
  return {
    '@type': ['Organization', 'ProfessionalService'],
    '@id': ORG.id,
    name: ORG.name,
    legalName: ORG.legalName,
    url: ORG.url,
    description: ORG.description,
    foundingDate: String(ORG.foundingYear),
    email: ORG.email,
    logo: { '@type': 'ImageObject', '@id': `${SITE_URL}/#logo`, url: ORG.logo, contentUrl: ORG.logo },
    image: { '@id': `${SITE_URL}/#logo` },
    // Locality only — no streetAddress is published, so none is asserted.
    address: {
      '@type': 'PostalAddress',
      addressLocality: ORG.address.locality,
      addressRegion: ORG.address.region,
      addressCountry: ORG.address.country,
    },
    areaServed: AREA_SERVED.map((a) => ({ '@type': a.type, name: a.name })),
    knowsAbout: [
      'Artificial intelligence consulting',
      'Machine learning engineering',
      'Data engineering',
      'MLOps',
      'Process automation',
      'Digital transformation',
    ],
    sameAs: [...ORG.sameAs],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'sales',
      email: ORG.email,
      areaServed: 'AU',
      availableLanguage: 'English',
    },
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'AI and digital transformation services',
      itemListElement: SERVICES.map((s) => ({
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name: s.name, description: s.description, provider: { '@id': ORG.id } },
      })),
    },
  }
}

function websiteNode(): Node {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: `${SITE_URL}/`,
    name: ORG.name,
    description: ORG.description,
    publisher: { '@id': ORG.id },
    inLanguage: 'en-AU',
  }
}

export interface PageSchemaInput {
  /** Route path, e.g. '/services' or '/insights/some-slug'. */
  path: string
  title: string
  description: string
  /** Trail from the site root, excluding the home crumb (added automatically). */
  breadcrumbs?: { name: string; path: string }[]
  /** Extra nodes: Article, FAQPage, ItemList, etc. */
  extra?: Node[]
  /** Overrides the WebPage @type — e.g. 'AboutPage', 'ContactPage', 'CollectionPage'. */
  pageType?: string
}

/**
 * Builds the full graph for one page. Emitted once per page from a <script
 * type="application/ld+json"> in the server component, so it is present in the
 * static HTML — a crawler that runs no JavaScript still sees all of it.
 */
export function pageSchema({
  path,
  title,
  description,
  breadcrumbs = [],
  extra = [],
  pageType = 'WebPage',
}: PageSchemaInput): Node {
  const url = absoluteUrl(path)
  const nodes: Node[] = [
    organizationNode(),
    websiteNode(),
    {
      '@type': pageType,
      '@id': `${url}#webpage`,
      url,
      name: title,
      description,
      isPartOf: { '@id': WEBSITE_ID },
      about: { '@id': ORG.id },
      inLanguage: 'en-AU',
      ...(breadcrumbs.length ? { breadcrumb: { '@id': `${url}#breadcrumb` } } : {}),
    },
  ]

  if (breadcrumbs.length) {
    nodes.push({
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: [{ name: 'Home', path: '/' }, ...breadcrumbs].map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.name,
        item: absoluteUrl(c.path),
      })),
    })
  }

  return { '@context': 'https://schema.org', '@graph': [...nodes, ...extra] }
}

/** A published insight. */
export function articleNode(a: {
  path: string
  title: string
  excerpt: string
  isoDate?: string
  category: string
}): Node {
  const url = absoluteUrl(a.path)
  return {
    '@type': 'BlogPosting',
    '@id': `${url}#article`,
    isPartOf: { '@id': `${url}#webpage` },
    mainEntityOfPage: { '@id': `${url}#webpage` },
    headline: a.title,
    description: a.excerpt,
    articleSection: a.category,
    url,
    inLanguage: 'en-AU',
    ...(a.isoDate ? { datePublished: a.isoDate, dateModified: a.isoDate } : {}),
    // The site publishes no per-article byline, so the organisation is the
    // author. Inventing a person here would be inventing a person.
    author: { '@id': ORG.id },
    publisher: { '@id': ORG.id },
  }
}

/** A case study. Not an Article — it is a described project with an outcome. */
export function caseStudyNode(p: {
  path: string
  title: string
  description: string
  category: string
  result: string
  client?: string
  tags?: string[]
}): Node {
  const url = absoluteUrl(p.path)
  return {
    '@type': 'CreativeWork',
    '@id': `${url}#casestudy`,
    isPartOf: { '@id': `${url}#webpage` },
    mainEntityOfPage: { '@id': `${url}#webpage` },
    name: p.title,
    headline: p.title,
    description: p.description,
    abstract: p.result,
    genre: p.category,
    url,
    inLanguage: 'en-AU',
    creator: { '@id': ORG.id },
    publisher: { '@id': ORG.id },
    ...(p.tags?.length ? { keywords: p.tags.join(', ') } : {}),
  }
}

/**
 * FAQPage. This is the single most directly quotable structure an answer
 * engine can find: a question with a self-contained answer is exactly the
 * shape of the thing it is trying to generate.
 */
export function faqNode(path: string, faqs: { q: string; a: string }[]): Node {
  return {
    '@type': 'FAQPage',
    '@id': `${absoluteUrl(path)}#faq`,
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }
}

/** A listing page (work index, insights index) as an ordered ItemList. */
export function itemListNode(path: string, items: { name: string; path: string }[]): Node {
  return {
    '@type': 'ItemList',
    '@id': `${absoluteUrl(path)}#list`,
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      url: absoluteUrl(it.path),
    })),
  }
}
