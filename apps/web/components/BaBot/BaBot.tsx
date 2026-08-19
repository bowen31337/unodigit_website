'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { MessageSquareText, X, RotateCcw } from 'lucide-react';
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
  const [draft, setDraft] = useState('');
  const reduceMotion = useReducedMotion();
  const bot = useBaBot();

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const onContact = bot.state === 'CONTACT' && !bot.finished;
  const done = bot.finished && bot.state !== 'CONTACT';

  // Escape closes from anywhere — the panel is non-modal (the page stays
  // usable behind it), so there is no focus trap to fight.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (open && !onContact && !done) inputRef.current?.focus();
  }, [open, onContact, done]);

  // Pin to the newest turn. `behavior: smooth` is skipped under reduced motion.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [bot.messages, bot.pending, onContact, reduceMotion]);

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
            className="btn btn-filled fixed bottom-s7 right-s7 z-[60] shadow-lg"
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
            className={cn(
              'glass-thick fixed z-[60] flex flex-col overflow-hidden',
              // Phone: a bottom sheet flush to the edges. Desktop: a panel
              // anchored to the launcher's corner.
              'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl',
              'sm:inset-x-auto sm:bottom-s7 sm:right-s7 sm:h-[min(600px,75dvh)] sm:w-[400px] sm:rounded-2xl',
            )}
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
              className="flex-1 space-y-s4 overflow-y-auto px-s5 py-s5"
              aria-live="polite"
              aria-atomic="false"
            >
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
                <p className="type-footnote px-s2" style={{ color: 'var(--label-secondary)' }}>
                  Thanks — that is everything we need. We will follow up by email with your
                  scope and estimate.
                </p>
              )}

              {bot.error && (
                <p className="type-footnote px-s2" role="alert" style={{ color: 'var(--red-ink)' }}>
                  {bot.error}
                </p>
              )}
            </div>

            <div style={{ borderTop: '1px solid var(--separator)' }}>
              {onContact ? (
                <ContactForm pending={bot.pending} onSubmit={bot.submitContact} />
              ) : done ? null : (
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
