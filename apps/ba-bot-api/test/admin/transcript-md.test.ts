import { describe, it, expect } from 'vitest'
import { transcriptMarkdown, transcriptFilename } from '../../src/admin/transcript-md'
import type { TranscriptTurn } from '../../src/db/admin'

const AT = 1_787_300_000_000

function turn(over: Partial<TranscriptTurn>): TranscriptTurn {
  return { seq: 1, role: 'user', content: 'hello', createdAt: AT, offTopic: false, ...over }
}

describe('transcriptMarkdown', () => {
  it('labels each turn by speaker and timestamps it', () => {
    const md = transcriptMarkdown(
      [turn({ seq: 1, role: 'user', content: 'We need stock tracking' }),
       turn({ seq: 2, role: 'assistant', content: 'Who will use it?' })],
      { label: 'Jane - jane@example.com', conversationId: 'conv_abc', exportedAt: AT },
    )

    expect(md).toContain('# Interview transcript — Jane - jane@example.com')
    expect(md).toContain('### Visitor ·')
    expect(md).toContain('### Mary (BA bot) ·')
    expect(md).toContain('> We need stock tracking')
    expect(md).toContain('- Turns: 2')
  })

  // Visitor text is untrusted input. Blockquoting means a reply containing its
  // own heading or list cannot restructure the document around it.
  it('blockquotes message bodies so markdown in a reply cannot restructure it', () => {
    const md = transcriptMarkdown(
      [turn({ content: '# Not a heading\n- not a list' })],
      { label: 'x', conversationId: 'conv_abc', exportedAt: AT },
    )

    expect(md).toContain('> # Not a heading')
    expect(md).toContain('> - not a list')
    const headings = md.split('\n').filter((l) => /^#{1,3} /.test(l))
    expect(headings.every((h) => h.startsWith('# Interview transcript') || h.startsWith('### '))).toBe(true)
  })

  it('marks an off-topic turn', () => {
    const md = transcriptMarkdown([turn({ offTopic: true })],
      { label: 'x', conversationId: 'c', exportedAt: AT })
    expect(md).toContain('off-topic')
  })

  it('renders an empty conversation without pretending it had turns', () => {
    const md = transcriptMarkdown([], { label: 'x', conversationId: 'c', exportedAt: AT })
    expect(md).toContain('_No messages were recorded._')
    expect(md).toContain('- Turns: 0')
  })
})

describe('transcriptFilename', () => {
  // Goes straight into a quoted Content-Disposition header, so it must not be
  // able to carry a quote, a newline, or a path separator.
  it('emits only safe characters', () => {
    const name = transcriptFilename('Jane "Quote" OBrien / ACME <script>', 'conv_abcdef0123456789')
    expect(name).toMatch(/^transcript-[a-z0-9-]+-[a-z0-9_]+\.md$/)
  })

  it('falls back rather than producing a nameless file', () => {
    expect(transcriptFilename('!!!', 'conv_abc')).toBe('transcript-lead-conv_abc.md')
  })
})
