#!/usr/bin/env bash
#
# Shared helpers for the admin scripts. Sourced by them, never run directly.
#
# READ-ONLY: nothing in this file writes to the database. delete-lead.sh is the
# only script in this directory that mutates anything.
#
# There is no HTTP endpoint behind any of this. Every statement goes through
# `wrangler d1 execute`, authenticated by the Cloudflare API token wrangler
# already holds. No credential is read, printed or echoed here.

set -euo pipefail

ADMIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(cd "$ADMIN_DIR/../.." && pwd)"
FORMAT="$ADMIN_DIR/_format.py"

# The database name is READ FROM wrangler.toml, not hardcoded, so it cannot
# drift from the binding the Worker actually uses. If the toml is edited and
# this stops matching, every script fails loudly rather than querying a
# database nobody meant to touch.
DB_NAME="$(
  sed -n 's/^[[:space:]]*database_name[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' \
    "$API_DIR/wrangler.toml" | head -1
)"
if [[ -z "$DB_NAME" ]]; then
  echo "error: no database_name found in $API_DIR/wrangler.toml" >&2
  exit 1
fi

# --remote is the default and is what an operator always wants. WITHOUT it,
# wrangler silently queries the LOCAL miniflare database in .wrangler/state,
# which on a fresh checkout is empty -- so every script would report zero
# leads and the operator would conclude the bot has none. That failure mode is
# quiet and convincing, which is why the flag is never optional here.
#
# BA_BOT_D1_LOCAL=1 switches to --local. It exists ONLY for exercising these
# scripts against a throwaway local fixture (see README.md, "Testing"), it is
# opt-in via an environment variable rather than a flag so it cannot be reached
# by a typo, and it announces itself on stderr every time.
D1_ENV="--remote"
if [[ "${BA_BOT_D1_LOCAL:-0}" == "1" ]]; then
  D1_ENV="--local"
  echo "warning: BA_BOT_D1_LOCAL=1 -- reading the LOCAL fixture database, NOT production." >&2
fi

# Run one SQL statement and emit wrangler's raw JSON on stdout.
d1() {
  ( cd "$API_DIR" && pnpm --silent wrangler d1 execute "$DB_NAME" "$D1_ENV" --json --command "$1" )
}

d1_table()  { d1 "$1" | python3 "$FORMAT" table; }
d1_csv()    { d1 "$1" | python3 "$FORMAT" csv; }
d1_scalar() { d1 "$1" | python3 "$FORMAT" scalar; }
d1_field()  { d1 "$1" | python3 "$FORMAT" field "$2"; }

# Render an arbitrary shell value as a SQL string literal.
#
# This is the only way a caller-supplied value is ever allowed into a
# statement. The value is wrapped in single quotes and every single quote
# inside it is doubled, which is SQLite's own escape. An id of
#
#   x' OR '1'='1
#
# becomes the literal 'x'' OR ''1''=''1' -- one string that matches no row.
# It cannot terminate the literal, so it cannot introduce a second statement,
# a comment, or a new predicate. Callers must NEVER interpolate a bare "$var"
# into SQL; always sql_lit it first.
# The quote character goes through a variable rather than being backslash-
# escaped inline: in ${v//\'/\'\'} bash keeps the backslashes in the
# REPLACEMENT, so that form emits \'\' and produces invalid SQL. This form has
# no backslashes to keep.
sql_lit() {
  local sq="'"
  printf '%s%s%s' "$sq" "${1//$sq/$sq$sq}" "$sq"
}

# A missing argument under `set -u` is an error, but an argument that is
# present and EMPTY is not -- and an empty id in a WHERE clause is how a
# targeted read becomes a table scan (or, in delete-lead.sh, worse). Every
# script validates its arguments through this.
require_arg() {
  local name="$1" value="${2-}"
  if [[ -z "$value" ]]; then
    echo "error: $name is required and must not be empty" >&2
    exit 2
  fi
}

# A positive integer, used for every LIMIT. Rejects anything else rather than
# letting it reach the SQL, so LIMIT is never built from an unvalidated value.
require_positive_int() {
  local name="$1" value="${2-}"
  if [[ ! "$value" =~ ^[1-9][0-9]*$ ]]; then
    echo "error: $name must be a positive integer, got '${value}'" >&2
    exit 2
  fi
}
