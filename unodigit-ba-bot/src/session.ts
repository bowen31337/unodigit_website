import type { Env } from './env'
import { initialState, type ConversationState } from './graph/transitions'

/** Session TTL in KV. Task 8 (`POST /api/contact`) reads/writes the same
 * session shape under the same key format and must stay in lockstep with
 * this value — that is why it lives here rather than inline in a route. */
export const SESSION_TTL_SECONDS = 86_400

export const sessionKey = (id: string): string => `conv:${id}`

export async function loadSession(env: Env, id: string): Promise<ConversationState> {
  const raw = await env.SESSIONS.get(sessionKey(id))
  return raw ? (JSON.parse(raw) as ConversationState) : initialState()
}

export async function saveSession(env: Env, id: string, s: ConversationState): Promise<void> {
  await env.SESSIONS.put(sessionKey(id), JSON.stringify(s), { expirationTtl: SESSION_TTL_SECONDS })
}
