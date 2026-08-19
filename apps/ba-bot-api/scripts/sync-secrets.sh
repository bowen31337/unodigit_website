#!/usr/bin/env bash
#
# Push Worker secrets from 1Password into Cloudflare.
#
# Secret VALUES are never written to disk, never echoed, and never enter shell
# history — `op read` pipes straight into `wrangler secret put`. Only the
# op:// references live in this file, and a reference is not a credential.
#
# Usage:
#   ./scripts/sync-secrets.sh --check    verify Cloudflare auth, change nothing
#   ./scripts/sync-secrets.sh            push every secret listed below
#
# Prerequisites: 1Password CLI (`op`) signed in, and a Cloudflare API token
# with "Edit Cloudflare Workers" permission stored at the reference below.

set -euo pipefail

CF_TOKEN_REF="op://application/cloudflare_api/api_token"

# name                → 1Password reference
SECRETS=(
  "LLM_API_KEY:op://application/deepseek/api_key"
  "RESEND_API_KEY:op://application/resend/api_key"
  "TURNSTILE_SECRET:op://application/turnstile/secret_key"
  "IP_HASH_SALT:op://application/ba_bot/ip_hash_salt"
  "QUOTE_LINK_SIGNING_KEY:op://application/ba_bot/quote_link_signing_key"
)

# These 1Password entries must be created before this script will succeed —
# `op read` exits non-zero on a missing item and `set -e` stops here.
#   op://application/turnstile/secret_key          — Cloudflare dashboard → Turnstile → your site → secret key
#   op://application/ba_bot/ip_hash_salt           — generate once: openssl rand -hex 32
#   op://application/ba_bot/quote_link_signing_key — generate once: openssl rand -hex 32
#                                                    DOES NOT EXIST YET. Create it before the next deploy.
#
# The Worker refuses traffic with 503 while TURNSTILE_SECRET, IP_HASH_SALT or
# QUOTE_LINK_SIGNING_KEY is unset (see src/index.ts) — an unsalted ip_hash is a
# reversible IP, and an unset signing key HMACs every quote id under the empty
# string, making every quote in the database world-readable to anyone who can
# guess an id. Both must fail closed rather than degrade quietly.
#
# RESEND_API_KEY is deliberately NOT in that 503 list. An unset key stops
# delivery and nothing else; the send path already logs a `quote_email_failed`
# event and returns the brief and quote anyway, so refusing all traffic would
# be a strictly worse outcome than a quote the client reads on screen but does
# not receive by mail. Rotating the key never needs a redeploy.
#
# A signing-key rotation invalidates every quote link already emailed: the
# signature is HMAC(quote id) under this key, so old links start returning 403.
# Rotate only with that in mind.

CLOUDFLARE_API_TOKEN="$(op read "$CF_TOKEN_REF")"
export CLOUDFLARE_API_TOKEN

if [[ "${1:-}" == "--check" ]]; then
  echo "Verifying Cloudflare credentials..."
  pnpm wrangler whoami
  exit $?
fi

if [[ "${1:-}" == "--list" ]]; then
  # Names only — Cloudflare never returns secret values, by design.
  pnpm wrangler secret list
  exit $?
fi

for entry in "${SECRETS[@]}"; do
  name="${entry%%:*}"
  ref="${entry#*:}"
  echo "→ setting $name"
  op read "$ref" | pnpm wrangler secret put "$name"
done

echo
echo "Done. Verify with: pnpm wrangler secret list"
echo "Note: secrets cannot be read back from Cloudflare — 1Password stays the source of truth."
