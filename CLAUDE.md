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
- `components/` — Shared components (Navbar, Footer, GlassCard, ParticleBackground, ScrollReveal, MagneticButton)
- `data/` — Static content as TypeScript objects with `React.ReactNode` content fields (`projects.tsx`, `articles.tsx`)
- `lib/utils.ts` — `cn()` helper (clsx + tailwind-merge)
- `public/` — Static assets (favicon.svg, logo.png)

### Styling

- Tailwind CSS with a custom dark theme (background `#020617`, primary cyan `#06b6d4`, secondary purple `#8b5cf6`)
- Glass morphism design language throughout (backdrop-blur, transparency)
- Custom animations defined in `tailwind.config.ts` (float, glow, pulse-slow)
- shadcn/ui configured with "new-york" style, no CSS variables, zinc base color

### Key Libraries

- **motion** (Framer Motion successor) — All page/component animations
- **@react-three/fiber + drei** — 3D graphics (Three.js)
- **Radix UI** — Accessible component primitives (via shadcn/ui)
- **react-hook-form + zod** — Form handling and validation
- **lucide-react** — Icons

### Import Alias

`@/*` maps to the project root (e.g., `@/components/Navbar`, `@/data/projects`).

## Deployment

Pushes to `main` trigger a GitHub Actions workflow (`.github/workflows/deploy-cloudflare.yml`) that builds the site and deploys the `/out` directory to Cloudflare Pages using `cloudflare/wrangler-action@v3`. Secrets required: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_PROJECT_NAME`.

## Adding Content

To add a new project or article, add an entry to `data/projects.tsx` or `data/articles.tsx`. The `slug` field must be unique — it becomes the URL path. Dynamic routes will automatically pick it up via `generateStaticParams()`.
