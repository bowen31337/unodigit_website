#!/usr/bin/env bash
#
# Print a brief's or a quote's stored markdown, exactly as generated.
#
# READ-ONLY. This script issues SELECTs and nothing else.
#
# Briefs contain the client's product concept and are commercially sensitive
# (spec section 8). They go to your terminal, not to a file.
#
# Usage:
#   ./scripts/admin/read-artifact.sh list  <lead_id>    what this lead produced
#   ./scripts/admin/read-artifact.sh brief <brief_id>   the brief markdown
#   ./scripts/admin/read-artifact.sh quote <quote_id>   the quote markdown
#
# Start with `list` -- leads.sh gives you a lead id, `list` turns it into the
# brief and quote ids the other two modes take.
#
# To page a long brief:   ./read-artifact.sh brief brf_xxx | less
# To render it:           ./read-artifact.sh brief brf_xxx | glow -

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

MODE="${1:-}"
ID="${2:-}"
require_arg "mode (list|brief|quote)" "$MODE"
require_arg "id" "$ID"

# Every id below is caller-supplied and reaches SQL only through sql_lit.
LIT="$(sql_lit "$ID")"

case "$MODE" in
  list)
    echo "Conversations, briefs and quotes for lead $ID:"
    echo
    d1_table "
      SELECT
        c.id                                        AS conversation_id,
        datetime(c.started_at / 1000, 'unixepoch')  AS started_utc,
        c.state                                     AS state,
        c.turn_count                                AS turns,
        COALESCE(b.id, '')                          AS brief_id,
        COALESCE(q.id, '')                          AS quote_id,
        COALESCE(q.mode, '')                        AS quote_mode,
        COALESCE(CAST(q.low_aud AS INTEGER), '')    AS low_aud,
        COALESCE(CAST(q.high_aud AS INTEGER), '')   AS high_aud
      FROM conversations c
      LEFT JOIN briefs b ON b.conversation_id = c.id
      LEFT JOIN quotes q ON q.brief_id = b.id
      WHERE c.lead_id = $LIT
      ORDER BY c.started_at DESC;
    "
    ;;

  brief|quote)
    table="briefs"
    [[ "$MODE" == "quote" ]] && table="quotes"

    # Check for existence separately, so a typo'd id reports "not found"
    # instead of printing nothing and looking like an empty artifact.
    found="$(d1_scalar "SELECT COUNT(*) AS n FROM $table WHERE id = $LIT;")"
    if [[ "$found" != "1" ]]; then
      echo "error: no $MODE with id '$ID'" >&2
      echo "hint: run './scripts/admin/read-artifact.sh list <lead_id>' to find ids" >&2
      exit 1
    fi

    d1_field "SELECT markdown FROM $table WHERE id = $LIT;" markdown
    echo
    ;;

  *)
    echo "error: unknown mode '$MODE' (expected list, brief or quote)" >&2
    exit 2
    ;;
esac
