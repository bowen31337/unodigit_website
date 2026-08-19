'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ChatResponse,
  ContactRequest,
  ContactResponse,
  GenerateResponse,
  StateId,
} from '@unodigit/ba-bot-contract';

/**
 * Prefix for every bot call.
 *
 * **Empty string is the production value and means same-origin.**
 * `public/_worker.js` proxies `/api/*` to the bot Worker from the edge, so the
 * browser only ever talks to the site's own hostname: no CORS, no preflight,
 * and the Worker's address never reaches the client bundle.
 *
 * The variable survives as the escape hatch for `pnpm dev`, where there is no
 * Pages Function to do the proxying and `/api/chat` on :3000 is simply a 404 —
 * so .env.development still points at an absolute origin.
 *
 * Baked in at build time: the site is a static export and has no runtime
 * config. It no longer gates whether the widget renders — the proxy ships in
 * the same deployment as the page, so there is no longer a configuration under
 * which the endpoint is absent.
 */
export const BOT_API = process.env.NEXT_PUBLIC_BA_BOT_URL ?? '';

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

/** Shown before the first request so the panel is never empty on open. It is
 * client-side only and deliberately NOT sent to the API: the Worker builds its
 * own history from D1, and posting a fake assistant turn would corrupt it. */
export const OPENING_LINE =
  "Hi, I'm Mary from Uno Digit. Tell me what you're looking to build and I'll scope it out with you.";

/** Survives a hard reload. sessionStorage, not localStorage: an interview is a
 * single sitting, and a half-finished one resurfacing days later is confusing. */
const STORAGE_KEY = 'ba-bot:v1';

interface Persisted {
  conversationId: string | null;
  messages: Turn[];
  state: StateId;
  finished: boolean;
  /** POST /api/generate's chat-visible line — set once the interview's brief
   *  (and, usually, its quote) exist. Distinct from `error`: this is never a
   *  failure state, just the sentence the visitor sees once contact details
   *  are captured. */
  headline: string | null;
  /** The signed, downloadable link to the hosted quote (US-011). Null
   *  whenever there is no quote to link to — rate-limited, the estimator
   *  failed, or the link itself could not be built — and the widget must
   *  never render a link in any of those cases. */
  quoteUrl: string | null;
}

const EMPTY: Persisted = {
  conversationId: null,
  messages: [],
  state: 'GREETING',
  finished: false,
  headline: null,
  quoteUrl: null,
};

/** The Worker answers every failure with `{ error: <code> }`. Anything a visitor
 * can act on gets a specific line; the rest collapse to one honest fallback
 * rather than leaking a status code into the UI. */
const ERRORS: Record<string, string> = {
  not_configured: 'The assistant is offline right now. Please use the contact form instead.',
  challenge_failed: 'That verification did not go through. Please try once more.',
  invalid_body: 'That message could not be sent — try rephrasing it.',
  wrong_state: 'We are out of step. Starting a fresh conversation is the quickest fix.',
  not_found: 'This conversation expired. Starting a new one.',
  // The chat endpoint challenges the FIRST message only. Both of these were
  // missing from this map, so the one failure a visitor could actually act on
  // arrived as the generic apology — which is why the outage read as "the bot
  // is flaky" rather than "the browser check has not finished".
  turnstile_required: 'Still running a quick browser check — try that again in a moment.',
  turnstile_failed: 'That browser check did not pass. Try sending it once more.',
  rate_limited: 'That is a lot of questions for one day. Please email info@unodigit.com.au.',
};

/** Codes that mean the challenge must be re-earned before another attempt. A
 *  Turnstile token is single-use, so a retry with the same one always fails. */
export const TURNSTILE_ERRORS = new Set(['turnstile_required', 'turnstile_failed']);

const GENERIC_ERROR = 'Something went wrong reaching the assistant. Please try again.';

function load(): Persisted {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Persisted) } : EMPTY;
  } catch {
    // Corrupt or unavailable storage must never take the widget down with it.
    return EMPTY;
  }
}

export function useBaBot() {
  const [{ conversationId, messages, state, finished, headline, quoteUrl }, setData] =
    useState<Persisted>(EMPTY);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The raw code behind `error`. The widget needs it to tell a spent
   *  challenge (re-earn one, then the retry can work) from every other
   *  failure, which the human-readable string cannot express. */
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  /**
   * POST /api/generate. Called once contact details are captured (US-011),
   * either right after `submitContact` succeeds or, on reload, as a retry for
   * a session that reached GENERATE but never got an answer (see the hydrate
   * effect below). The call is idempotent server-side — a second request for
   * the same conversation returns the same brief/quote rather than minting a
   * new one — so re-running it here on a retry is always safe.
   *
   * A failure here is deliberately silent: `submitContact` has already told
   * the visitor "thanks", so surfacing this as an error banner would
   * contradict a message already on screen. The headline/link simply stay
   * unset — the widget falls back to its static copy.
   */
  const generate = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`${BOT_API}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: convId }),
      });

      const body = (await res.json().catch(() => null)) as GenerateResponse | { error: string } | null;
      if (!res.ok || !body || 'error' in body) return;

      setData((d) => ({ ...d, state: body.state, headline: body.headline, quoteUrl: body.quoteUrl }));
    } catch {
      /* network failure — silent, see comment above */
    }
  }, []);

  // Read storage in an effect, never during render: the server renders the
  // empty state, so touching sessionStorage inline would be a hydration mismatch.
  useEffect(() => {
    const loaded = load();
    setData(loaded);
    setHydrated(true);

    // A reload that lands mid-GENERATE — contact succeeded, but the tab
    // closed or the network dropped before the generate call resolved — must
    // not strand the visitor without their quote link. It is their only copy
    // of it, so retry once on hydrate rather than leaving headline/quoteUrl
    // null forever.
    if (
      loaded.finished &&
      loaded.state === 'GENERATE' &&
      loaded.conversationId &&
      !loaded.headline &&
      !loaded.quoteUrl
    ) {
      void generate(loaded.conversationId);
    }
  }, [generate]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ conversationId, messages, state, finished, headline, quoteUrl }),
      );
    } catch {
      /* private mode / quota — the conversation still works, it just won't survive a reload */
    }
  }, [hydrated, conversationId, messages, state, finished, headline, quoteUrl]);

  // A turn takes seconds. If the visitor closes the tab mid-flight we abort
  // rather than calling setState on an unmounted tree.
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const reset = useCallback(() => {
    abort.current?.abort();
    setData(EMPTY);
    setError(null);
    setErrorCode(null);
    setPending(false);
  }, []);

  const send = useCallback(
    /**
     * `turnstileToken` is required by the Worker on the FIRST message of a
     * conversation and ignored afterwards (chat.ts gates on
     * `session.totalTurns === 0`). It was never sent at all, so every visitor's
     * opening message answered 403 and the interview could not start.
     */
    async (text: string, turnstileToken?: string | null) => {
      const message = text.trim();
      if (!message || pending || finished) return;

      setError(null);
      setErrorCode(null);
      setPending(true);
      // Optimistic: the visitor's own words appear instantly. The Worker
      // persists them before it calls the model, so this matches the server.
      setData((d) => ({ ...d, messages: [...d.messages, { role: 'user', content: message }] }));

      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;

      try {
        const res = await fetch(`${BOT_API}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: conversationId ?? undefined,
            message,
            // Omitted rather than sent as null once the challenge is spent:
            // the contract types this optional, and a null would have to be
            // allowed through the schema just to be ignored.
            ...(turnstileToken ? { turnstileToken } : {}),
          }),
          signal: controller.signal,
        });

        const body = (await res.json().catch(() => null)) as ChatResponse | { error: string } | null;

        if (!res.ok || !body || 'error' in body) {
          const code = body && 'error' in body ? body.error : '';
          // A dropped conversation is unrecoverable — clear the stale id so the
          // next message opens a fresh one instead of 404ing forever.
          if (code === 'not_found') setData((d) => ({ ...d, conversationId: null }));
          setError(ERRORS[code] ?? GENERIC_ERROR);
          setErrorCode(code);
          return;
        }

        setData((d) => ({
          ...d,
          conversationId: body.conversationId,
          messages: [...d.messages, { role: 'assistant', content: body.reply }],
          state: body.state,
          finished: body.finished,
        }));
      } catch (e) {
        if ((e as Error)?.name !== 'AbortError') setError(GENERIC_ERROR);
      } finally {
        // The abort path already unmounted or superseded this turn.
        if (!controller.signal.aborted) setPending(false);
      }
    },
    [conversationId, finished, pending],
  );

  const submitContact = useCallback(
    async (input: Omit<ContactRequest, 'conversationId'>): Promise<boolean> => {
      if (!conversationId) return false;

      setError(null);
      setPending(true);
      try {
        const res = await fetch(`${BOT_API}/api/contact`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...input, conversationId }),
        });

        const body = (await res.json().catch(() => null)) as
          | ContactResponse
          | { error: string }
          | null;

        if (!res.ok || !body || 'error' in body) {
          setError(ERRORS[(body && 'error' in body && body.error) || ''] ?? GENERIC_ERROR);
          return false;
        }

        // The API is the only thing that can move the graph past CONTACT, so
        // the state it returns is authoritative — never advance optimistically.
        setData((d) => ({ ...d, state: body.state, finished: true }));
        // Fire the generate call now that a lead exists — this is the ONLY
        // trigger for it on a fresh interview. It runs in the background: the
        // visitor's "thanks" is already on screen from `finished`, and the
        // headline/link render themselves in once this resolves.
        void generate(conversationId);
        return true;
      } catch {
        setError(GENERIC_ERROR);
        return false;
      } finally {
        setPending(false);
      }
    },
    [conversationId, generate],
  );

  return {
    messages,
    state,
    finished,
    pending,
    error,
    errorCode,
    hydrated,
    conversationId,
    headline,
    quoteUrl,
    send,
    submitContact,
    reset,
  };
}
