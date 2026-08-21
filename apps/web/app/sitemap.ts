import type { MetadataRoute } from 'next'
import { articles } from '@/data/articles'
import { projects, featuredCase } from '@/data/projects'
import { STATIC_ROUTES, absoluteUrl, toIsoDate } from '@/lib/site'

/**
 * Emitted as a real /sitemap.xml at build time — `output: 'export'` renders
 * this file to disk rather than serving it from a function. There was no
 * sitemap at all before, so discovery relied entirely on internal links.
 *
 * /q/ is deliberately absent: it is a signed, per-visitor quote page marked
 * noindex. Listing it in a sitemap would be inviting the crawl we set that
 * header to prevent.
 */
export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  const statics = STATIC_ROUTES.map((path) => ({
    url: absoluteUrl(path),
    lastModified: now,
    changeFrequency: (path === '/' ? 'weekly' : 'monthly') as 'weekly' | 'monthly',
    // The home page is the entry point; the two index pages are the next most
    // useful things to crawl. Relative, not absolute importance.
    priority: path === '/' ? 1 : path === '/services' || path === '/work' ? 0.8 : 0.6,
  }))

  const insights = articles.map((a) => ({
    url: absoluteUrl(`/insights/${a.slug}`),
    // A real publication date beats today's date on every entry, which is what
    // `new Date()` everywhere would have claimed.
    lastModified: toIsoDate(a.date) ?? now,
    changeFrequency: 'yearly' as const,
    priority: 0.5,
  }))

  const seen = new Set<string>()
  const work = [featuredCase, ...projects]
    .filter((p) => (seen.has(p.slug) ? false : seen.add(p.slug)))
    .map((p) => ({
      url: absoluteUrl(`/work/${p.slug}`),
      lastModified: now,
      changeFrequency: 'yearly' as const,
      priority: 0.5,
    }))

  return [...statics, ...insights, ...work]
}
