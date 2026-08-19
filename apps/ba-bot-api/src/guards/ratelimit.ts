export function utcDay(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}

export async function quotesToday(db: D1Database, ipHash: string, day: string): Promise<number> {
  const row = await db
    .prepare('SELECT quote_count FROM rate_limit WHERE ip_hash = ? AND day = ?')
    .bind(ipHash, day)
    .first<{ quote_count: number }>()
  return row?.quote_count ?? 0
}

export async function recordQuote(db: D1Database, ipHash: string, day: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO rate_limit (ip_hash, day, quote_count) VALUES (?, ?, 1)
       ON CONFLICT(ip_hash, day) DO UPDATE SET quote_count = quote_count + 1`,
    )
    .bind(ipHash, day)
    .run()
}

/** Chat turns are counted in their own table, not in `rate_limit`. A visitor
 *  takes many turns but generates one quote, so the two limits have different
 *  shapes and sharing a counter would make either one meaningless. */
export async function turnsToday(db: D1Database, ipHash: string, day: string): Promise<number> {
  const row = await db
    .prepare('SELECT turns FROM rate_limit_turns WHERE ip_hash = ? AND day = ?')
    .bind(ipHash, day)
    .first<{ turns: number }>()
  return row?.turns ?? 0
}

/** Incremented BEFORE the model call. Recording after would let a burst of
 *  concurrent requests all read the pre-increment count and all proceed — the
 *  exact case the limit exists to stop — and would leave a provider outage
 *  costing nothing, turning a failing provider into an unlimited retry loop. */
export async function recordTurn(db: D1Database, ipHash: string, day: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO rate_limit_turns (ip_hash, day, turns) VALUES (?, ?, 1)
       ON CONFLICT(ip_hash, day) DO UPDATE SET turns = turns + 1`,
    )
    .bind(ipHash, day)
    .run()
}
