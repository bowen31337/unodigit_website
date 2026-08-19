/**
 * The emailed quote, as HTML.
 *
 * Deliberately HTML-only — no PDF, no attachment. The full cost breakdown goes
 * in the body, where every mail client can render it without a download, and
 * the hosted quote page carries the rest.
 *
 * The markdown-to-HTML step is a ~60-line renderer rather than a dependency.
 * It handles exactly the constructs `src/render/brief.ts` and
 * `src/render/quote.ts` emit — headings, bullet lists, pipe tables, `**bold**`,
 * `_italic_`, paragraphs — because those are the only inputs it will ever see.
 * A general markdown parser in a Worker bundle would be strictly more code and
 * strictly more attack surface for no reachable benefit.
 *
 * Everything is escaped before any tag is introduced. A project name is
 * visitor-supplied free text that has already round-tripped through an LLM, so
 * it is treated as hostile: unescaped, it is script in the recipient's inbox.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}

export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESCAPES[c]!)

/** Escape first, then introduce tags — never the other way round. Bold runs
 *  before italic so `_… **x** …_` nests rather than colliding. */
const inline = (s: string): string =>
  escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')

const isTableRow = (line: string): boolean => line.trimStart().startsWith('|')

/** `| a | b | c |` and `| a | b | c` both yield three cells: the renderers emit
 *  header rows without a trailing pipe. */
const cells = (line: string): string[] =>
  line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())

const isSeparator = (line: string): boolean => /^\|[\s:|-]+$/.test(line.trim())

export function markdownToHtml(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]!

    if (!line.trim()) { i += 1; continue }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    if (heading) {
      const level = heading[1]!.length
      out.push(`<h${level} class="h${level}">${inline(heading[2]!)}</h${level}>`)
      i += 1
      continue
    }

    if (isTableRow(line)) {
      const rows: string[] = []
      while (i < lines.length && isTableRow(lines[i]!)) {
        if (!isSeparator(lines[i]!)) rows.push(lines[i]!)
        i += 1
      }
      const [head, ...body] = rows
      out.push('<table class="tbl">')
      if (head) {
        out.push(`<tr>${cells(head).map((c) => `<th class="th">${inline(c)}</th>`).join('')}</tr>`)
      }
      for (const r of body) {
        out.push(`<tr>${cells(r).map((c) => `<td class="td">${inline(c)}</td>`).join('')}</tr>`)
      }
      out.push('</table>')
      continue
    }

    if (/^[-*]\s+/.test(line)) {
      out.push('<ul class="ul">')
      while (i < lines.length && /^[-*]\s+/.test(lines[i]!)) {
        out.push(`<li>${inline(lines[i]!.replace(/^[-*]\s+/, ''))}</li>`)
        i += 1
      }
      out.push('</ul>')
      continue
    }

    // A paragraph runs until a blank line or the start of another block.
    const para: string[] = []
    while (
      i < lines.length && lines[i]!.trim() &&
      !isTableRow(lines[i]!) && !/^[-*]\s+/.test(lines[i]!) && !/^#{1,3}\s+/.test(lines[i]!)
    ) {
      para.push(lines[i]!)
      i += 1
    }
    out.push(`<p class="p">${para.map(inline).join('<br>')}</p>`)
  }

  return out.join('\n')
}

/** Inlined, because every mail client strips <style> unpredictably and none
 *  will fetch a stylesheet. Kept deliberately plain: a quote that renders in
 *  Outlook matters more than one that looks good in exactly one client. */
const CSS = [
  '.wrap{max-width:640px;margin:0 auto;padding:24px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c1c1e;line-height:1.5}',
  '.h1{font-size:22px;margin:24px 0 8px}',
  '.h2{font-size:17px;margin:24px 0 8px}',
  '.h3{font-size:15px;margin:20px 0 6px}',
  '.p{margin:0 0 12px}',
  '.ul{margin:0 0 12px 20px;padding:0}',
  '.tbl{border-collapse:collapse;width:100%;margin:0 0 16px;font-size:14px}',
  '.th{text-align:left;border-bottom:2px solid #d1d1d6;padding:6px 8px}',
  '.td{border-bottom:1px solid #e5e5ea;padding:6px 8px}',
  '.cta{display:inline-block;background:#0e7490;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600}',
  '.rule{border:0;border-top:1px solid #e5e5ea;margin:32px 0}',
  '.foot{font-size:12px;color:#6c6c70;margin-top:32px}',
].join('')

export function renderEmailHtml(args: {
  projectName: string
  briefMarkdown: string
  quoteMarkdown: string
  quoteUrl: string
}): string {
  const { projectName, briefMarkdown, quoteMarkdown, quoteUrl } = args
  const name = escapeHtml(projectName)
  // The URL is built by the caller from a quote id and a hex signature, but it
  // is still escaped: an unescaped href is the one place a stray quote
  // character would break out of the attribute.
  const href = escapeHtml(quoteUrl)

  return [
    `<style>${CSS}</style>`,
    '<div class="wrap">',
    `<h1 class="h1">Your indicative quote — ${name}</h1>`,
    '<p class="p">Thanks for walking us through your project. Below is the estimate we produced from that conversation, along with the brief it was based on.</p>',
    `<p class="p"><a class="cta" href="${href}">View your quote online</a></p>`,
    '<hr class="rule">',
    markdownToHtml(quoteMarkdown),
    '<hr class="rule">',
    markdownToHtml(briefMarkdown),
    '<hr class="rule">',
    `<p class="foot">This estimate is indicative and subject to a scoping call. The online copy lives at <a href="${href}">${href}</a>.</p>`,
    '<p class="foot">Uno Digit · Sydney</p>',
    '</div>',
  ].join('\n')
}
