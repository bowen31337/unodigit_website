# Admin scripts

Terminal access to the BA bot's D1 database, through `wrangler d1 execute`.

**There is now also a dashboard** at `https://admin.claw-forge.net/`, served by
the Worker itself and gated by Cloudflare Access — see
`src/api/admin.ts`. These scripts are not superseded by it and are not going
away; they own the two things a browser should not:

- **`delete-lead.sh`** — irreversible, and its safety comes from `--dry-run`
  plus typing the lead id back. That protection means nothing once a click can
  issue it, so the deletion path is deliberately absent from the HTTP surface.
- **`export-leads-csv.sh`** — writes to stdout so no second copy of personal
  information lands in a file (see below). A browser download is exactly the
  file this avoids creating.

The dashboard covers the read side: overview, funnel, per-day spend, leads, and
the `events` table — which, until it existed, nothing read at all.

## Why these were scripts first

Spec §12 described an `app/admin/` dashboard behind Cloudflare Access, and that
was not buildable on `unodigit.com.au`: its nameservers are at OnlyDomains, so
the domain is *served* by Cloudflare but not *managed* by it. An Access
application attaches to a hostname in a zone on your account; a CNAME-only
Pages custom domain is not a zone, and `unodigit-ba-bot.unodigit.workers.dev`
belongs to Cloudflare's zone rather than ours. Nothing to attach to, and the
Worker would verify a JWT that never arrives. Hand-rolling auth instead is the
thing the spec itself calls out as this project's most likely security
incident.

**`claw-forge.net` resolved that**: it is a full Cloudflare zone on the same
account, so an Access application and a Workers custom domain both have
somewhere to attach. The dashboard moved onto that hostname rather than onto
unodigit.com.au, and no DNS migration was needed. See the 2026-08-19 ruling in
`progress.txt` for the original scripts-only decision.

## Auth

Wrangler's own credentials. Nothing here reads 1Password, prints a token, or
holds a secret of its own.

Either log in interactively:

```
pnpm wrangler login
```

or export a Cloudflare API token with **D1 Edit** permission (the same token
`sync-secrets.sh` uses, at `op://application/cloudflare_api/api_token`):

```
export CLOUDFLARE_API_TOKEN="$(op read op://application/cloudflare_api/api_token)"
```

Confirm with `pnpm wrangler whoami`. Run the scripts from anywhere — they
resolve `apps/ba-bot-api` themselves.

## `--remote` is not optional

Every script passes `--remote`. **Without it wrangler queries the *local*
miniflare database** in `.wrangler/state/`, which on a normal checkout is
empty. You would see zero leads, no error, and reasonably conclude the bot has
produced nothing. That failure is quiet and convincing, which is why `--remote`
is hardcoded rather than left to a flag.

The database name is read from `wrangler.toml`, never hardcoded.

## The scripts

| Script | Writes? | Does |
|---|---|---|
| `leads.sh` | read-only | Recent leads with their quote counts and totals |
| `read-artifact.sh` | read-only | Print a brief's or quote's stored markdown |
| `funnel.sh` | read-only | Drop-off grouped by `abandoned_at_state` |
| `costs.sh` | read-only | Tokens and cost per conversation, plus rolling total |
| `export-leads-csv.sh` | read-only | CSV of leads, to **stdout** |
| `delete-lead.sh` | **WRITES** | Cascading deletion — the Privacy Act path |

```
./scripts/admin/leads.sh                    # 20 most recent
./scripts/admin/leads.sh 100 acme           # 100 most recent matching "acme"

./scripts/admin/read-artifact.sh list  lead_abc     # find the artifact ids
./scripts/admin/read-artifact.sh brief brf_abc | less
./scripts/admin/read-artifact.sh quote qte_abc | glow -

./scripts/admin/funnel.sh                   # all time
./scripts/admin/funnel.sh 30                # last 30 days

./scripts/admin/costs.sh                    # 20 most recent conversations
./scripts/admin/costs.sh 100 30             # 100 most recent, last 30 days

./scripts/admin/export-leads-csv.sh         # consenting leads
./scripts/admin/export-leads-csv.sh --all   # every lead

./scripts/admin/delete-lead.sh --dry-run lead_abc
./scripts/admin/delete-lead.sh lead_abc
```

`_lib.sh` and `_format.py` are shared helpers, not entry points.

## No script writes personal information to a file

Leads' names, emails and companies go to your **terminal**. Nothing here
creates a file, and that is deliberate: a CSV left in a working directory is a
second copy of personal information that `delete-lead.sh` cannot reach.
Honouring a deletion request would empty D1 and leave that file intact, which
is the failure the deletion path exists to prevent.

`export-leads-csv.sh` therefore writes to stdout. If you redirect it —

```
./scripts/admin/export-leads-csv.sh > /tmp/leads.csv
```

— that copy is now yours to manage and to delete. Prefer `| pbcopy`,
`| less`, or piping straight into whatever consumes it.

CSV quoting is done by Python's `csv` module in `_format.py`, not by shell
string concatenation, so a company name containing a comma, a quote or a
newline is escaped per RFC 4180 instead of silently splitting a column.

## `delete-lead.sh`

The only destructive script. Deletion is permanent — D1 has no undo here and
these scripts take no backup.

- **Always `--dry-run` first.** It runs the same counting SELECTs the real run
  does and prints the exact per-table row counts that would go. It executes no
  DELETE and no INSERT.
- The real run requires you to **type the lead id back**, not press `y`. A
  reflexive `y` is how the wrong lead gets deleted.
- It deletes children before parents, in the order derived from the
  `REFERENCES` clauses in `migrations/0001_initial.sql`:
  `quotes → briefs → messages → events → conversations → leads`.
  The order is about reachability as much as foreign keys: once the
  `conversations` rows are gone there is no way left to find that lead's
  messages, briefs or events, and they would be orphaned forever.
- **`rate_limit` and `rate_limit_turns` are not touched.** They are keyed by a
  salted SHA-256 of an IP — not personal information, not reversible to one —
  and they are the only thing metering DeepSeek spend. If deletion cleared
  them, "delete my data" would double as a quota reset and an abuser would ask
  for it daily. The lead's own `ip_hash` column lives on the `leads` row and
  does go with it.
- It records that a deletion happened **without retaining what was deleted**:
  an `events` row of type `lead_deleted` with a NULL `conversation_id` and no
  lead id, email, name or conversation id in the payload. The fact and the
  timestamp are what a compliance question asks for; the identifiers are what
  the request asked you to destroy.

## Testing

Do not test against production. `BA_BOT_D1_LOCAL=1` points every script at the
local miniflare database instead, and announces itself on stderr each run:

```
pnpm wrangler d1 migrations apply ba_bot --local
BA_BOT_D1_LOCAL=1 ./scripts/admin/leads.sh
```

That is the only supported way to run `delete-lead.sh` outside a real deletion
request.

## Adding a script

Source `_lib.sh`, use `d1_table` / `d1_csv` / `d1_scalar` / `d1_field`, and put
**every** caller-supplied value through `sql_lit` — it wraps the value in
single quotes and doubles any quote inside, so an id like `x' OR '1'='1`
becomes one string that matches no row rather than new syntax. Never
interpolate a bare `"$var"` into SQL. Integer arguments go through
`require_positive_int`, since a `LIMIT` cannot be a string literal.
