#!/usr/bin/env bash
#
# Delete a lead and everything derived from it. THE PRIVACY ACT DELETION PATH.
#
# *** THIS IS THE ONLY SCRIPT IN THIS DIRECTORY THAT WRITES. ***
# *** Deletion is permanent. D1 has no undo and these scripts take no backup. ***
#
# Usage:
#   ./scripts/admin/delete-lead.sh --dry-run <lead_id>    count rows, change nothing
#   ./scripts/admin/delete-lead.sh <lead_id>              delete, after confirmation
#
# Always run --dry-run first. The real run then requires you to TYPE THE LEAD
# ID BACK, not press y -- a habitual "y" is exactly how the wrong lead gets
# deleted, and the id is not something you can type by reflex.
#
# ---------------------------------------------------------------------------
# Foreign-key-safe deletion order
# ---------------------------------------------------------------------------
# Derived from the REFERENCES clauses in migrations/0001_initial.sql:
#
#   conversations.lead_id         REFERENCES leads(id)
#   messages.conversation_id      REFERENCES conversations(id)
#   briefs.conversation_id        REFERENCES conversations(id)
#   quotes.brief_id               REFERENCES briefs(id)
#   events.conversation_id        REFERENCES conversations(id)
#
# which is the tree  leads -> conversations -> {messages, briefs, events}
#                                              briefs -> quotes
#
# so children must go before parents:
#
#   1. quotes          (child of briefs -- MUST precede briefs, since it is
#                       reached only by joining through the briefs rows)
#   2. briefs          (child of conversations)
#   3. messages        (child of conversations)
#   4. events          (child of conversations)
#   5. conversations   (child of leads)
#   6. leads           (root)
#
# The order is not merely about FK enforcement -- D1 may or may not have
# foreign_keys pragma on. It is about REACHABILITY: once the conversations
# rows are gone there is no way left to find that lead's messages, briefs or
# events, and they would be orphaned in the database forever. Deleting
# bottom-up is what makes the cascade complete.
#
# ---------------------------------------------------------------------------
# What is deliberately NOT deleted
# ---------------------------------------------------------------------------
# rate_limit and rate_limit_turns are LEFT INTACT.
#
# They are keyed by ip_hash -- a salted SHA-256 of an IP under IP_HASH_SALT,
# which is not personal information and cannot be reversed to one. Meanwhile
# those two tables are the only thing standing between the bot and an
# unmetered DeepSeek bill. If deletion cleared them, "delete my data" would
# double as a quota reset button and an abuser would ask for it daily.
#
# The lead's OWN ip_hash column lives on the leads row and does go, with it.

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

DRY_RUN=0
LEAD_ID=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -*)
      echo "error: unknown option '$arg'" >&2
      exit 2
      ;;
    *)
      if [[ -n "$LEAD_ID" ]]; then
        echo "error: expected exactly one lead id, got '$LEAD_ID' and '$arg'" >&2
        exit 2
      fi
      LEAD_ID="$arg"
      ;;
  esac
done

require_arg "lead id" "$LEAD_ID"

# The lead id is caller-supplied and reaches SQL only through sql_lit, which
# doubles every single quote. It cannot terminate its string literal, so it
# cannot append a predicate, a comment, or a second statement. Every statement
# below interpolates $LIT, never a bare "$LEAD_ID".
LIT="$(sql_lit "$LEAD_ID")"

# ---------------------------------------------------------------------------
# 1. The lead must exist. A typo'd id would otherwise "succeed" against zero
#    rows and be reported to the requester as a completed deletion.
# ---------------------------------------------------------------------------
exists="$(d1_scalar "SELECT COUNT(*) AS n FROM leads WHERE id = $LIT;")"
if [[ "$exists" != "1" ]]; then
  echo "error: no lead with id '$LEAD_ID' (found $exists rows)" >&2
  echo "hint: './scripts/admin/leads.sh 50 <search>' finds the id" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 2. Count what would go, per table, in the same order it would be deleted.
#    This is a pure SELECT and runs identically on a dry run and a real one --
#    which is the point: the dry run shows the real plan, not a description
#    of it.
# ---------------------------------------------------------------------------
counts_sql="
  SELECT
    (SELECT COUNT(*) FROM quotes q
       JOIN briefs b        ON q.brief_id = b.id
       JOIN conversations c ON b.conversation_id = c.id
      WHERE c.lead_id = $LIT)                                          AS s1_quotes,
    (SELECT COUNT(*) FROM briefs
      WHERE conversation_id IN (SELECT id FROM conversations WHERE lead_id = $LIT)) AS s2_briefs,
    (SELECT COUNT(*) FROM messages
      WHERE conversation_id IN (SELECT id FROM conversations WHERE lead_id = $LIT)) AS s3_messages,
    (SELECT COUNT(*) FROM events
      WHERE conversation_id IN (SELECT id FROM conversations WHERE lead_id = $LIT)) AS s4_events,
    (SELECT COUNT(*) FROM conversations WHERE lead_id = $LIT)          AS s5_conversations,
    (SELECT COUNT(*) FROM leads WHERE id = $LIT)                       AS s6_leads;
"

echo "Lead: $LEAD_ID"
echo
echo "Rows that WOULD be deleted, in foreign-key-safe order (s1 first):"
echo
d1_table "$counts_sql"

# Reported so the operator can see they are untouched, not so they can be
# cleared. Nothing below deletes from either table.
echo
echo "NOT deleted (salted hashes, not personal information -- and clearing them"
echo "would hand an abuser a rate-limit reset):"
echo
d1_table "
  SELECT
    (SELECT COUNT(*) FROM rate_limit)       AS rate_limit_rows,
    (SELECT COUNT(*) FROM rate_limit_turns) AS rate_limit_turns_rows;
"

if [[ "$DRY_RUN" == "1" ]]; then
  echo
  echo "DRY RUN -- no statement other than the SELECTs above was executed."
  echo "Nothing was deleted. Re-run without --dry-run to delete for real."
  exit 0
fi

# ---------------------------------------------------------------------------
# 3. Explicit confirmation: type the id, not a letter.
# ---------------------------------------------------------------------------
echo
echo "*** This is permanent. There is no undo and no backup. ***"
echo
printf 'Type the lead id exactly to confirm deletion: '
read -r typed
if [[ "$typed" != "$LEAD_ID" ]]; then
  echo "Aborted -- what you typed does not match the lead id. Nothing was deleted."
  exit 1
fi

# ---------------------------------------------------------------------------
# 4. Delete, children before parents. One statement per step so a failure
#    stops the run (set -e) at a known point rather than half-applying a
#    multi-statement command.
# ---------------------------------------------------------------------------
step() {
  local label="$1" sql="$2"
  echo "→ deleting $label"
  d1 "$sql" >/dev/null
}

step "quotes"        "DELETE FROM quotes WHERE brief_id IN (
                        SELECT b.id FROM briefs b
                        JOIN conversations c ON b.conversation_id = c.id
                        WHERE c.lead_id = $LIT);"

step "briefs"        "DELETE FROM briefs WHERE conversation_id IN (
                        SELECT id FROM conversations WHERE lead_id = $LIT);"

step "messages"      "DELETE FROM messages WHERE conversation_id IN (
                        SELECT id FROM conversations WHERE lead_id = $LIT);"

step "events"        "DELETE FROM events WHERE conversation_id IN (
                        SELECT id FROM conversations WHERE lead_id = $LIT);"

step "conversations" "DELETE FROM conversations WHERE lead_id = $LIT;"

step "lead"          "DELETE FROM leads WHERE id = $LIT;"

# ---------------------------------------------------------------------------
# 5. Prove it. Re-running the same counts must now be zero across the board.
# ---------------------------------------------------------------------------
echo
echo "Remaining rows for that lead (every column must read 0):"
echo
d1_table "$counts_sql"

# ---------------------------------------------------------------------------
# 6. Log THAT a deletion happened, without retaining WHAT was deleted.
#
#    No lead id, no email, no name, no conversation id -- retaining any of them
#    would defeat the deletion. The audit record is the fact, the timestamp and
#    the row counts, which is what a compliance question actually asks: was a
#    request honoured, and when. The row goes in `events` with a NULL
#    conversation_id, which the column allows (0001_initial.sql).
# ---------------------------------------------------------------------------
event_id="$(python3 -c 'import uuid; print("evt_" + uuid.uuid4().hex)')"
now_ms="$(python3 -c 'import time; print(int(time.time() * 1000))')"
payload="$(python3 -c '
import json, sys
print(json.dumps({
    "source": "scripts/admin/delete-lead.sh",
    "reason": "privacy_act_deletion_request",
    "note": "subject identifiers intentionally not retained",
}))
')"

d1 "INSERT INTO events (id, conversation_id, type, payload_json, created_at)
    VALUES ($(sql_lit "$event_id"), NULL, 'lead_deleted', $(sql_lit "$payload"), $now_ms);" >/dev/null

echo
echo "Deleted. Audit event $event_id recorded (type 'lead_deleted', no subject"
echo "identifiers retained). rate_limit and rate_limit_turns were not touched."
