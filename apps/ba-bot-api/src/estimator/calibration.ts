/**
 * FROZEN. Reference decompositions that anchor the estimator's counts.
 *
 * A small model gives stable numbers when it has worked examples to interpolate
 * between, and drifts badly without them. These span the realistic range.
 *
 * ─── What a "task" is, verified from claw-forge's source ───────────────────
 *
 * The conversion is STRICTLY 1:1 with no multiplier, and it is a parse, not a
 * calculation. In `claw_forge/spec/parser.py` (~line 350, "each bullet = one
 * feature") every `<feature>` element — and every legacy `- ` / `* ` text
 * bullet — inside `<core_features>` becomes exactly one `FeatureItem`, and
 * `claw_forge/spec/cli.py` `_write_plan_to_db` does exactly one `db.add(Task(`
 * per feature. Nothing fans out: no generated test task, no review task, no
 * per-category overhead.
 *
 * So: one spec bullet = one task = one unit of cost. That is what makes
 * "estimate the shape, not the bullets" sound — predicting per-category bullet
 * counts IS predicting the task count, with no conversion factor in between.
 *
 * `claw-forge plan` is also deterministic and fully offline (its own docstring:
 * "no model is called and no API key is required"; `--model` does not affect
 * the DAG). The variability therefore lives entirely upstream, in how many
 * bullets `create-spec` writes for a given project — which is the step this
 * estimator is approximating.
 *
 * Two caveats worth knowing before trusting a number:
 *   - claw-forge's own `ProjectSpec.features` comment says 100-400 items, wider
 *     than the 100-300 our spec quotes. PROGRAM_MODE_THRESHOLD (300) therefore
 *     splits somewhat earlier than claw-forge strictly requires.
 *   - `_write_plan_to_db(append_e2e=True)` adds end-to-end tasks beyond the 1:1
 *     rule. Off by default; if it is ever turned on for real delivery, task
 *     counts rise and these references understate.
 *
 * ─── Provenance of the numbers below ───────────────────────────────────────
 *
 * MEASURED: only entry C's total. It is a real claw-forge decomposition —
 * 224 tasks, from the session exported at
 * fengshui/claw-forge-export-c16a3bd6-20260510-080902.json.
 *
 * ESTIMATED: entries A and B in full, and every per-category split including
 * C's. The splits cannot be measured, because claw-forge's categories are
 * PROJECT-SPECIFIC, not our seven: that same 224-task export carries 32
 * distinct categories ("Xuan Kong Flying Stars Engine", "Bazi Engine", ...),
 * of which only three overlap ours by name. CATEGORY_WEIGHTS is our own
 * commercial weighting taxonomy; claw-forge never produces it.
 *
 * Do not silently upgrade an ESTIMATED number to a measured one. The original
 * failure mode of this file was invented numbers that looked measured, which is
 * worse than an obvious placeholder because the next reader stops questioning
 * it. To add a real data point: run `claw-forge plan <spec> --project <a
 * scratch dir> --fresh` and read the reported feature count. Never point
 * `--project` at a real project — plan writes to `.claw-forge/state.db` and
 * reconciles with the existing session.
 */
export const CALIBRATION = `Reference decompositions, for scale:

A. Single-user expense tracker. CRUD, CSV export, one auth method, no integrations.
   Authentication & User Management 6, Core functionality 14, Data management 8,
   UI/UX 9, API layer 5, Admin features 0, Integrations 0. Total 42. Confidence high.

B. Multi-tenant booking platform. Roles, calendar, Stripe, email + SMS reminders.
   Authentication & User Management 14, Core functionality 38, Data management 18,
   UI/UX 20, API layer 14, Admin features 8, Integrations 16. Total 128. Confidence medium.

C. Multi-engine analysis platform. Address search, file upload and parsing,
   several independent calculation engines, generated long-form reports,
   a rules engine, caching, and a bilingual report viewer.
   Authentication & User Management 14, Core functionality 82, Data management 34,
   UI/UX 36, API layer 24, Admin features 12, Integrations 22. Total 224. Confidence low.`
