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
