# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Uno Digit is the marketing site for an AI consultancy in Sydney, plus the backend for
its requirements-elicitation bot. It is a **pnpm workspace driven by Turborepo**, with
two independently deployed units:

| Package | What | Deploys to |
|---|---|---|
| `apps/web` (`@unodigit/web`) | Next.js 16 marketing site, static export | Cloudflare **Pages** |
| `apps/ba-bot-api` (`@unodigit/ba-bot-api`) | Hono Worker — the BA bot API | Cloudflare **Workers** |
| `packages/ba-bot-contract` | Zod wire contract shared by both | — |

The repo root holds workspace metadata only — no sources, no app manifest.

## Commands

Root scripts delegate through Turbo; run them from the repo root.

- **Dev server (site):** `pnpm dev` → `apps/web` on :3000
- **Build (site):** `pnpm build` → static export in `apps/web/out` (21 pages)
- **Typecheck everything:** `pnpm ws:typecheck`
- **Test everything:** `pnpm ws:test`
- **Bot:** `pnpm bot:dev` / `pnpm bot:test` / `pnpm bot:deploy`
- **Lint:** none that works. See "Known gaps" below.

Package manager is **pnpm**. The Worker has a real Vitest suite (68 tests, via
`@cloudflare/vitest-pool-workers`); `apps/web` has **no tests**, so `pnpm build` is
still its only gate.

## Architecture

### Static Export

The site is configured for full static export (`output: 'export'` in `next.config.js`). All pages are pre-rendered at build time. There are no API routes, no server-side rendering, and no database. Image optimization is disabled (`unoptimized: true`) to support static export.

`trailingSlash: true` is also set, so every route emits a directory (`out/about/index.html`)
and canonical URLs carry the trailing slash (`/about/`). Keep internal `href`s consistent
with that — Cloudflare Pages will redirect a slash-less URL, costing a round trip.

### Server/Client Component Split

Every route follows a consistent pattern:
- **`page.tsx`** — Server component that defines `Metadata` (for SEO) and renders the client component
- **`*Client.tsx`** — Client component (`'use client'`) containing all interactive UI and animations

Example: `app/work/page.tsx` exports metadata and renders `<WorkClient />`.

Dynamic routes (`app/work/[slug]/`, `app/insights/[slug]/`) use `generateStaticParams()` to pre-render all slugs from data files at build time.

### Directory Layout

Everything below is inside **`apps/web/`** (the site was moved off the repo root):

- `app/` — Next.js App Router pages (home, about, services, work, insights, contact)
- `components/` — Shared components (see "Shared components" below)
- `data/` — Static content as TypeScript objects with `React.ReactNode` content fields (`projects.tsx`, `articles.tsx`)
- `lib/utils.ts` — `cn()` helper (clsx + tailwind-merge)
- `public/` — Static assets (favicon.svg, logo.png)

The Worker lives in `apps/ba-bot-api/src/`: `graph/` (pure FSM), `llm/` (provider
adapter), `db/` (typed D1 queries), `guards/`, `api/` (Hono routes).

### Styling — Apple design token layer

`apps/web/app/globals.css` is the **single source of truth** for design values. Never hardcode a
hex, size, radius, or duration in a component — reference the tokens, so both themes
and the `prefers-*` fallbacks keep working. `tailwind.config.ts` is only a bridge: every
utility resolves to a CSS custom property.

**Brand colour is derived from `public/logo.png`** and nothing else. The logo contains
exactly two colours — cyan `#06b6d4` (the U stroke) and violet `#8b5cf6` (the two
nodes). Both are expanded into hue-locked 50–900 ramps.

**Accent has two tracks, and this matters.** The logo cyan is only 2.43:1 on white, so
it can never be a text colour in light mode:

| Token | Role | Light | Dark |
|---|---|---|---|
| `--accent` | graphics only — fills, tints, glows, dots | `#06b6d4` (logo) | `#06b6d4` |
| `--accent-ink` | body text and links (≥4.5:1) | `cyan-700` | `cyan-400` |
| `--accent-display` | large text only, ≥24px bold (≥3:1) | `cyan-600` | `cyan-400` |
| `--accent-solid` / `--on-accent` | filled controls — ink flips per theme | deep cyan + white | bright cyan + near-black |

Contrast was validated on **both** `--bg` and `--bg-secondary`; a token that passes on
white can still fail on `#f2f2f7`. `--accent-display` was chosen by sampling real
rendered hero pixels over the gradient mesh, not by assuming a white page.

Error red follows the same two-track split: `--red` is graphics-only (Apple systemRed,
3.29:1 on white — borders and fills), `--red-ink` is the text track
(accessibleSystemRed, 5.92:1). Never set error *copy* in `--red`.

In **light mode** `--label-secondary` is deliberately **0.73** alpha, not Apple's shipping
0.60 — Apple's value measures 3.44:1 on white and fails WCAG AA. Dark mode keeps 0.60,
which passes against `#000`. `--label-tertiary` is decorative-only (list markers,
scrollbar); never put readable copy on it.

Other conventions:
- **Type roles** (`.type-display`, `.type-title-1`, `.type-body`, `.type-eyebrow`, …)
  bundle size + weight + tracking + leading as a set. Use these rather than ad-hoc
  Tailwind sizes — tracking must tighten as size grows and leading must loosen as size
  shrinks, and the role classes encode that.
- **Materials** — `.glass` / `.glass-thin` / `.glass-thick` / `.glass-liquid`. A material
  is four optical layers (tint, blur + saturate, inset specular top edge, hairline rim +
  depth shadow). Glass needs *content behind it*; over a flat section it collapses to an
  empty outline, so put a `<GradientMesh>` behind it or use the opaque `.card` instead.
  Never stack two translucent surfaces directly.
- **Motion** — springs for anything interactive, never fixed-duration transitions.
  Apple's ship values: reposition `bounce:0 / visualDuration:0.4`, sheet `bounce:0.2 /
  0.3`. Press feedback is CSS `:active { scale(0.97) }` so it fires on pointer-*down*.
  Animate `transform`/`opacity` only.
- **Accessibility is wired in**: `prefers-reduced-motion`, `prefers-reduced-transparency`
  and `prefers-contrast: more` all have real fallbacks. Verify changes against them.
- Dark mode is driven by `data-theme` on `<html>` (next-themes), with a
  `prefers-color-scheme` block for the pre-hydration / no-JS case.
- **One deliberate copy of the token layer exists**, in
  `apps/ba-bot-api/src/admin/dashboard.ts`. That page ships from a different
  package with no build step and a `default-src 'none'` CSP, so it can neither
  import `globals.css` nor fetch a font — it carries a hand-ported subset of the
  same tokens, plus the brand face inlined as a `data:` URI from the generated
  `src/admin/font-inline.ts` (`font-src data:` is the only directive added).
  **Change a token in `globals.css` and change it there too — the font is now
  part of that contract.** For the same reason the logo is inline SVG and the
  favicon a `data:` URI, not `/logo.png`.

### Typography — two brand faces, self-hosted

**There is no Google Fonts request.** `globals.css` used to open with an
`@import` of the Google CDN; a CSS `@import` is discovered only after the
stylesheet parses, so that serialised two blocking third-party round trips ahead
of first paint, and cost 444.6 KB for four static weights. Total font payload is
now **73 KB**, first-party. Regenerate with
`python3 tools/fonts/build-fonts.py` (Uno Sans/Mono) and
`python3 tools/fonts/uno-display/build-display.py` (Uno Display). Neither runs in
CI — the binaries are committed deliberately.

| Face | Origin | Used by |
|---|---|---|
| **Uno Display** | **Drawn** — 82 glyphs, parametric, original work, no OFL obligation | `.type-display`, `.type-title-1`, print collateral |
| **Uno Sans** | Inter 4.1 (OFL 1.1, no RFN) — `ss07/ss08/cv05` frozen into the cmap, name table rewritten, subset | everything else |
| **Uno Mono** | JetBrains Mono derived | `--font-mono` |

**`size-adjust: 93.02%` on Uno Sans is load-bearing — do not change it.**
Measured: SF Pro's x-height ratio is 0.5078, Inter's is 0.5459, so Inter renders
7.5% larger at the same px size, and every tracking value in the token layer was
tuned against SF. 93.02% (= 100/107.5) makes the x-heights match exactly, so the
scale needs no re-tuning and Apple devices see zero layout shift on swap. The
cost is capitals 3.9% shorter — cap-height cannot also match. If uppercase reads
light, raise weight on that role; never move `size-adjust`.

**The brand face now leads on Apple devices too**, reversing the previous
SF-first stack. Deliberate: a brand whose typeface changes with the visitor's
hardware does not control its own voice. It is only safe *because* of
`size-adjust`. If that is ever removed, revert the stack order with it.

**Fallback `size-adjust` values must be measured the same way on both sides.**
They come from `@capsizecss/metrics` for the source font *and* for each fallback.
Reading `OS/2.xAvgCharWidth` off the binary instead yielded `size-adjust: 133.87%`
where ~100% is correct — an all-glyph mean versus a frequency-weighted average
are different measurements. Never mix them.

**Uno Display cannot carry a weight axis.** It is built with boolean operations,
so its masters are not interpolatable. Four static cuts; Uno Sans has the axes.

### Touch surfaces

`viewportFit: 'cover'` in `layout.tsx` is what makes `env(safe-area-inset-*)`
resolve to anything but 0 — the `--safe-t/r/b/l` tokens are inert without it.
The BaBot sheet uses `max(var(--babot-kb), var(--safe-b))`, **not** a sum: when
the keyboard is up it already covers the home indicator, and adding both floats
the sheet above the keyboard. `-webkit-tap-highlight-color: transparent` is set
so the designed `:active { scale(0.97) }` is the only press feedback. Every
`:hover` is gated behind `@media (hover: hover)` — iOS retains hover after a tap,
which left cards stuck in their lifted state — and `tailwind.config.ts` sets
`future.hoverOnlyWhenSupported` so the `hover:` utilities are gated too.

### GEO / machine-readable surface

The site is built to be **cited by answer engines** (ChatGPT Search, Perplexity,
Google AI Overviews), not only ranked by search. That surface is:

| File | What it emits |
|---|---|
| `lib/site.ts` | The canonical business facts. Sitemap, robots, llms.txt and every JSON-LD node read from here. |
| `lib/schema.ts` | The JSON-LD `@graph` — one connected entity graph per page. |
| `lib/metadata.ts` | `pageMetadata()` — canonical + OpenGraph + Twitter for every page. |
| `app/sitemap.ts` / `app/robots.ts` | `/sitemap.xml`, `/robots.txt`, rendered to disk by the static export. |
| `app/llms.txt/route.ts` | `/llms.txt` (llmstxt.org) — a curated markdown map of the site. |
| `data/faqs.ts` + `components/FAQ.tsx` | The home-page FAQ, which is also the `FAQPage` node. |

**Never invent a fact into structured data.** Answer engines repeat JSON-LD as
fact, so a fabricated `streetAddress`, `telephone`, `aggregateRating` or
headcount is publishing a false record, not filling a field. The site publishes
no street address or phone, so `lib/site.ts` omits them — and the rule is
written at the top of that file. `lib/schema.ts` deliberately does **not** mint
an Organization node for named case-study clients either.

Three traps, each of which has already cost a debugging session:

- **Next metadata does NOT deep-merge.** A page setting its own `openGraph`
  *replaces* the layout's entire `openGraph` object. Every page here set an
  openGraph title, which silently dropped the site-wide `images` — so `og:image`
  was missing everywhere while `og:twitter` survived (no page overrode
  `twitter`). This is why every page goes through `pageMetadata()` instead of
  hand-writing the object. Do not set `alternates.canonical` in `layout.tsx`
  either: children inherit it, and every page would declare the home page as
  its canonical.
- **The FAQ answers must stay in the DOM when collapsed.** They are the page's
  `FAQPage` structured data, and structured data whose text is not findable on
  the page gets discounted. `components/FAQ.tsx` collapses with
  `grid-template-rows: 0fr` rather than unmounting. A `motion.div` animating
  `height: 'auto'` was tried first and is **broken here** — it renders correctly
  on the server then never updates on the client (the chevron beside it springs
  normally while the panel's inline style stays frozen at the SSR value).
- **`article.date` is a display string** ("Dec 15, 2024"), not ISO 8601. Pass it
  through `toIsoDate()` before it reaches `publishedTime` or `datePublished`.

**Run `pnpm build && pnpm validate:geo` after touching any of this.**
`apps/web/scripts/validate-geo.mjs` parses every exported page and asserts:
exactly one JSON-LD block per indexable page, one distinct Organization `@id`
site-wide, no dangling `@id` references, a canonical present and matching
`og:url`, an absolute `og:image` on every page, and no fabricated properties on
the Organization node. It caught the missing `og:image` and a nested-`@id`
reference that would otherwise have shipped.

### Key Libraries

- **motion** (Framer Motion successor) — All page/component animations
- **next-themes** — light / dark / system, writing to `data-theme`
- **Radix UI** — Accessible component primitives (via shadcn/ui)
- **react-hook-form + zod** — Available for form handling, currently unused.
  `/contact` has no enquiry form: the one that lived there posted nowhere
  (`onSubmit` was `preventDefault()` + `setSubmitted(true)`) and the page now
  starts the BA bot instead, via `openBaBot()` in `components/BaBot/open.ts`.
  The only remaining form is the bot's own `ContactForm`, plain controlled state.
- **lucide-react** — Icons

### Shared components

`Button` (the only control primitive), `GlassCard`, `GradientMesh`, `PageHero`,
`Segmented`, `ScrollReveal` (+ `staggerParent`/`staggerChild`), `ThemeToggle`,
`ThemeProvider`, `GlassFilters`, `Logo`, `Navbar`, `Footer`.

Long-form article and case-study bodies use `.prose-apple`. Note `@tailwindcss/typography`
is **not** installed — `prose`/`prose-invert` classes do nothing here.

**Specificity trap:** form rules in `globals.css` are element-qualified
(`textarea.field { min-height: 120px }`, specificity 0,1,1), so a Tailwind utility like
`min-h-[44px]` or `resize-none` (0,1,0) silently loses to them. Override with another
element-qualified class (`textarea.field-chat`), not a utility.

### BA bot widget

`components/BaBot/` is a floating requirements-elicitation assistant, mounted **once in
`app/layout.tsx`** so the interview survives client-side navigation between routes.

- **The browser never calls the Worker directly.** `apps/web/public/_worker.js` is a
  Cloudflare Pages *Advanced Mode* proxy: it serves `/api/*` on the site's own origin
  and forwards to the bot Worker at the edge. Same-origin means no CORS, no preflight,
  and no `api.claw-forge.net` anywhere in the client bundle (verified against
  `out/_next/`). `public/_routes.json` restricts invocation to `/api/*` — without it,
  Advanced Mode routes *every* request through the Worker, turning each static CDN hit
  into an invocation.
  - It lives in `public/` because the static export copies that verbatim into `out/`,
    and `_worker.js` is read from *inside* the uploaded directory. A `functions/`
    directory would not work: `wrangler pages deploy` has no `--functions` flag and
    resolves it against the CWD, which in CI is the repo root.
  - `NEXT_PUBLIC_BA_BOT_URL` is therefore **empty in `.env.production`** — empty means
    same-origin. It stays set in `.env.development` because `pnpm dev` has no Pages
    Function, so `/api/chat` on :3000 is just a 404.
  - Because empty is now the correct production value, the old
    `if (!BOT_API) return null` guard had to go: it would have read the empty string as
    "unconfigured" and hidden the widget on the live site.
- `useBaBot.ts` owns conversation state and persists it to `sessionStorage`
  (single-sitting semantics — a half-finished interview should not resurface days later).
- The panel is the translucent layer; message bubbles are deliberately **opaque**, since
  stacking two glass surfaces double-blurs both.
- When the graph reaches `CONTACT` the composer is swapped for `ContactForm`, which
  requires an explicit `consent: true` and a Turnstile token — the API rejects anything
  less.

### Known gaps

**There is no working lint.** Next 16 removed the `next lint` subcommand, so the
`"lint": "next lint"` script fails with `Invalid project directory provided, no such
directory: .../lint` — `next` parses `lint` as a positional path. Next 16 also dropped
ESLint-during-build, so `pnpm build` now runs **TypeScript only**. `eslint@9` and
`eslint-config-next@16` are installed but unused; restoring lint means adding a flat
`eslint.config.mjs` and repointing the script at `eslint .`. Until then, type errors are
the only automated check.

**React is pinned to 18.3.1** even though Next 16 supports React 19. Don't bump it
casually — the Radix/vaul/cmdk stack here has not been validated against 19.

**Root `package.json` has a `pnpm.overrides` block** pinning transitive deps (lodash,
nanoid, postcss, picomatch, minimatch, brace-expansion, flatted) to close security
advisories. Adding or upgrading dependencies can silently reintroduce a flagged version —
re-check the overrides rather than deleting entries that look redundant.

**Both of this section's former BA-bot gaps are now closed** — verified 2026-08-19,
so don't re-fix them:

1. **Rate limiting is enforced.** `api/chat.ts` and `api/generate.ts` both import
   `guards/ratelimit`; chat checks `turnsToday` against `MAX_TURNS_PER_IP_PER_DAY`
   and answers `429 rate_limited` before spending any DeepSeek tokens.
2. **`estimator/` and `pricing/` exist; `mail/` was removed on purpose.** The
   `GENERATE` state's prompt still says *"this topic is handled by another system"* —
   that is correct by design. The state is deliberately not an LLM turn;
   `estimator/estimate.ts` and `pricing/quote.ts` are that other system. Email
   delivery was decommissioned in favour of an HMAC-signed download link
   (`util/sign.ts` → `/q/`), so there is no `mail/` to look for.

**Assistant history must be replayed to the model as the JSON envelope, never as
prose.** `llm/history.ts` exists solely for this, and it is the single most breakable
invariant in the bot. `messages.content` stores the visitor-facing `reply` string
(that is what the widget and the dashboard render), but the model is called with
`response_format: json_object`. Replaying bare `reply` text put the model in a
contradiction — the grammar requires the next token to open an object, while every one
of its own prior turns in the context was prose — and with reasoning off it answered
with whitespace and `finish_reason: 'stop'`, well under the token ceiling. Measured on
PROJECT_IDENTITY, and dose-dependent in the number of prose assistant turns: 0 turns
0/8 blank, one turn 3/8, two turns 13/16. Same history replayed as envelopes: 0/10.

Consequences worth knowing before touching any of it:

- **`ready_to_advance` is stored** (migration `0004`) because it is one of the envelope's
  four keys and `transitions.step()` advances only when `exitGate(slots) && readyToAdvance`.
  Replaying a hardcoded `false` would be in-context precedent for the model to
  under-report it — the exact stall this fixed.
- **Reasoning is off by default** in `llm/turn.ts`. It was never doing useful work here;
  it was giving the model room to reconcile the format contradiction. With the history
  consistent, a full 7-turn interview measured **9.2s / 600 completion tokens** against
  **78.1s / 9012** with reasoning on — roughly 8x faster and 15x cheaper, same zero
  apologies.
**The estimator had the same ceiling bug, and it silently killed the quote
feature.** `estimator/estimate.ts` calls `LLM_MODEL_HEAVY` (`deepseek-v4-pro`, also a
reasoning model) and capped it at 1600 — which truncated **5 of 5** real estimates at
exactly 1600 with `finish_reason: 'length'`. Since `truncated` returned immediately,
no `quotes` row was ever written, so `quoteUrl` was always null and every visitor got
the "we will follow up by email" headline instead of their indicative quote. The
`/q/` page, `GET /api/quote/:id`, the signed link and the widget's link button were
all already built and correct — nothing reached them. Ceilings are now per pass,
because the two passes differ ~3x in output size:

| pass | ceiling | observed completion tokens | result |
|---|---|---|---|
| single | 8000 | 2429–4618 | 5/5 ok |
| program | 8000 | 7358–8000+ | **4/5 truncated** |
| program | 16000 | 6083–11481 | 5/5 ok |

A truncated *program* pass is the quiet one: `runEstimate` falls back to the oversized
single estimate, so a quote still appears and only the better phased artifact goes
missing. Reasoning stays ON here deliberately — it is the one genuinely analytical
call, and its repair path adds an assistant turn, which is exactly the context shape
that makes `thinking: disabled` return whitespace.

- **The 8000-token ceiling in `llm/turn.ts` is now slack, not a constraint** — turns
  finish in the low hundreds. Keep it: it costs nothing on turns that finish early and
  it covers the case where someone turns reasoning back on. Do not read it as evidence
  that budget was ever the problem; raising it 4000 → 32000 did not move the blank rate
  at all, because the failures came back `finish_reason: 'stop'`.
- The retry loop in `llm/turn.ts` is now defence in depth rather than the mitigation.
  If blanks ever return, suspect something reintroducing prose into the replayed
  history before suspecting the provider.

### Import Alias

`@/*` maps to `apps/web/` (e.g., `@/components/Navbar`, `@/data/projects`). The Worker
does not use it.

## Deployment

Pushes to `main` trigger a GitHub Actions workflow (`.github/workflows/deploy-cloudflare.yml`) that runs `pnpm build` and deploys **`apps/web/out`** to Cloudflare Pages. Secrets required: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_PROJECT_NAME`.

It calls `wrangler` directly rather than through `cloudflare/wrangler-action@v3`.
The action is not workspace-aware: it probes `pnpm exec wrangler` at the repo
root, where pnpm does not link a workspace package's binary, then tries to
recover with `pnpm add wrangler@3.90.0` — which pnpm refuses in a workspace root
without `-w`. Both failures arrived the moment the monorepo layout reached
`main`. The workflow now runs the wrangler pinned in `apps/ba-bot-api`, so CI
and `pnpm bot:deploy` ship the same version; because `pnpm --filter … exec` runs
in that package's directory, the output path must be absolute.

The Worker is **not** deployed by CI — it ships manually via `pnpm bot:deploy` (or
`wrangler deploy`), with secrets pushed from 1Password by
`apps/ba-bot-api/scripts/sync-secrets.sh`. See `apps/ba-bot-api/SETUP.md`, which also
explains why `api.unodigit.com.au` is not usable as the API hostname.

CI pins **Node 24** and **pnpm 10**, and installs with `--frozen-lockfile`. The
three actions are on their node24 runtimes (`checkout@v7`, `setup-node@v7`,
`pnpm/action-setup@v6`) — GitHub force-migrated node20 actions and warned on
every run until this bump. Two ordering rules in that workflow are load-bearing:
`pnpm/action-setup` must run **before** `setup-node`, because `cache: pnpm`
shells out to pnpm to find the store; and `cache: pnpm` stays **explicit**,
because `setup-node@v5` began caching automatically when `package.json` has a
`packageManager` field (this repo's root does) and `v6` then narrowed that to
npm only. Naming it pins the behaviour regardless. Any
`package.json` edit must be committed together with a regenerated `pnpm-lock.yaml` or the
deploy fails at install — this has already required a dedicated fix-up commit.

`CLOUDFLARE_API_TOKEN` must hold an unrestricted Pages-deploy token. An IP-locked token
fails on GitHub runners with a misleading generic `code 10000` authentication error
rather than anything mentioning IP restrictions.

## Adding Content

To add a new project or article, add an entry to `apps/web/data/projects.tsx` or `apps/web/data/articles.tsx`. The `slug` field must be unique — it becomes the URL path. Dynamic routes will automatically pick it up via `generateStaticParams()`.
