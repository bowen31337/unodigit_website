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

### Key Libraries

- **motion** (Framer Motion successor) — All page/component animations
- **next-themes** — light / dark / system, writing to `data-theme`
- **Radix UI** — Accessible component primitives (via shadcn/ui)
- **react-hook-form + zod** — Available for form handling (the contact form is
  currently plain controlled state)
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

**LLM token ceilings must cover reasoning tokens.** `deepseek-v4-flash` is a reasoning
model: a measured turn used 487 completion tokens of which 356 were *reasoning* and only
~131 were visible output. The original 900-token cap in `llm/turn.ts` truncated nearly
every real turn into `finish_reason: 'length'`, which the code discards as `'truncated'`
with no retry — so the visitor saw the fallback apology every time. It is now 4000.

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

CI pins **Node 22** and **pnpm 10**, and installs with `--frozen-lockfile`. Any
`package.json` edit must be committed together with a regenerated `pnpm-lock.yaml` or the
deploy fails at install — this has already required a dedicated fix-up commit.

`CLOUDFLARE_API_TOKEN` must hold an unrestricted Pages-deploy token. An IP-locked token
fails on GitHub runners with a misleading generic `code 10000` authentication error
rather than anything mentioning IP restrictions.

## Adding Content

To add a new project or article, add an entry to `apps/web/data/projects.tsx` or `apps/web/data/articles.tsx`. The `slug` field must be unique — it becomes the URL path. Dynamic routes will automatically pick it up via `generateStaticParams()`.
