-- Turn-level ledger, separate from the quote-level one. A visitor may take many
-- turns but generate one quote per day, so the two limits have different
-- shapes and must not share a counter.
CREATE TABLE IF NOT EXISTS rate_limit_turns (
  ip_hash TEXT NOT NULL,
  day     TEXT NOT NULL,
  turns   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, day)
);
