# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Uno Digit is a marketing/portfolio website for an AI consultancy based in Sydney. Built with Next.js 14 (App Router) using static site generation (SSG), deployed to Cloudflare Pages.

## Commands

- **Dev server:** `pnpm dev`
- **Build:** `pnpm build` (outputs static files to `/out`)
- **Lint:** `pnpm lint`
- **No test framework is configured.**

Package manager is **pnpm**.

## Architecture

### Static Export

The site is configured for full static export (`output: 'export'` in `next.config.js`). All pages are pre-rendered at build time. There are no API routes, no server-side rendering, and no database. Image optimization is disabled (`unoptimized: true`) to support static export.

### Server/Client Component Split

Every route follows a consistent pattern:
- **`page.tsx`** — Server component that defines `Metadata` (for SEO) and renders the client component
- **`*Client.tsx`** — Client component (`'use client'`) containing all interactive UI and animations

Example: `app/work/page.tsx` exports metadata and renders `<WorkClient />`.

Dynamic routes (`app/work/[slug]/`, `app/insights/[slug]/`) use `generateStaticParams()` to pre-render all slugs from data files at build time.

### Directory Layout

- `app/` — Next.js App Router pages (home, about, services, work, insights, contact)
- `components/` — Shared components (see "Shared components" below)
- `data/` — Static content as TypeScript objects with `React.ReactNode` content fields (`projects.tsx`, `articles.tsx`)
- `lib/utils.ts` — `cn()` helper (clsx + tailwind-merge)
- `public/` — Static assets (favicon.svg, logo.png)

### Styling — Apple design token layer

`app/globals.css` is the **single source of truth** for design values. Never hardcode a
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

`--label-secondary` is deliberately **0.73** alpha, not Apple's shipping 0.60 — Apple's
value measures 3.44:1 and fails WCAG AA. `--label-tertiary` is decorative-only (list
markers, scrollbar); never put readable copy on it.

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

### Known gap

`pnpm lint` prompts for interactive ESLint setup because the repo has no `.eslintrc`.
Type checking and Next's built-in lint still run as part of `pnpm build`.

### Import Alias

`@/*` maps to the project root (e.g., `@/components/Navbar`, `@/data/projects`).

## Deployment

Pushes to `main` trigger a GitHub Actions workflow (`.github/workflows/deploy-cloudflare.yml`) that builds the site and deploys the `/out` directory to Cloudflare Pages using `cloudflare/wrangler-action@v3`. Secrets required: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_PROJECT_NAME`.

## Adding Content

To add a new project or article, add an entry to `data/projects.tsx` or `data/articles.tsx`. The `slug` field must be unique — it becomes the URL path. Dynamic routes will automatically pick it up via `generateStaticParams()`.
