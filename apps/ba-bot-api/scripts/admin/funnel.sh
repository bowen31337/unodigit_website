#!/usr/bin/env bash
#
# Where conversations stop: drop-off grouped by abandoned_at_state.
#
# READ-ONLY. This script issues SELECTs and nothing else.
#
# Prints no personal information -- it aggregates conversations, and
# conversations hold no name, email or company.
#
# Usage:
#   ./scripts/admin/funnel.sh          all time
#   ./scripts/admin/funnel.sh 30       last 30 days
#
# Reading it: abandoned_at_state is set when a conversation is given up on, so
# a large bucket names the question people will not answer. Rows where it is
# NULL are grouped as "(not abandoned)" -- they either finished or are still
# open, which the second table separates.

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

DAYS="${1:-}"

# SINCE is always a valid SQL integer expression, so every query below can
# carry an unconditional WHERE. Building the clause itself conditionally
# (`WHERE ...` or empty) is how a subquery ends up with a dangling AND.
# All-time is expressed as "since epoch 0", not as "no clause".
#
# started_at is milliseconds -- the Worker binds Date.now() -- hence * 1000.
SINCE="0"
LABEL="all time"
if [[ -n "$DAYS" ]]; then
  require_positive_int "days" "$DAYS"
  SINCE="((strftime('%s', 'now') - ($DAYS * 86400)) * 1000)"
  LABEL="last $DAYS days"
fi

echo "Drop-off by abandoned_at_state ($LABEL)"
echo
d1_table "
  SELECT
    COALESCE(abandoned_at_state, '(not abandoned)') AS abandoned_at_state,
    COUNT(*)                                        AS conversations,
    ROUND(
      100.0 * COUNT(*) / NULLIF(
        (SELECT COUNT(*) FROM conversations WHERE started_at >= $SINCE), 0),
      1
    )                                               AS pct_of_total,
    ROUND(AVG(turn_count), 1)                       AS avg_turns
  FROM conversations
  WHERE started_at >= $SINCE
  GROUP BY COALESCE(abandoned_at_state, '(not abandoned)')
  ORDER BY conversations DESC;
"

echo
echo "Current state of every conversation ($LABEL)"
echo
d1_table "
  SELECT
    state                                             AS state,
    COUNT(*)                                          AS conversations,
    SUM(CASE WHEN ended_at IS NULL THEN 1 ELSE 0 END) AS still_open,
    ROUND(AVG(turn_count), 1)                         AS avg_turns
  FROM conversations
  WHERE started_at >= $SINCE
  GROUP BY state
  ORDER BY conversations DESC;
"

echo
echo "Totals ($LABEL)"
echo
d1_table "
  SELECT
    (SELECT COUNT(*) FROM conversations
      WHERE started_at >= $SINCE)                          AS conversations,
    (SELECT COUNT(*) FROM conversations
      WHERE started_at >= $SINCE
        AND abandoned_at_state IS NOT NULL)                AS abandoned,
    (SELECT COUNT(*) FROM briefs b
       JOIN conversations c ON b.conversation_id = c.id
      WHERE c.started_at >= $SINCE)                        AS briefs,
    (SELECT COUNT(*) FROM quotes q
       JOIN briefs b        ON q.brief_id = b.id
       JOIN conversations c ON b.conversation_id = c.id
      WHERE c.started_at >= $SINCE)                        AS quotes,
    (SELECT COUNT(*) FROM leads
      WHERE created_at >= $SINCE)                          AS leads;
"
