import { env } from 'cloudflare:workers'
import { describe, it, expect } from 'vitest'
import { replayHistory } from '../../src/llm/history'
import type { MessageRow } from '../../src/db/queries'
import {
  appendMessageAtNextSeq, createConversation, listMessages,
} from '../../src/db/queries'
import { newId } from '../../src/util/ids'

function row(over: Partial<MessageRow>): MessageRow {
  return {
    id: 'msg_1', conversation_id: 'conv_1', seq: 1, role: 'assistant',
    content: 'hello', slots_json: null, off_topic: 0, ready_to_advance: 0,
    created_at: 1000, ...over,
  }
}

/** The four keys the system prompt requires, in the order it names them. */
function envelopeOf(content: string) {
  return JSON.parse(content) as {
    reply: string
    slots: Record<string, unknown>
    ready_to_advance: boolean
    off_topic: boolean
  }
}

describe('replayHistory', () => {
  it('passes user turns through as plain text', () => {
    const out = replayHistory([row({ role: 'user', content: 'we need stock tracking' })])
    expect(out).toEqual([{ role: 'user', content: 'we need stock tracking' }])
  })

  // The regression this whole module exists for: replaying the assistant's
  // prose contradicted json_object mode and the model answered with whitespace.
  it('replays assistant turns as the JSON envelope, not the bare reply', () => {
    const out = replayHistory([row({ content: 'Who is it for?' })])

    expect(out[0]!.role).toBe('assistant')
    expect(out[0]!.content).not.toBe('Who is it for?')
    expect(envelopeOf(out[0]!.content).reply).toBe('Who is it for?')
  })

  it('emits exactly the four required keys, in prompt order', () => {
    const out = replayHistory([row({})])
    expect(Object.keys(envelopeOf(out[0]!.content)))
      .toEqual(['reply', 'slots', 'ready_to_advance', 'off_topic'])
  })

  it('carries slots, ready_to_advance and off_topic through', () => {
    const out = replayHistory([row({
      slots_json: JSON.stringify({ project_name: 'StockWatch' }),
      ready_to_advance: 1, off_topic: 1,
    })])

    expect(envelopeOf(out[0]!.content)).toEqual({
      reply: 'hello',
      slots: { project_name: 'StockWatch' },
      ready_to_advance: true,
      off_topic: true,
    })
  })

  // `ready_to_advance` arrives in migration 0004. If the Worker ships before
  // the migration is applied, `SELECT *` omits the key entirely — that must
  // read as false, not throw and not become `undefined` in the envelope.
  it('reads a pre-migration row (no ready_to_advance column) as false', () => {
    const legacy = row({})
    delete legacy.ready_to_advance

    expect(envelopeOf(replayHistory([legacy])[0]!.content).ready_to_advance).toBe(false)
  })

  it('falls back to an empty slots object when slots_json is absent or junk', () => {
    for (const slots_json of [null, 'not json', '[1,2]', '"a string"']) {
      expect(envelopeOf(replayHistory([row({ slots_json })])[0]!.content).slots).toEqual({})
    }
  })

  it('preserves order across a mixed transcript', () => {
    const out = replayHistory([
      row({ seq: 1, role: 'user', content: 'first' }),
      row({ seq: 2, role: 'assistant', content: 'second' }),
      row({ seq: 3, role: 'user', content: 'third' }),
    ])

    expect(out.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(out[0]!.content).toBe('first')
    expect(envelopeOf(out[1]!.content).reply).toBe('second')
    expect(out[2]!.content).toBe('third')
  })

  // Round-trip through real D1 — the unit tests above build rows by hand, so
  // only this one catches the column actually being written and read back.
  it('round-trips ready_to_advance through D1', async () => {
    const id = newId('conv')
    await createConversation(env.DB, id, 1000)
    await appendMessageAtNextSeq(env.DB, {
      id: newId('msg'), conversationId: id, role: 'assistant', content: 'advancing',
      slotsJson: JSON.stringify({ problem: 'stockouts' }), offTopic: false,
      readyToAdvance: true, createdAt: 1000,
    })

    const out = replayHistory(await listMessages(env.DB, id))
    expect(envelopeOf(out[0]!.content)).toEqual({
      reply: 'advancing', slots: { problem: 'stockouts' },
      ready_to_advance: true, off_topic: false,
    })
  })

  it('defaults ready_to_advance to false for a user row written without it', async () => {
    const id = newId('conv')
    await createConversation(env.DB, id, 1000)
    await appendMessageAtNextSeq(env.DB, {
      id: newId('msg'), conversationId: id, role: 'user', content: 'hi',
      slotsJson: null, offTopic: false, createdAt: 1000,
    })

    const [stored] = await listMessages(env.DB, id)
    expect(stored!.ready_to_advance).toBe(0)
  })
})
