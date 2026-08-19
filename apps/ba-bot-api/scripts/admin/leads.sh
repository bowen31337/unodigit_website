#!/usr/bin/env bash
#
# Recent leads, with the quotes each one produced.
#
# READ-ONLY. This script issues SELECTs and nothing else.
#
# Prints personal information (name, email, company) to your TERMINAL. It
# writes no file -- see README.md for why that is deliberate.
#
# Usage:
#   ./scripts/admin/leads.sh              20 most recent leads
#   ./scripts/admin/leads.sh 100          100 most recent leads
#   ./scripts/admin/leads.sh 20 acme      most recent leads matching "acme"
#                                         in email, name or company
#
# The lead id in the first column is what read-artifact.sh and delete-lead.sh
# take.

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

LIMIT="${1:-20}"
SEARCH="${2:-}"
require_positive_int "limit" "$LIMIT"

# A search term is caller-supplied, so it goes through sql_lit like every other
# value. The % wildcards are added INSIDE the literal, after escaping, so a
# term containing a quote is matched as text rather than closing the string.
WHERE=""
if [[ -n "$SEARCH" ]]; then
  pattern="$(sql_lit "%${SEARCH}%")"
  WHERE="WHERE l.email LIKE $pattern
            OR COALESCE(l.name, '') LIKE $pattern
            OR COALESCE(l.company, '') LIKE $pattern"
fi

# Counts and sums come from correlated subqueries rather than a join, because
# a lead with two conversations and one quote would otherwise have its quote
# counted twice by the join fan-out.
#
# Timestamps are milliseconds (the Worker binds Date.now()), hence the /1000.
d1_table "
  SELECT
    l.id                                                   AS lead_id,
    datetime(l.created_at / 1000, 'unixepoch')             AS created_utc,
    COALESCE(l.name, '')                                   AS name,
    l.email                                                AS email,
    COALESCE(l.company, '')                                AS company,
    COALESCE(l.utm_source, l.referrer, 'direct')           AS source,
    (SELECT COUNT(*) FROM conversations c
       WHERE c.lead_id = l.id)                             AS convos,
    (SELECT COUNT(*) FROM quotes q
       JOIN briefs b        ON q.brief_id = b.id
       JOIN conversations c ON b.conversation_id = c.id
      WHERE c.lead_id = l.id)                              AS quotes,
    (SELECT CAST(ROUND(SUM(q.low_aud)) AS INTEGER) FROM quotes q
       JOIN briefs b        ON q.brief_id = b.id
       JOIN conversations c ON b.conversation_id = c.id
      WHERE c.lead_id = l.id)                              AS quoted_low_aud,
    (SELECT CAST(ROUND(SUM(q.high_aud)) AS INTEGER) FROM quotes q
       JOIN briefs b        ON q.brief_id = b.id
       JOIN conversations c ON b.conversation_id = c.id
      WHERE c.lead_id = l.id)                              AS quoted_high_aud,
    CASE l.consent_marketing WHEN 1 THEN 'yes' ELSE 'no' END AS consent
  FROM leads l
  $WHERE
  ORDER BY l.created_at DESC
  LIMIT $LIMIT;
"
