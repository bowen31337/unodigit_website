#!/usr/bin/env bash
#
# Tokens and cost per conversation, plus the rolling total.
#
# READ-ONLY. This script issues SELECTs and nothing else.
#
# Prints no personal information -- cost lives on conversations, which hold no
# name, email or company.
#
# Usage:
#   ./scripts/admin/costs.sh              20 most recent conversations
#   ./scripts/admin/costs.sh 100          100 most recent
#   ./scripts/admin/costs.sh 100 30       100 most recent, within the last 30 days
#
# cost_usd is written by the Worker from the provider's reported usage (spec
# section 14). It is DeepSeek spend, not a Cloudflare bill.

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

LIMIT="${1:-20}"
DAYS="${2:-}"
require_positive_int "limit" "$LIMIT"

# SINCE is always a valid SQL integer expression, so every query carries an
# unconditional WHERE -- all-time is "since epoch 0", not "no clause". Building
# the clause conditionally is how a subquery ends up with a dangling AND.
#
# started_at is milliseconds (Date.now()), hence * 1000.
SINCE="0"
LABEL="all time"
if [[ -n "$DAYS" ]]; then
  require_positive_int "days" "$DAYS"
  SINCE="((strftime('%s', 'now') - ($DAYS * 86400)) * 1000)"
  LABEL="last $DAYS days"
fi

echo "Per-conversation cost ($LABEL, $LIMIT most recent)"
echo
d1_table "
  SELECT
    id                                       AS conversation_id,
    datetime(started_at / 1000, 'unixepoch') AS started_utc,
    state                                    AS state,
    turn_count                               AS turns,
    tokens_in                                AS tokens_in,
    tokens_out                               AS tokens_out,
    ROUND(cost_usd, 4)                       AS cost_usd,
    CASE WHEN turn_count > 0
         THEN ROUND(cost_usd / turn_count, 4)
         ELSE 0 END                          AS cost_per_turn_usd
  FROM conversations
  WHERE started_at >= $SINCE
  ORDER BY started_at DESC
  LIMIT $LIMIT;
"

echo
echo "Rolling total ($LABEL -- every conversation in the window, not just the $LIMIT above)"
echo
d1_table "
  SELECT
    COUNT(*)                    AS conversations,
    COALESCE(SUM(turn_count),0) AS turns,
    COALESCE(SUM(tokens_in),0)  AS tokens_in,
    COALESCE(SUM(tokens_out),0) AS tokens_out,
    ROUND(COALESCE(SUM(cost_usd),0), 4) AS total_cost_usd,
    ROUND(COALESCE(AVG(cost_usd),0), 4) AS avg_cost_per_conversation_usd,
    ROUND(COALESCE(MAX(cost_usd),0), 4) AS max_cost_usd
  FROM conversations
  WHERE started_at >= $SINCE;
"

echo
echo "Cost per completed quote ($LABEL) -- the number to weigh against RATE_PER_TASK_AUD"
echo
d1_table "
  SELECT
    (SELECT COUNT(*) FROM quotes q
       JOIN briefs b        ON q.brief_id = b.id
       JOIN conversations c ON b.conversation_id = c.id
      WHERE c.started_at >= $SINCE)                          AS quotes,
    (SELECT ROUND(COALESCE(SUM(cost_usd),0), 4) FROM conversations
      WHERE started_at >= $SINCE)                            AS total_cost_usd,
    ROUND(
      (SELECT COALESCE(SUM(cost_usd),0) FROM conversations
        WHERE started_at >= $SINCE) /
      NULLIF(
        (SELECT COUNT(*) FROM quotes q
           JOIN briefs b        ON q.brief_id = b.id
           JOIN conversations c ON b.conversation_id = c.id
          WHERE c.started_at >= $SINCE), 0),
      4
    )                                                        AS cost_per_quote_usd;
"
