/**
 * Origin for the BA bot API, baked in at build time (the site is a static
 * export, so there is no runtime config).
 *
 * **An empty string is the correct production value, not a missing one.**
 * `public/_worker.js` is a Cloudflare Pages Advanced Mode proxy that serves
 * `/api/*` on the site's own origin and forwards to the Worker at the edge, so
 * production is same-origin and `.env.production` sets this to empty
 * deliberately. `.env.development` keeps a real origin because `pnpm dev` has
 * no Pages Function.
 *
 * That makes `!BOT_API` a bug, not a guard — empty is falsy, so any
 * "unconfigured" check reads the correct production value as broken. It has
 * happened twice:
 *
 *  1. `BaBot.tsx` had `if (!BOT_API) return null`, which hid the whole widget
 *     on the live site.
 *  2. `app/q/QuoteClient.tsx` had `if (!id || !sig || !BOT_API)`, which showed
 *     "This link is not valid" for every quote link ever issued — invisibly,
 *     because a separate estimator bug meant no link was ever generated to
 *     test it with.
 *
 * This module exists so there is ONE definition to reason about. Import it;
 * do not re-derive it from `process.env`, and do not test it for truthiness.
 */
export const BOT_API = process.env.NEXT_PUBLIC_BA_BOT_URL ?? '';
