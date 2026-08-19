#!/usr/bin/env python3
"""Render `wrangler d1 execute --json` output for the admin scripts.

Reads wrangler's JSON on stdin and writes a human table, a CSV, or a single
field to stdout. Exists for one reason that shell cannot do safely: CSV
quoting. A company name will eventually contain a comma, a quote, or a
newline, and `echo "$a,$b"` silently corrupts the file at that point. The
stdlib `csv` module gets the escaping right (RFC 4180: wrap in quotes, double
any embedded quote), so the CSV path goes through it.

Nothing here writes to a file. Output is stdout only, deliberately -- see the
note on personal information in README.md.

Usage (stdin is wrangler's JSON in every case):
  _format.py table            aligned table, one line per row
  _format.py csv              RFC 4180 CSV, header row first
  _format.py scalar           first row's first column, raw
  _format.py field <name>     first row's <name> column, raw (for markdown)
  _format.py rowcount         number of rows returned
"""

import csv
import json
import sys

# Table cells are truncated so one 8kB brief markdown cannot destroy the
# alignment of every other column. `field` mode is the way to read full text.
MAX_CELL = 70


def load_rows() -> list[dict]:
    raw = sys.stdin.read().strip()
    if not raw:
        return []
    # Be forgiving about a leading banner line: slice from the first bracket.
    start = min((i for i in (raw.find("["), raw.find("{")) if i != -1), default=-1)
    if start == -1:
        print(f"error: wrangler returned no JSON:\n{raw}", file=sys.stderr)
        sys.exit(1)
    try:
        doc = json.loads(raw[start:])
    except json.JSONDecodeError as exc:
        print(f"error: could not parse wrangler JSON ({exc}):\n{raw}", file=sys.stderr)
        sys.exit(1)

    # wrangler returns a list of result sets, one per statement.
    sets = doc if isinstance(doc, list) else [doc]
    rows: list[dict] = []
    for s in sets:
        if isinstance(s, dict):
            rows.extend(s.get("results") or [])
    return rows


def columns(rows: list[dict]) -> list[str]:
    cols: list[str] = []
    for row in rows:
        for key in row:
            if key not in cols:
                cols.append(key)
    return cols


def cell(value: object) -> str:
    if value is None:
        return ""
    text = str(value).replace("\n", " ").replace("\t", " ")
    return text[: MAX_CELL - 1] + "…" if len(text) > MAX_CELL else text


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2
    mode = sys.argv[1]
    rows = load_rows()

    if mode == "rowcount":
        print(len(rows))
        return 0

    if mode == "scalar":
        # `or ""` would be wrong here: a COUNT(*) of 0 is falsy and must still
        # print "0", not an empty string that a caller would misread.
        if not rows or not rows[0]:
            print("")
            return 0
        value = next(iter(rows[0].values()))
        print("" if value is None else value)
        return 0

    if mode == "field":
        if len(sys.argv) < 3:
            print("error: field mode needs a column name", file=sys.stderr)
            return 2
        name = sys.argv[2]
        if not rows:
            return 0
        if name not in rows[0]:
            print(f"error: no column '{name}' in result", file=sys.stderr)
            return 1
        # No trailing newline juggling: markdown is printed exactly as stored.
        sys.stdout.write(str(rows[0][name] or ""))
        return 0

    if mode == "csv":
        if not rows:
            return 0
        writer = csv.writer(sys.stdout, lineterminator="\n")
        cols = columns(rows)
        writer.writerow(cols)
        for row in rows:
            writer.writerow(["" if row.get(c) is None else row.get(c) for c in cols])
        return 0

    if mode == "table":
        if not rows:
            print("(no rows)")
            return 0
        cols = columns(rows)
        table = [[cell(r.get(c)) for c in cols] for r in rows]
        widths = [
            max(len(cols[i]), *(len(r[i]) for r in table)) for i in range(len(cols))
        ]
        sep = "  "
        print(sep.join(c.ljust(widths[i]) for i, c in enumerate(cols)))
        print(sep.join("-" * w for w in widths))
        for r in table:
            print(sep.join(v.ljust(widths[i]) for i, v in enumerate(r)).rstrip())
        print(f"\n({len(rows)} row{'' if len(rows) == 1 else 's'})")
        return 0

    print(f"error: unknown mode '{mode}'", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
