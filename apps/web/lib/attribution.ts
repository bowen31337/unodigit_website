/**
 * Campaign attribution, captured at landing and kept for the session.
 *
 * It used to be read at SUBMIT time, straight off `window.location.search`.
 * That silently lost every campaign where the visitor browsed before
 * finishing: Next.js client-side navigation does not carry the query string,
 * so landing on `/?utm_source=linkedin` and clicking "Work" leaves you on
 * `/work/` with an empty search — measured, not assumed. The BA bot widget is
 * mounted in `app/layout.tsx` precisely so an interview survives navigation,
 * which makes "landed tagged, wandered, then converted" a normal path rather
 * than an edge case. Every one of those leads recorded Source: direct.
 *
 * So attribution is now captured on load and read back at submit.
 *
 * `document.referrer` is only meaningful on the first page load — after a
 * client-side navigation it reports the previous in-site page, or nothing — so
 * it is recorded with the first capture and never overwritten by a later one.
 *
 * Last-non-direct wins: a later load carrying UTM tags replaces an earlier
 * untagged one, because clicking a fresh campaign link is a new touch and the
 * operator expects the campaign to get the credit. An untagged load never
 * overwrites a tagged one.
 *
 * sessionStorage, matching useBaBot: attribution should live exactly as long
 * as the interview it belongs to, and a campaign from last week should not be
 * credited with today's conversion.
 */

const KEY = 'ba-bot:attribution:v1';

export interface Attribution {
  utm?: { source?: string; medium?: string; campaign?: string };
  referrer?: string;
  landingPage?: string;
}

function readStored(): Attribution | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Attribution) : null;
  } catch {
    // Private browsing, or a storage quota error. Attribution is a
    // nice-to-have; never let it break the form.
    return null;
  }
}

/** Call on every page load. Cheap, idempotent, and safe to run repeatedly. */
export function captureAttribution(): void {
  if (typeof window === 'undefined') return;

  try {
    const p = new URLSearchParams(window.location.search);
    const utm = {
      source: p.get('utm_source') ?? undefined,
      medium: p.get('utm_medium') ?? undefined,
      campaign: p.get('utm_campaign') ?? undefined,
    };
    const tagged = Boolean(utm.source || utm.medium || utm.campaign);
    const stored = readStored();

    // An untagged load must not erase a campaign captured earlier in the
    // session — that is exactly the navigation case this module exists for.
    if (stored && !tagged) return;

    sessionStorage.setItem(
      KEY,
      JSON.stringify({
        utm: tagged ? utm : stored?.utm,
        // First capture wins: after a client-side navigation document.referrer
        // is the previous in-site page, which is not where the visitor came
        // from.
        referrer: stored?.referrer ?? (document.referrer ? document.referrer.slice(0, 500) : undefined),
        landingPage: stored?.landingPage ?? window.location.href.slice(0, 500),
      } satisfies Attribution),
    );
  } catch {
    /* storage unavailable — see readStored */
  }
}

/** Read at submit time. Falls back to reading the URL directly so a visitor
 *  who lands tagged and converts immediately is still attributed even if
 *  storage is unavailable. */
export function readAttribution(): Attribution {
  if (typeof window === 'undefined') return {};

  const stored = readStored();
  if (stored) return stored;

  const p = new URLSearchParams(window.location.search);
  const utm = {
    source: p.get('utm_source') ?? undefined,
    medium: p.get('utm_medium') ?? undefined,
    campaign: p.get('utm_campaign') ?? undefined,
  };
  const tagged = Boolean(utm.source || utm.medium || utm.campaign);
  return {
    utm: tagged ? utm : undefined,
    referrer: document.referrer ? document.referrer.slice(0, 500) : undefined,
    landingPage: window.location.href.slice(0, 500),
  };
}
