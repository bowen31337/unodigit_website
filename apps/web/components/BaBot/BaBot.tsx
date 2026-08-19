'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { MessageSquareText, X, RotateCcw, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BOT_API, OPENING_LINE, useBaBot } from './useBaBot';
import ContactForm from './ContactForm';

/** Apple's sheet spring (damping 0.8 / response 0.3). Panels are grabbed and
 * dismissed, so they get a touch of bounce; the launcher does not. */
const SHEET_SPRING = { type: 'spring', bounce: 0.2, visualDuration: 0.3 } as const;

/**
 * Floating requirements-elicitation assistant, mounted once in the root layout
 * so it persists across client-side navigation — a visitor can browse from
 * /services to /work mid-interview without losing the conversation.
 *
 * Renders nothing when NEXT_PUBLIC_BA_BOT_URL is absent. The site is a static
 * export, so that variable is baked at build time: a build without it should
 * ship no launcher at all rather than one that opens onto a dead endpoint.
 */
export default function BaBot() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState('');
  const reduceMotion = useReducedMotion();
  const bot = useBaBot();

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const onContact = bot.state === 'CONTACT' && !bot.finished;
  const done = bot.finished && bot.state !== 'CONTACT';

  // Publish the *visual* viewport to CSS so globals.css can size the panel off
  // it. `dvh` already follows the mobile URL bar, but it does not know about
  // the on-screen keyboard — only visualViewport does, and without this a
  // focused composer on iOS sits underneath it. Kept mounted rather than gated
  // on `open` so the panel's first painted frame is already the right height.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return; // The `100dvh` fallbacks in globals.css cover this.

    const root = document.documentElement;
    const write = () => {
      root.style.setProperty('--babot-vh', `${vv.height}px`);
      // How far the visual viewport's bottom edge sits above the layout
      // viewport's. A pinch-zoom or a scrollbar can make this a few stray
      // pixels; only a keyboard-sized lift is worth reacting to.
      const lift = window.innerHeight - vv.height - vv.offsetTop;
      root.style.setProperty('--babot-kb', lift > 40 ? `${Math.round(lift)}px` : '0px');
    };

    // The first write is synchronous on purpose. visualViewport `scroll` fires
    // continuously during a pinch, so the *handler* is frame-throttled — but a
    // background tab runs no frames, and deferring the initial write there
    // would leave the var unset until the tab is next touched.
    write();
    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(write);
    };

    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      root.style.removeProperty('--babot-vh');
      root.style.removeProperty('--babot-kb');
    };
  }, []);

  // Escape steps back one level — maximised → docked → closed — rather than
  // discarding the conversation from full screen in one keystroke. The panel is
  // non-modal (the page stays usable behind it), so there is no focus trap.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (expanded) setExpanded(false);
      else setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, expanded]);

  useEffect(() => {
    if (open && !onContact && !done) inputRef.current?.focus();
  }, [open, onContact, done]);

  // Pin to the newest turn. `behavior: smooth` is skipped under reduced motion.
  // Re-runs on `expanded` too: resizing the panel changes how much of the
  // transcript fits, which would otherwise leave the last turn off-screen.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [bot.messages, bot.pending, onContact, expanded, reduceMotion]);

  if (!BOT_API) return null;

  function submit() {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    void bot.send(text);
  }

  return (
    <>
      {/* Launcher. Hidden while the panel is open so the two never overlap on
          a phone, where the panel occupies the full width. */}
      <AnimatePresence>
        {!open && (
          <motion.button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Scope your project with our assistant"
            className="btn btn-filled fixed bottom-s7 right-s7 z-[60] shadow-lg print:hidden"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
            transition={SHEET_SPRING}
          >
            <MessageSquareText size={18} aria-hidden />
            <span className="hidden sm:inline">Scope your project</span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Project scoping assistant"
            // Geometry — phone sheet, desktop dock, and the maximised variant
            // of each — is `.babot-panel` in globals.css, because all of it is
            // viewport arithmetic against --babot-vh.
            data-expanded={expanded}
            className="babot-panel glass-thick print:hidden"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
            transition={SHEET_SPRING}
          >
            <header
              className="flex items-center justify-between gap-s4 px-s5 py-s4"
              style={{ borderBottom: '1px solid var(--separator)' }}
            >
              <div className="min-w-0">
                <p className="type-headline truncate">Scope your project</p>
                <p className="type-caption truncate" style={{ color: 'var(--label-secondary)' }}>
                  A few questions, then a written scope.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-s2">
                {bot.messages.length > 0 && (
                  <button
                    type="button"
                    onClick={bot.reset}
                    aria-label="Start over"
                    className="btn btn-plain min-h-[36px] px-s3"
                  >
                    <RotateCcw size={16} aria-hidden />
                  </button>
                )}
                {/* aria-pressed, not two unrelated buttons: this is one control
                    with an on/off state, and a screen reader should hear it
                    that way rather than watching the label swap underneath it. */}
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  aria-pressed={expanded}
                  aria-label={expanded ? 'Restore assistant to the corner' : 'Maximise assistant'}
                  className="btn btn-plain min-h-[36px] px-s3"
                >
                  {expanded ? (
                    <Minimize2 size={16} aria-hidden />
                  ) : (
                    <Maximize2 size={16} aria-hidden />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close assistant"
                  className="btn btn-plain min-h-[36px] px-s3"
                >
                  <X size={18} aria-hidden />
                </button>
              </div>
            </header>

            <div
              ref={scrollRef}
              className="babot-transcript px-s5 py-s5"
              aria-live="polite"
              aria-atomic="false"
            >
              <div className="babot-column space-y-s4">
                <Bubble role="assistant">{OPENING_LINE}</Bubble>

                {bot.messages.map((m, i) => (
                  <Bubble key={i} role={m.role}>
                    {m.content}
                  </Bubble>
                ))}

                {bot.pending && (
                  <Bubble role="assistant">
                    <span className="inline-flex gap-1" aria-label="Thinking">
                      {[0, 1, 2].map((d) => (
                        <motion.span
                          key={d}
                          className="inline-block h-1.5 w-1.5 rounded-full"
                          style={{ background: 'var(--label-tertiary)' }}
                          animate={reduceMotion ? undefined : { opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 1.2, repeat: Infinity, delay: d * 0.15 }}
                        />
                      ))}
                    </span>
                  </Bubble>
                )}

                {done && (
                  <div className="space-y-s3 px-s2">
                    <p className="type-footnote" style={{ color: 'var(--label-secondary)' }}>
                      {/* The Worker's headline (US-011) replaces this once POST
                          /api/generate resolves — it names the real outcome
                          (a price, a rate-limit, or an estimator hiccup)
                          rather than this generic placeholder. Email delivery
                          was decommissioned, so this copy never promises one. */}
                      {bot.headline ?? 'Thanks — that is everything we need.'}
                    </p>
                    {/* Only ever rendered once the Worker hands back a real
                        signed link — never a broken or empty href. */}
                    {bot.quoteUrl && (
                      <a href={bot.quoteUrl} target="_blank" rel="noopener noreferrer" className="btn btn-filled w-full">
                        View and download your quote
                      </a>
                    )}
                  </div>
                )}

                {bot.error && (
                  <p
                    className="type-footnote px-s2"
                    role="alert"
                    style={{ color: 'var(--red-ink)' }}
                  >
                    {bot.error}
                  </p>
                )}
              </div>
            </div>

            {/* Omitted entirely once the interview is done — an empty footer
                still painted its separator as a stray hairline. */}
            {!done && (
              <div className="babot-composer">
                <div className="babot-column">
                  {onContact ? (
                    <ContactForm pending={bot.pending} onSubmit={bot.submitContact} />
                  ) : (
                    <div className="flex items-end gap-s3 p-s4">
                      <textarea
                        ref={inputRef}
                        rows={1}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          // Enter sends, Shift+Enter breaks the line — the chat
                          // convention. IME composition must never be interrupted.
                          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            submit();
                          }
                        }}
                        placeholder="Describe what you want to build…"
                        aria-label="Your message"
                        className="field field-chat max-h-32 flex-1"
                      />
                      <button
                        type="button"
                        onClick={submit}
                        disabled={!draft.trim() || bot.pending}
                        className="btn btn-filled min-h-[44px] shrink-0 px-s5"
                      >
                        Send
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** Opaque on purpose. The panel itself is the translucent material; stacking a
 * second glass layer inside it double-blurs and muddies both (see CLAUDE.md). */
function Bubble({ role, children }: { role: 'user' | 'assistant'; children: React.ReactNode }) {
  const isUser = role === 'user';
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn('type-subhead max-w-[85%] whitespace-pre-wrap rounded-lg px-s4 py-s3')}
        style={
          isUser
            ? { background: 'var(--accent-solid)', color: 'var(--on-accent)' }
            : { background: 'var(--bg-secondary)', color: 'var(--label)' }
        }
      >
        {children}
      </div>
    </div>
  );
}
