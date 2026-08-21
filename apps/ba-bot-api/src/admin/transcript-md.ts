import type { TranscriptTurn } from '../db/admin'

/**
 * A conversation as a Markdown document.
 *
 * Rendered server-side so the download is one plain same-origin link. Building
 * it in the browser would mean a blob: or data: URL, and the dashboard ships
 * `default-src 'none'` — a link to an endpoint that sets Content-Disposition
 * needs no CSP exception at all.
 *
 * `content` is the visitor-facing text (see llm/history for why that differs
 * from what the model emitted), which is exactly what a human reviewing a lead
 * wants to read.
 */
export function transcriptMarkdown(
  turns: TranscriptTurn[],
  meta: { label: string; conversationId: string; exportedAt: number },
): string {
  const when = (ms: number) =>
    new Date(ms).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })

  const head = [
    `# Interview transcript — ${meta.label}`,
    '',
    `- Conversation: \`${meta.conversationId}\``,
    `- Turns: ${turns.length}`,
    turns.length ? `- Started: ${when(turns[0]!.createdAt)}` : '',
    `- Exported: ${when(meta.exportedAt)} (Australia/Sydney)`,
    '',
    '---',
    '',
  ].filter((l) => l !== '')

  if (turns.length === 0) return [...head, '_No messages were recorded._', ''].join('\n')

  const body = turns.map((t) => {
    const who = t.role === 'user' ? 'Visitor' : 'Mary (BA bot)'
    // Blockquote the message so a reply containing its own '#' or '-' cannot
    // restructure the document around it. Visitor text is untrusted input.
    const quoted = t.content.split('\n').map((line) => `> ${line}`).join('\n')
    return [
      `### ${who} · ${when(t.createdAt)}${t.offTopic ? ' · off-topic' : ''}`,
      '',
      quoted,
      '',
    ].join('\n')
  })

  return [...head, ...body].join('\n')
}

/** Safe, recognisable download name: `transcript-<label>-<conv>.md`. */
export function transcriptFilename(label: string, conversationId: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'lead'
  return `transcript-${slug}-${conversationId.slice(0, 16)}.md`
}
