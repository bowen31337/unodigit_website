import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

/**
 * There was no robots.txt. An absent robots.txt is permissive, so this does
 * not "unblock" anything — what it does is point every crawler at the sitemap
 * and state the AI-crawler position explicitly rather than by accident.
 *
 * THE GEO DECISION, STATED PLAINLY
 * --------------------------------
 * The AI crawlers below are listed as allowed on purpose. They split into two
 * jobs, and conflating them is the usual mistake:
 *
 *   - RETRIEVAL (OAI-SearchBot, PerplexityBot, ClaudeBot): fetches a page to
 *     answer a question being asked right now, and cites the source. For a
 *     consultancy that wants to be the cited answer to "AI consultancy in
 *     Sydney", blocking these is turning off the channel.
 *   - TRAINING (GPTBot, CCBot, Google-Extended, Applebot-Extended): content
 *     may inform future model weights, with no per-answer citation.
 *
 * Blocking Google-Extended does NOT remove the site from Google Search — it
 * only withdraws it from AI Overviews and Gemini grounding. Both categories
 * are allowed here because the site is public marketing copy whose entire
 * purpose is to be repeated. If that position ever changes, this is the one
 * file to change, and the distinction above is why it is written down.
 */
export const dynamic = 'force-static'

const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot',
  'Applebot-Extended',
  'CCBot',
  'Bytespider',
  'Amazonbot',
  'meta-externalagent',
  'DuckAssistBot',
  'cohere-ai',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // /q/ carries a noindex header already; disallowing it here saves the
      // crawl entirely rather than spending it to be told not to index.
      { userAgent: '*', allow: '/', disallow: '/q/' },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: '/', disallow: '/q/' })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    // No `host`. It is a non-standard Yandex-only directive that Google and
    // the AI fetchers ignore, and Next renders whatever it is given verbatim —
    // which produced `Host: https://unodigit.com.au/`, a malformed value
    // (the directive takes a bare hostname). Absent beats malformed.
  }
}
