import { renderEmailHtml } from './template'

/**
 * Delivers the quote by email through Resend.
 *
 * `fetch` against the REST API directly — the `resend` SDK is not installed and
 * must not be. One POST does not justify a dependency in a Worker bundle.
 *
 * This function NEVER throws and NEVER rejects. A send failure is a follow-up
 * problem, not a request failure: by the time it is called the brief and the
 * quote are already persisted and the visitor already has their number on
 * screen. The caller logs the returned error as an event and answers 200.
 *
 * PII: `to` is the only place a lead's email address appears in this module. It
 * is passed straight into the Resend envelope. It is never rendered into the
 * body, never logged, and never returned — the estimator, the renderers and
 * every prompt are upstream of this call and none of them ever sees it.
 */

const ENDPOINT = 'https://api.resend.com/emails'

/** The sender domain must be DNS-verified (SPF/DKIM) in Resend or every send
 *  is rejected — see SETUP.md. Changing this address means re-verifying. */
const FROM = 'Uno Digit <quotes@unodigit.com.au>'

export interface SendResult {
  ok: boolean
  id?: string
  error?: string
}

export async function sendQuoteEmail(args: {
  apiKey: string
  to: string
  projectName: string
  briefMarkdown: string
  quoteMarkdown: string
  quoteUrl: string
}): Promise<SendResult> {
  const { apiKey, to, projectName, briefMarkdown, quoteMarkdown, quoteUrl } = args

  // An unset key guarantees a 401. Spending a request to discover that on every
  // quote is latency on the response and noise in the logs.
  if (!apiKey) return { ok: false, error: 'no_api_key' }

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      // HTML only. No `attachments` key, by product decision: the full cost
      // breakdown is in the body and the hosted page carries the rest, so
      // nothing here generates or ships a PDF.
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject: `Your indicative quote — ${projectName}`,
        html: renderEmailHtml({ projectName, briefMarkdown, quoteMarkdown, quoteUrl }),
      }),
    })

    if (!res.ok) {
      // Resend's error body is small and non-secret; it names the real cause
      // (an unverified sender domain is the likely one) and is the only thing
      // that makes the logged event actionable.
      const detail = await res.text().catch(() => '')
      return { ok: false, error: `resend_http_${res.status}: ${detail.slice(0, 200)}` }
    }

    const json = (await res.json().catch(() => null)) as { id?: string } | null
    return { ok: true, id: json?.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
