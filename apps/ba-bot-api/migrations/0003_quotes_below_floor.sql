-- below_floor stores the pricing verdict at the moment a quote was rendered,
-- persisted, and (when a lead exists) emailed. It must never be re-derived at
-- read time: MINIMUM_ENGAGEMENT_AUD is a live env var (wrangler.toml), not a
-- constant, so `weighted_tasks * rate_aud < minimumAud` recomputed on every
-- read can silently disagree with the markdown that was already rendered and
-- emailed the moment that var changes. See progress.txt, 2026-08-19 US-007
-- controller notes ("belowFloor is re-derived on the idempotent re-read") and
-- the 2026-08-19 pricing-configuration entry, which is why the value is not a
-- constant in practice: RATE_PER_TASK_AUD already moved once (10 -> 25).
--
-- SQLite has no boolean type. This repo's existing convention represents
-- booleans as INTEGER NOT NULL DEFAULT 0 — see leads.consent_marketing and
-- messages.off_topic in 0001_initial.sql — matched here.
ALTER TABLE quotes ADD COLUMN below_floor INTEGER NOT NULL DEFAULT 0;

-- Backfill existing rows. There are almost certainly zero rows in production
-- today, but a migration that silently leaves pre-existing rows wrong is
-- worse than one that handles them explicitly.
--
-- LIMITATION, stated plainly: the floor that was actually in effect when each
-- historical row was WRITTEN cannot be recovered. MINIMUM_ENGAGEMENT_AUD is a
-- live env var, not a stored value, and no history of it exists anywhere in
-- this schema. This backfill applies the CURRENT MINIMUM_ENGAGEMENT_AUD
-- (6000 AUD, wrangler.toml as of this migration) retroactively to every
-- existing row's weighted_tasks * rate_aud. Any row that was actually written
-- under a DIFFERENT historical floor will therefore carry a RE-DERIVED
-- verdict here, not its original one — precisely the class of drift this
-- migration exists to eliminate for every row written from this point
-- forward. This is a best-effort backfill, not a reconstruction of history.
UPDATE quotes
SET below_floor = CASE WHEN weighted_tasks * rate_aud < 6000 THEN 1 ELSE 0 END;
