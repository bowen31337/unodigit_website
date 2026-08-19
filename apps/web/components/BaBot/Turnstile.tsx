'use client';

import { useEffect, useRef } from 'react';

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

const SCRIPT_ID = 'cf-turnstile';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string | undefined;
      remove: (widgetId: string) => void;
    };
  }
}

/** Loaded once per document and shared. The script is only injected when a
 * contact form actually mounts — a visitor who never finishes the interview
 * never pays for Cloudflare's challenge bundle. */
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.id = SCRIPT_ID;
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      // Let a later mount retry instead of caching the failure forever.
      scriptPromise = null;
      reject(new Error('turnstile script failed'));
    };
    document.head.appendChild(s);
  });

  return scriptPromise;
}

interface TurnstileProps {
  /** Fires with a fresh token, or null when one expires and must be re-earned. */
  onToken: (token: string | null) => void;
}

/**
 * Explicit-render Turnstile. Explicit rather than the implicit `.cf-turnstile`
 * class because the form mounts inside an AnimatePresence subtree — implicit
 * mode only scans the DOM once at script load and would never see it.
 */
export default function Turnstile({ onToken }: TurnstileProps) {
  const holder = useRef<HTMLDivElement>(null);

  // onToken lives in a ref so a re-render with a new closure does not tear down
  // and re-render the challenge (which would drop a token the visitor earned).
  const cb = useRef(onToken);
  cb.current = onToken;

  useEffect(() => {
    let widgetId: string | undefined;
    let cancelled = false;

    loadScript()
      .then(() => {
        if (cancelled || !holder.current || !window.turnstile || !TURNSTILE_SITE_KEY) return;
        widgetId = window.turnstile.render(holder.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: 'auto',
          callback: (token: string) => cb.current(token),
          'expired-callback': () => cb.current(null),
          'error-callback': () => cb.current(null),
        });
      })
      .catch(() => cb.current(null));

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, []);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={holder} className="min-h-[65px]" />;
}
