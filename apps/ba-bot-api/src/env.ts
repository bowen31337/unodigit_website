export interface Env {
  DB: D1Database
  SESSIONS: KVNamespace

  // secrets — set via scripts/sync-secrets.sh (never in wrangler.toml)
  LLM_API_KEY: string
  TURNSTILE_SECRET: string
  IP_HASH_SALT: string
  // Declared here for Task 8/9. Deliberately NOT in index.ts's REQUIRED_SECRETS
  // yet: nothing reads them, so failing every request on their absence would
  // take the whole API down for a feature that does not exist. Add them to the
  // 503 guard in the same commit that first uses them.
  QUOTE_LINK_SIGNING_KEY: string
  RESEND_API_KEY: string

  // vars — plaintext in wrangler.toml, safe to review and diff
  LLM_BASE_URL: string
  LLM_MODEL: string
  LLM_MODEL_HEAVY: string
  RATE_PER_TASK_AUD: string
  MINIMUM_ENGAGEMENT_AUD: string
  TASKS_PER_WEEK: string
  PROGRAM_MODE_THRESHOLD: string
  QUOTE_VALID_DAYS: string
  MAX_TOTAL_TURNS: string
  ALLOWED_ORIGIN: string
}

// Alias to avoid `interface Env extends Env {}` resolving to itself inside the
// `Cloudflare` namespace below (same identifier, different scope, would self-reference).
type WorkerEnv = Env

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {}
    // Required for `exports.default` (from `cloudflare:workers`) to be typed —
    // `Cloudflare.Exports` is keyed off this module's exports.
    interface GlobalProps {
      mainModule: typeof import('./index')
    }
  }
}
