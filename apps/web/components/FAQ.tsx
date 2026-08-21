'use client';

import { useId, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { Faq } from '@/data/faqs';

/** Apple's sheet spring — a disclosure is a small sheet opening in place. */
const OPEN_SPRING = { type: 'spring', bounce: 0, visualDuration: 0.32 } as const;

/**
 * A disclosure list, in the shape of an iOS grouped table view.
 *
 * WHY THE MARKUP IS WHAT IT IS
 * ----------------------------
 * Every answer is in the DOM as text at all times — the collapsed state is
 * `height: 0` and `aria-hidden`, never conditional rendering. That matters
 * beyond a11y: this content is the page's FAQPage structured data, and an
 * answer that only exists after a click is an answer a crawler never sees.
 * The visible copy and the JSON-LD must be the same words, or the structured
 * data is unverifiable and gets ignored.
 *
 * MOTION
 * ------
 * Height genuinely has to animate here — a disclosure that reveals content
 * cannot do it with transform alone. So height rides the spring, and the
 * content *inside* rides opacity and a small translateY, which is what makes
 * it read as the answer sliding out from behind the question rather than the
 * box merely getting taller. The chevron rotates on transform.
 *
 * Under prefers-reduced-motion the springs collapse to an instant state change
 * and only the crossfade survives.
 */
export default function FAQ({
  faqs,
  className = '',
}: {
  faqs: Faq[];
  className?: string;
}) {
  const [open, setOpen] = useState<number | null>(0);
  const reduce = useReducedMotion();
  const baseId = useId();

  return (
    <div className={`card overflow-hidden ${className}`}>
      {faqs.map((faq, i) => {
        const isOpen = open === i;
        const panelId = `${baseId}-panel-${i}`;
        const buttonId = `${baseId}-button-${i}`;

        return (
          <div key={faq.q} className={i > 0 ? 'border-t-[0.5px] border-separator' : ''}>
            <h3 className="m-0">
              <button
                type="button"
                id={buttonId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                // Accordion, not a toggle-all: reopening the open row closes it.
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full min-h-[44px] items-center justify-between gap-s5 px-s6 py-s5 text-left transition-colors duration-fast ease-out hover:bg-fill-4 active:bg-fill-3"
              >
                <span className="type-headline text-label">{faq.q}</span>
                <motion.span
                  aria-hidden="true"
                  className="shrink-0 text-label-secondary"
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  transition={reduce ? { duration: 0 } : OPEN_SPRING}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </motion.span>
              </button>
            </h3>

            {/* Always mounted. `isOpen && <panel>` would have been simpler, but
                a collapsed answer would then not exist in the exported HTML at
                all — and these exact strings are the page's FAQPage structured
                data. Structured data whose text cannot be found on the page is
                unverifiable, and both Google and the AI fetchers discount it.
                So the closed state is height:0 + aria-hidden, not unmounted.
                The panel holds only a paragraph, so there is nothing focusable
                to trap inside the collapsed region. */}
            <motion.div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              aria-hidden={!isOpen}
              initial={false}
              animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
              transition={reduce ? { duration: 0 } : OPEN_SPRING}
              className="overflow-hidden"
            >
              <motion.p
                initial={false}
                animate={{ y: isOpen || reduce ? 0 : -6 }}
                transition={reduce ? { duration: 0 } : OPEN_SPRING}
                className="type-body m-0 px-s6 pb-s6 pt-0 text-label-secondary"
                style={{ maxWidth: '68ch' }}
              >
                {faq.a}
              </motion.p>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}
