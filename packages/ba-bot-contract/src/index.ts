import { z } from 'zod'

/**
 * The shared wire contract for the ba-bot Worker (`apps/ba-bot-api`).
 *
 * This package describes the Worker <-> browser boundary only: request/response
 * bodies for the HTTP API. It is intentionally runtime-agnostic (no Cloudflare
 * types, no server-only code) so a browser-side UI package can import it
 * directly. The Worker's internal LLM response schema (`TurnOutputSchema` in
 * `apps/ba-bot-api/src/llm/turn.ts`) describes a different boundary
 * (Worker <-> LLM) and is not part of this contract.
 */

// ---------------------------------------------------------------------------
// Conversation state machine
// ---------------------------------------------------------------------------

/** The nine states of the business-analysis interview graph, in graph order. */
export const StateIdSchema = z.enum([
  'GREETING',
  'PROJECT_IDENTITY',
  'SOLUTION_SHAPE',
  'USERS_AND_SCOPE',
  'FEATURE_MAP',
  'CONSTRAINTS',
  'CONTACT',
  'GENERATE',
  'DONE',
])

export type StateId = z.infer<typeof StateIdSchema>

// ---------------------------------------------------------------------------
// POST /api/chat
// ---------------------------------------------------------------------------

export const ChatRequestSchema = z.object({
  conversationId: z.string().optional(),
  message: z.string().min(1).max(4000),
})

export type ChatRequest = z.infer<typeof ChatRequestSchema>

export const ChatResponseSchema = z.object({
  conversationId: z.string(),
  reply: z.string(),
  state: StateIdSchema,
  finished: z.boolean(),
})

export type ChatResponse = z.infer<typeof ChatResponseSchema>

// ---------------------------------------------------------------------------
// POST /api/contact
// ---------------------------------------------------------------------------

export const ContactRequestSchema = z.object({
  conversationId: z.string(),
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().max(200),
  company: z.string().max(160).optional(),
  role: z.string().max(120).optional(),
  // Literal `true` (not `z.boolean()`): an absent or `false` consent field
  // must fail validation, never be treated as a default. Under the
  // Australian Privacy Act, implied consent is not consent — the API can
  // only accept an explicit, affirmative `true`.
  consent: z.literal(true),
  turnstileToken: z.string().min(1),
  utm: z
    .object({
      source: z.string().optional(),
      medium: z.string().optional(),
      campaign: z.string().optional(),
    })
    .optional(),
  referrer: z.string().max(500).optional(),
  landingPage: z.string().max(500).optional(),
})

export type ContactRequest = z.infer<typeof ContactRequestSchema>

export const ContactResponseSchema = z.object({
  leadId: z.string(),
  state: StateIdSchema,
})

export type ContactResponse = z.infer<typeof ContactResponseSchema>

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
})

export type HealthResponse = z.infer<typeof HealthResponseSchema>

// ---------------------------------------------------------------------------
// Error responses
// ---------------------------------------------------------------------------

/**
 * Every failure returns `{ error: <code> }`. `wrong_state` (409, from
 * POST /api/contact when the conversation isn't in the CONTACT state) is the
 * one code that additionally carries the conversation's actual `state`, so
 * it gets its own branch of the union rather than an optional field on all
 * of them — a 400/403/404/500/503 body can never have a `state` key.
 */
export const ErrorResponseSchema = z.union([
  z.object({
    error: z.enum([
      'invalid_body', // 400
      'challenge_failed', // 403
      'not_found', // 404
      'internal_error', // 500
      'not_configured', // 503
    ]),
  }),
  z.object({
    error: z.literal('wrong_state'), // 409
    state: StateIdSchema,
  }),
])

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>

/** All error codes the API can return, independent of shape. */
export const ErrorCodeSchema = z.enum([
  'invalid_body',
  'challenge_failed',
  'not_found',
  'wrong_state',
  'internal_error',
  'not_configured',
])

export type ErrorCode = z.infer<typeof ErrorCodeSchema>
