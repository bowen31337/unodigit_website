export interface Env {
  DB: D1Database
  SESSIONS: KVNamespace

  // secrets — set via scripts/sync-secrets.sh (never in wrangler.toml)
  LLM_API_KEY: string
  TURNSTILE_SECRET: string
  IP_HASH_SALT: string
  // In REQUIRED_SECRETS (src/index.ts): an unset key HMACs every quote id under
  // the empty string, so every quote becomes world-readable. It matters MORE
  // since US-010 removed email delivery, not less — the signed link is now the
  // only way a client ever reaches their quote.
  QUOTE_LINK_SIGNING_KEY: string

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
  // Origin the signed quote link points at (POST /api/generate returns it as
  // `quoteUrl`). Deliberately NOT derived from the first entry of
  // ALLOWED_ORIGIN: that is a CORS allowlist containing localhost, and
  // reordering it must not silently change the link a client is handed.
  PUBLIC_SITE_URL: string

  /**
   * Admin surface — all three must be set together or /admin/* 404s.
   *
   * ADMIN_HOSTNAME is the gate that matters: a Worker is reachable on
   * *.workers.dev whatever `routes` says, and that hostname has no Access in
   * front of it, so without a hostname check the dashboard ships to the open
   * internet. Leaving it unset is the supported way to run a deployment with
   * no admin surface at all.
   *
   * ACCESS_AUD is the application's audience tag; ACCESS_TEAM_DOMAIN is
   * <team>.cloudflareaccess.com, which is both the JWKS host and the expected
   * `iss`. Neither is a secret — both appear in every token Access issues —
   * so they live in wrangler.toml where they can be reviewed and diffed.
   */
  ADMIN_HOSTNAME: string
  ACCESS_TEAM_DOMAIN: string
  ACCESS_AUD: string
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
