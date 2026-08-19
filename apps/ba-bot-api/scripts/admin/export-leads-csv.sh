#!/usr/bin/env bash
#
# Export leads as CSV -- to STDOUT.
#
# READ-ONLY. This script issues SELECTs and nothing else.
#
# It deliberately writes NO FILE. Every row here is personal information, and a
# CSV sitting in a working directory is a second copy of it that the Privacy
# Act deletion path (delete-lead.sh) cannot reach: deleting the lead from D1
# would leave the export untouched. Redirect it yourself if you have decided to
# accept that:
#
#   ./scripts/admin/export-leads-csv.sh > /tmp/leads.csv     # your copy, your problem
#   ./scripts/admin/export-leads-csv.sh | pbcopy             # usually enough
#   ./scripts/admin/export-leads-csv.sh | column -s, -t      # eyeball it
#
# Usage:
#   ./scripts/admin/export-leads-csv.sh              consenting leads only (default)
#   ./scripts/admin/export-leads-csv.sh --all        every lead, consent or not
#
# The default is consent_marketing = 1 because the usual reason to export is to
# mail people, and a lead who did not tick the box did not agree to that. --all
# exists for a data-subject access request or a migration, where consent is not
# the relevant question.
#
# Quoting is handled by Python's csv module in _format.py, not by shell string
# concatenation: a company name containing a comma, a quote or a newline is
# escaped per RFC 4180 rather than silently splitting a column.

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

WHERE="WHERE l.consent_marketing = 1"
case "${1:-}" in
  ""|--consenting) ;;
  --all) WHERE="" ;;
  *)
    echo "error: unknown option '${1}' (expected --all or --consenting)" >&2
    exit 2
    ;;
esac

# ip_hash, country and asn are omitted on purpose. They are not useful in a
# mail merge and a salted hash in a spreadsheet is a liability with no upside.
d1_csv "
  SELECT
    l.id                                            AS lead_id,
    datetime(l.created_at / 1000, 'unixepoch')      AS created_utc,
    COALESCE(l.name, '')                            AS name,
    l.email                                         AS email,
    COALESCE(l.company, '')                         AS company,
    COALESCE(l.role, '')                            AS role,
    COALESCE(l.utm_source, '')                      AS utm_source,
    COALESCE(l.utm_medium, '')                      AS utm_medium,
    COALESCE(l.utm_campaign, '')                    AS utm_campaign,
    COALESCE(l.referrer, '')                        AS referrer,
    COALESCE(l.landing_page, '')                    AS landing_page,
    l.consent_marketing                             AS consent_marketing,
    CASE WHEN l.consent_ts IS NULL THEN ''
         ELSE datetime(l.consent_ts / 1000, 'unixepoch') END AS consent_utc,
    (SELECT COUNT(*) FROM quotes q
       JOIN briefs b        ON q.brief_id = b.id
       JOIN conversations c ON b.conversation_id = c.id
      WHERE c.lead_id = l.id)                       AS quotes,
    (SELECT CAST(ROUND(SUM(q.low_aud)) AS INTEGER) FROM quotes q
       JOIN briefs b        ON q.brief_id = b.id
       JOIN conversations c ON b.conversation_id = c.id
      WHERE c.lead_id = l.id)                       AS quoted_low_aud,
    (SELECT CAST(ROUND(SUM(q.high_aud)) AS INTEGER) FROM quotes q
       JOIN briefs b        ON q.brief_id = b.id
       JOIN conversations c ON b.conversation_id = c.id
      WHERE c.lead_id = l.id)                       AS quoted_high_aud
  FROM leads l
  $WHERE
  ORDER BY l.created_at DESC;
"
