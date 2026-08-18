import { env } from 'cloudflare:workers'
import { describe, it, expect } from 'vitest'
import {
  createConversation, getConversation, updateConversationState,
  appendMessage, listMessages, recordEvent,
} from '../../src/db/queries'
import { newId } from '../../src/util/ids'

describe('conversation queries', () => {
  it('creates and reads a conversation', async () => {
    const id = newId('conv')
    await createConversation(env.DB, id, 1000)

    const row = await getConversation(env.DB, id)
    expect(row).not.toBeNull()
    expect(row!.id).toBe(id)
    expect(row!.state).toBe('GREETING')
    expect(row!.turn_count).toBe(0)
  })

  it('returns null for an unknown conversation', async () => {
    expect(await getConversation(env.DB, 'conv_missing')).toBeNull()
  })

  it('updates state and turn count', async () => {
    const id = newId('conv')
    await createConversation(env.DB, id, 1000)
    await updateConversationState(env.DB, id, 'PROJECT_IDENTITY', 3)

    const row = await getConversation(env.DB, id)
    expect(row!.state).toBe('PROJECT_IDENTITY')
    expect(row!.turn_count).toBe(3)
  })

  it('appends and lists messages in sequence order', async () => {
    const id = newId('conv')
    await createConversation(env.DB, id, 1000)
    await appendMessage(env.DB, {
      id: newId('msg'), conversationId: id, seq: 2,
      role: 'assistant', content: 'second', slotsJson: null, offTopic: false, createdAt: 1002,
    })
    await appendMessage(env.DB, {
      id: newId('msg'), conversationId: id, seq: 1,
      role: 'user', content: 'first', slotsJson: null, offTopic: false, createdAt: 1001,
    })

    const rows = await listMessages(env.DB, id)
    expect(rows.map((r) => r.content)).toEqual(['first', 'second'])
  })

  it('records an event with a JSON payload', async () => {
    const id = newId('conv')
    await createConversation(env.DB, id, 1000)
    await recordEvent(env.DB, id, 'forced_advance', { state: 'FEATURE_MAP' })

    const { results } = await env.DB
      .prepare('SELECT type, payload_json FROM events WHERE conversation_id = ?')
      .bind(id).all<{ type: string; payload_json: string }>()

    expect(results[0]!.type).toBe('forced_advance')
    expect(JSON.parse(results[0]!.payload_json)).toEqual({ state: 'FEATURE_MAP' })
  })
})
