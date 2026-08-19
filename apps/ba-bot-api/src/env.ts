export interface Env {
  DB: D1Database
  SESSIONS: KVNamespace

  // secrets — set via scripts/sync-secrets.sh (never in wrangler.toml)
  LLM_API_KEY: string
  TURNSTILE_SECRET: string
  IP_HASH_SALT: string
  // In REQUIRED_SECRETS (src/index.ts): an unset key HMACs every quote id under
  // the empty string, so every quote becomes world-readable.
  QUOTE_LINK_SIGNING_KEY: string
  // NOT in REQUIRED_SECRETS, on purpose. An unset key degrades nothing that is
  // guarding anything — it only stops delivery, which is already a non-fatal,
  // event-logged path (src/mail/resend.ts). Refusing all traffic because email
  // is misconfigured would contradict the rule that a send failure must not
  // fail the request.
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
  // Per-IP daily turn cap. MAX_TOTAL_TURNS bounds one session; this bounds how
  // many sessions one address can open in a day, which is the only thing that
  // actually meters DeepSeek spend.
  MAX_TURNS_PER_IP_PER_DAY: string
  ALLOWED_ORIGIN: string
  // Origin the emailed quote link points at. Deliberately NOT derived from the
  // first entry of ALLOWED_ORIGIN: that is a CORS allowlist containing
  // localhost, and reordering it must not silently change what lands in a
  // client's inbox.
  PUBLIC_SITE_URL: string
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
