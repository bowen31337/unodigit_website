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
 *
 * `session_expired` is also a 409 but deliberately carries NO `state`: the
 * whole point of that failure is that the session is gone, so the state on the
 * durable row (always `GENERATE`) would say nothing the client can act on.
 */
export const ErrorResponseSchema = z.union([
  z.object({
    error: z.enum([
      'invalid_body', // 400
      'challenge_failed', // 403
      // 403, from GET /api/quote/:id — a bad signature and an unknown id are
      // deliberately indistinguishable, so this is the ONLY code that route
      // ever returns. Its absence here meant a client validating errors
      // against the contract could not parse a single one of them.
      'forbidden', // 403
      'not_found', // 404
      // 409, from POST /api/generate when the KV session has expired and the
      // slots are gone. Quoting an empty brief would email the client a dollar
      // figure derived from nothing, so the request is refused instead.
      'session_expired', // 409
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
  'forbidden',
  'not_found',
  'wrong_state',
  'session_expired',
  'internal_error',
  'not_configured',
])

export type ErrorCode = z.infer<typeof ErrorCodeSchema>

// ---------------------------------------------------------------------------
// Estimator, pricing, and POST /api/generate
// ---------------------------------------------------------------------------

/** The seven categories claw-forge's create-spec walks. Order is stable and
 *  load-bearing: the estimator prompt lists them in this order, and the
 *  pricing weights are keyed off these exact strings. */
export const CategoryNameSchema = z.enum([
  'Authentication & User Management',
  'Core functionality',
  'Data management',
  'UI/UX',
  'API layer',
  'Admin features',
  'Integrations',
])
export type CategoryName = z.infer<typeof CategoryNameSchema>

export const ConfidenceSchema = z.enum(['high', 'medium', 'low'])
export type Confidence = z.infer<typeof ConfidenceSchema>

/** One category's share of the decomposition. `sample` is a single example
 *  bullet — enough to show the visitor the granularity without paying output
 *  tokens for all 100-300 of them. */
export const EstimateCategorySchema = z
  .object({
    name: CategoryNameSchema,
    // max(2000), not max(400): this schema is also used for single-mode's
    // whole-project category breakdown (see EstimateShapeSchema below), so the
    // ceiling must sit above any plausible project — an oversized first pass
    // needs to validate so it can route to program mode instead of failing
    // parse and never reaching it. Per-subsystem breakdowns are naturally kept
    // well under this by SubsystemSchema.total_tasks staying at max(400).
    bullets: z.number().int().min(0).max(2000),
    sample: z.string().min(1).max(300),
  })
  .strict()
export type EstimateCategory = z.infer<typeof EstimateCategorySchema>

export const SubsystemSchema = z
  .object({
    name: z.string().min(1).max(120),
    categories: z.array(EstimateCategorySchema).min(1),
    total_tasks: z.number().int().min(1).max(400),
    depends_on: z.array(z.string()).default([]),
  })
  .strict()
export type Subsystem = z.infer<typeof SubsystemSchema>

/** Estimator output. `single` is one claw-forge spec; `program` splits a large
 *  project into subsystems because create-spec targets 100-300 bullets per spec
 *  and beyond that one run is unwieldy. */
export const EstimateShapeSchema = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('single'),
      categories: z.array(EstimateCategorySchema).min(1),
      // max(2000), not max(400): the single-mode ceiling must sit above any
      // plausible project so an oversized first pass can still be represented
      // and validate, letting runEstimate's total_tasks > programThreshold
      // check route it into program mode — rather than failing schema
      // validation and never reaching that check at all (US-004a).
      total_tasks: z.number().int().min(1).max(2000),
      confidence: ConfidenceSchema,
      drivers: z.array(z.string().max(200)).default([]),
    })
    .strict(),
  z
    .object({
      mode: z.literal('program'),
      umbrella: z.string().min(1).max(160),
      subsystems: z.array(SubsystemSchema).min(2),
      total_tasks: z.number().int().min(1),
      confidence: ConfidenceSchema,
      drivers: z.array(z.string().max(200)).default([]),
    })
    .strict(),
])
export type EstimateShape = z.infer<typeof EstimateShapeSchema>

export const QuoteSchema = z
  .object({
    mode: z.enum(['single', 'program']),
    totalTasks: z.number().int(),
    weightedTasks: z.number(),
    rateAud: z.number(),
    lowAud: z.number().int(),
    highAud: z.number().int(),
    weeks: z.number().int(),
    confidence: ConfidenceSchema,
    belowFloor: z.boolean(),
  })
  .strict()
export type Quote = z.infer<typeof QuoteSchema>

/** POST /api/generate. `quote` (and `quoteId`) is absent in exactly two cases,
 *  and in both the brief is still delivered:
 *    1. the per-IP daily rate limit was hit, so no estimate was ever run; and
 *    2. the estimator failed (parse, empty, truncated, or provider), so there
 *       is no shape to price.
 *  The two are distinguished by `headline`, not by the payload.
 *
 *  A project priced below the engagement floor DOES carry a quote, with
 *  `belowFloor: true`; the renderer replaces the band with a starter-engagement
 *  message. Nulling it there would make "below floor" indistinguishable from
 *  the two cases above at the client, which are different things to say to a
 *  visitor. */
export const GenerateResponseSchema = z
  .object({
    briefId: z.string(),
    quoteId: z.string().nullable(),
    quote: QuoteSchema.nullable(),
    headline: z.string(),
    state: StateIdSchema,
  })
  .strict()
export type GenerateResponse = z.infer<typeof GenerateResponseSchema>

/** GET /api/quote/:id?sig=… — the hosted quote page's only data source.
 *
 *  `markdown` is the CANONICAL stored artifact: the exact bytes that were
 *  rendered, persisted and emailed. The page renders it rather than
 *  re-deriving anything, so what a client reads online is what they were sent.
 *  `quote` is the same structured payload POST /api/generate returns, mapped
 *  off the stored row.
 *
 *  Every failure — bad signature, missing signature, unknown id — is 403
 *  `{ error: 'forbidden' }`, deliberately indistinguishable so quote ids are
 *  not enumerable. */
export const QuoteDetailResponseSchema = z
  .object({
    markdown: z.string(),
    quote: QuoteSchema,
  })
  .strict()
export type QuoteDetailResponse = z.infer<typeof QuoteDetailResponseSchema>
