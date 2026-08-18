import type { Env } from './env'
import { getConversation, updateConversationState } from './db/queries'
import { STATES, type StateId } from './graph/states'
import { initialState, type ConversationState } from './graph/transitions'

/** Session TTL in KV. Task 8 (`POST /api/contact`) reads/writes the same
 * session shape under the same key format and must stay in lockstep with
 * this value — that is why it lives here rather than inline in a route. */
export const SESSION_TTL_SECONDS = 86_400

export const sessionKey = (id: string): string => `conv:${id}`

export async function loadSession(env: Env, id: string): Promise<ConversationState> {
  const raw = await env.SESSIONS.get(sessionKey(id))
  if (raw) return JSON.parse(raw) as ConversationState

  // KV is a cache, not the record. A key can be missing because the TTL
  // expired or because KV is momentarily eventually-consistent — in both
  // cases D1 still holds the true state and turn count. Restarting at
  // GREETING with totalTurns 0 would silently reset MAX_TOTAL_TURNS, so
  // reseed from the durable row and only fall back to a fresh interview
  // when there is no row at all.
  const row = await getConversation(env.DB, id)
  // `state` is a bare TEXT column, so treat an unrecognised value as no
  // session rather than handing a bad key to `STATES[...]` downstream.
  if (!row || !(row.state in STATES)) return initialState()

  return {
    ...initialState(),
    state: row.state as StateId,
    totalTurns: row.turn_count,
  }
}

export async function saveSession(env: Env, id: string, s: ConversationState): Promise<void> {
  await env.SESSIONS.put(sessionKey(id), JSON.stringify(s), { expirationTtl: SESSION_TTL_SECONDS })
}

/** Write the session to both stores. KV holds the full session; D1 holds the
 * durable subset (`state`, `turn_count`) that `loadSession` reseeds from.
 * Every caller that advances a session must use this — updating one store
 * without the other is what let D1 `turn_count` drift behind KV `totalTurns`. */
export async function persistSession(env: Env, id: string, s: ConversationState): Promise<void> {
  await saveSession(env, id, s)
  await updateConversationState(env.DB, id, s.state, s.totalTurns)
}
