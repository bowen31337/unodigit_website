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
 *   - claw-forge's own `ProjectSpec.features` says 100-400 items
 *     (`spec/parser.py:219`) and its initializer says the same
 *     (`plugins/initializer.py:20`), while its XML template says 100-300. The
 *     measured spread above (49-365) matches the WIDER figure, so the prompt
 *     now quotes 100-400 and PROGRAM_MODE_THRESHOLD (300) splits two of the
 *     nine real projects.
 *   - `_write_plan_to_db(append_e2e=True)` adds end-to-end tasks beyond the 1:1
 *     rule. Off by default; if it is ever turned on for real delivery, task
 *     counts rise and these references understate.
 *
 * ─── Provenance of the numbers below ───────────────────────────────────────
 *
 * MEASURED: every total below. Each is a real claw-forge decomposition, read
 * from that project's `.claw-forge/state.db` with `SELECT COUNT(*) FROM tasks`.
 * The fengshui count (224) reproduces the previously exported figure exactly,
 * which is what validates the method.
 *
 *   claw-forge-plugin     49     Continuo    205     synapse              315
 *   devShield            113     fengshui    224     agent-trading-arena  365
 *   AFOS                 135     meridian    273
 *   AlphaStrike          157
 *
 * Observed range 49-365, median 205. THREE of nine exceed 224, which was the
 * largest anchor this file previously offered, and TWO exceed 300. The
 * estimator had never been shown a project above 224 and was anchoring low
 * accordingly: real quotes were landing at 110-166 tasks for projects whose
 * real decompositions sit at 200-365.
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
export const CALIBRATION = `Reference decompositions, for scale. Every total is
a real measured claw-forge decomposition:

A. Editor plugin. Wraps an existing CLI, no backend, no persistence of its own.
   Authentication & User Management 0, Core functionality 22, Data management 4,
   UI/UX 14, API layer 9, Admin features 0, Integrations 0. Total 49. Confidence high.

B. Offline CLI scanner. Rule engine over a package tree, local cache, no server.
   Authentication & User Management 0, Core functionality 54, Data management 22,
   UI/UX 8, API layer 12, Admin features 5, Integrations 12. Total 113. Confidence high.

C. Multi-tenant booking platform. Roles, calendar, payments, email and SMS.
   Authentication & User Management 18, Core functionality 46, Data management 24,
   UI/UX 26, API layer 18, Admin features 10, Integrations 15. Total 157. Confidence medium.

D. Multi-engine analysis platform. Address search, file upload and parsing,
   several independent calculation engines, generated long-form reports,
   a rules engine, caching, and a bilingual report viewer.
   Authentication & User Management 14, Core functionality 82, Data management 34,
   UI/UX 36, API layer 24, Admin features 12, Integrations 22. Total 224. Confidence low.

E. Durable execution platform. Workflow engine, scheduler, retries, worker
   protocol, state store, operator console.
   Authentication & User Management 16, Core functionality 104, Data management 48,
   UI/UX 34, API layer 38, Admin features 18, Integrations 15. Total 273. Confidence low.

F. Agentic operations platform. Structured data layer, stateful agent runtime,
   connectors to many external systems, admin and observability surfaces.
   Authentication & User Management 22, Core functionality 112, Data management 56,
   UI/UX 40, API layer 42, Admin features 20, Integrations 23. Total 315. Confidence low.

G. Multi-agent trading arena. Market simulation, several competing agents,
   backtesting, leaderboards, live dashboards, exchange integrations.
   Authentication & User Management 20, Core functionality 138, Data management 62,
   UI/UX 48, API layer 46, Admin features 22, Integrations 29. Total 365. Confidence low.

Most real projects land between 100 and 365. A platform with several
independent engines, a durable runtime, or many connectors belongs at the top of
that range, not the middle. When torn between two counts, choose the higher — an
estimate that is short helps nobody.`
