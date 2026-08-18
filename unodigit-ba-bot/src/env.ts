export interface Env {
  DB: D1Database
  SESSIONS: KVNamespace

  // secrets — set via `wrangler secret put`
  LLM_BASE_URL: string
  LLM_MODEL: string
  LLM_MODEL_HEAVY: string
  LLM_API_KEY: string
  TURNSTILE_SECRET: string
  IP_HASH_SALT: string

  // vars
  RATE_PER_TASK_AUD: string
  MINIMUM_ENGAGEMENT_AUD: string
  TASKS_PER_WEEK: string
  PROGRAM_MODE_THRESHOLD: string
  QUOTE_VALID_DAYS: string
  MAX_TOTAL_TURNS: string
  ALLOWED_ORIGIN: string
}

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {}
}
