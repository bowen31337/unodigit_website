/**
 * Backend-for-frontend for the BA bot.
 *
 * The browser must never call the bot Worker directly. Everything the widget
 * needs is reached at `/api/*` on the site's own origin, and this proxies it to
 * the Worker. Three things follow:
 *
 *   - No CORS. Same-origin means no preflight, no allowlist to keep in sync,
 *     and no class of failure where a correct request dies because an origin
 *     was missing from a comma-separated string in wrangler.toml.
 *   - The Worker's hostname never reaches the client bundle, so it is not a
 *     documented target. It is still publicly reachable — this is one fewer
 *     signpost, not an access control.
 *   - One domain in the network tab, which is what a visitor's browser
 *     extensions and corporate proxies are least likely to interfere with.
 *
 * WHY `_worker.js` AND NOT `functions/`
 * `wrangler pages deploy` has no `--functions` flag: a `functions/` directory
 * is discovered relative to the *current working directory*, which in CI is
 * the repo root, two levels from where this code belongs. `_worker.js` is read
 * from inside the uploaded directory instead, so it travels with the build and
 * needs no change to the deploy command. It lives in `public/` because Next's
 * static export copies that verbatim into `out/`.
 *
 * `_routes.json` beside this file restricts invocation to `/api/*`. Without it,
 * Advanced Mode routes EVERY request here — every page, every font, every
 * image — turning a static CDN hit into a Worker invocation.
 *
 * Plain JS on purpose: nothing compiles `public/`, so this is what ships.
 */

/**
 * Upstream bot Worker. Not a secret — it is a public endpoint that enforces its
 * own Turnstile and per-IP limits. Hardcoded rather than read from an env var
 * because a Pages environment variable is configured in a dashboard, invisible
 * to review, and a typo there fails at runtime on production only.
 */
const UPSTREAM = 'https://api.claw-forge.net';

/**
 * Headers that must not be forwarded upstream.
 *
 * `host` would make the Worker see the site's hostname instead of its own,
 * which breaks ADMIN_HOSTNAME's reasoning about where a request arrived.
 * `cf-connecting-ip` is set by Cloudflare on the outbound subrequest and
 * cannot be usefully overridden here; forwarding the inbound one invites
 * confusion about which value wins.
 */
const STRIP = new Set(['host', 'cf-connecting-ip', 'content-length']);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Defence in depth. `_routes.json` should mean only /api/* ever arrives,
    // but if that file is lost or malformed the fallback must serve the site
    // rather than proxy the whole marketing site into the bot Worker.
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    const upstream = new URL(url.pathname + url.search, UPSTREAM);

    const headers = new Headers();
    for (const [k, v] of request.headers) {
      if (!STRIP.has(k.toLowerCase())) headers.set(k, v);
    }
    // The upstream allowlist is keyed on Origin. Same-origin browser requests
    // send no Origin on GET, and on POST they send the site's own — neither of
    // which the Worker knows about once it stops being called cross-origin.
    // Stating it explicitly keeps the Worker's CORS config meaningful instead
    // of depending on what a browser chose to omit.
    headers.set('Origin', url.origin);

    const res = await fetch(upstream, {
      method: request.method,
      headers,
      // GET/HEAD must not carry a body; `duplex` is required by the platform
      // for a streamed request body.
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      duplex: 'half',
      redirect: 'manual',
    });

    // Rebuilt rather than returned as-is so the response is mutable and so the
    // upstream's CORS headers — now meaningless, and misleading if a future
    // reader sees them on a same-origin response — do not leak through.
    const out = new Headers(res.headers);
    out.delete('access-control-allow-origin');
    out.delete('access-control-allow-methods');
    out.delete('access-control-allow-headers');
    out.delete('vary');

    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
  },
};
