import type { Metadata } from 'next'
import { absoluteUrl } from './site'

/**
 * Builds a page's Metadata so the easy mistake becomes impossible.
 *
 * THE MISTAKE: Next does NOT deep-merge metadata fields. A page that sets its
 * own `openGraph` REPLACES the layout's entire `openGraph` object — it does
 * not inherit the missing keys. So every page here that set an openGraph title
 * silently dropped the site-wide `images`, and every share card and AI-
 * generated preview rendered with no image. `twitter:image` survived only
 * because no page happened to override `twitter`.
 *
 * Routing every page through one builder means og:image, og:url, the canonical
 * and the locale are derived from the same `path` and cannot drift apart.
 */
export interface PageMetaInput {
  /** Route path, e.g. '/services'. Drives canonical AND og:url. */
  path: string
  title: string
  description: string
  /** Longer/branded variants for the share card, when they differ. */
  ogTitle?: string
  ogDescription?: string
  type?: 'website' | 'article'
  publishedTime?: string
  section?: string
}

const OG_IMAGE = {
  url: '/og.png',
  width: 1200,
  height: 630,
  alt: 'Uno Digit — AI and digital transformation consultancy, Sydney',
}

export function pageMetadata({
  path,
  title,
  description,
  ogTitle,
  ogDescription,
  type = 'website',
  publishedTime,
  section,
}: PageMetaInput): Metadata {
  return {
    alternates: { canonical: path },
    title,
    description,
    openGraph: {
      type,
      url: absoluteUrl(path),
      siteName: 'Uno Digit',
      locale: 'en_AU',
      title: ogTitle ?? title,
      description: ogDescription ?? description,
      images: [OG_IMAGE],
      ...(publishedTime ? { publishedTime, authors: ['Uno Digit'] } : {}),
      ...(section ? { section } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle ?? title,
      description: ogDescription ?? description,
      images: ['/og.png'],
    },
  }
}
