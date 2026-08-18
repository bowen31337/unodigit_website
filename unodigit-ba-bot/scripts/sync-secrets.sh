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
)

# Secrets not yet in 1Password. Create them, then add lines above.
#   TURNSTILE_SECRET  — Cloudflare dashboard → Turnstile → your site → secret key
#   IP_HASH_SALT      — generate once: openssl rand -hex 32

CLOUDFLARE_API_TOKEN="$(op read "$CF_TOKEN_REF")"
export CLOUDFLARE_API_TOKEN

if [[ "${1:-}" == "--check" ]]; then
  echo "Verifying Cloudflare credentials..."
  pnpm wrangler whoami
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
