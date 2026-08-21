'use client';

import { Mail, MapPin, MessageSquareText, Check } from 'lucide-react';
import PageHero from '@/components/PageHero';
import GlassCard from '@/components/GlassCard';
import Button from '@/components/Button';
import { openBaBot } from '@/components/BaBot/open';
import { ORG } from '@/lib/site';

/**
 * There is no enquiry form here any more.
 *
 * The one that used to live in this file never sent anything: `onSubmit` was
 * `preventDefault()` followed by `setSubmitted(true)`, so it rendered "we've
 * received your message" over an enquiry that had gone nowhere. The scoping
 * assistant is the real intake path — it asks better questions than six
 * fields can, and it hands the visitor a written scope at the end rather than
 * a promise to reply. This page's job is now to explain that and start it.
 */

/** What the interview actually covers, in the visitor's terms. */
const COVERED = [
  'What you want to build, and what makes it worth building',
  'Constraints that shape it — timeline, budget, the systems it has to live with',
  'A written scope and an indicative estimate you can take away',
];

export default function ContactClient() {
  return (
    <>
      <PageHero
        eyebrow="Contact"
        title={
          <>
            Let&rsquo;s build something{' '}
            <span style={{ color: 'var(--accent-display)' }}>together</span>
          </>
        }
        lede="Tell us what you're working on. Our assistant will walk you through it in a few minutes and write up a scope — or email us and a person will come back within one business day."
      />

      <section className="pb-s12">
        <div className="container">
          <div className="grid gap-s9 lg:grid-cols-3">
            {/* ── Contact details ─────────────────────────────────────── */}
            <div className="space-y-s5 lg:col-span-1">
              <GlassCard className="flex items-start gap-s5" material="thin">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md"
                  style={{ background: 'rgb(var(--c-accent) / 0.14)', color: 'var(--accent-ink)' }}
                >
                  <Mail size={20} strokeWidth={2} />
                </span>
                <span className="block">
                  <span className="type-headline mb-s2 block">Email us</span>
                  <a
                    href={`mailto:${ORG.email}`}
                    className="type-callout transition-colors duration-fast hover:text-accent-ink"
                    style={{ color: 'var(--label-secondary)' }}
                  >
                    {ORG.email}
                  </a>
                </span>
              </GlassCard>

              <GlassCard className="flex items-start gap-s5" material="thin">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md"
                  style={{ background: 'rgb(var(--c-accent-2) / 0.14)', color: 'var(--accent-2-ink)' }}
                >
                  <MapPin size={20} strokeWidth={2} />
                </span>
                <span className="block">
                  <span className="type-headline mb-s2 block">Visit us</span>
                  <span className="type-callout" style={{ color: 'var(--label-secondary)' }}>
                    Sydney, NSW
                    <br />
                    Australia
                  </span>
                </span>
              </GlassCard>
            </div>

            {/* ── Start an interview ──────────────────────────────────── */}
            <div className="lg:col-span-2">
              {/* Opaque `.card`, not glass: the two cards beside it are already
                  the translucent layer, and stacking a second one double-blurs
                  the mesh behind both. */}
              <div className="card p-s8 sm:p-s10">
                <span
                  className="mb-s7 flex h-14 w-14 items-center justify-center rounded-lg"
                  style={{ background: 'var(--accent-solid)', color: 'var(--on-accent)' }}
                >
                  <MessageSquareText size={26} strokeWidth={2} aria-hidden />
                </span>

                <h2 className="type-title-2 mb-s4">Scope your project</h2>
                <p className="type-body mb-s7 max-w-prose" style={{ color: 'var(--label-secondary)' }}>
                  Our assistant asks the questions a business analyst would ask on a first call.
                  It takes a few minutes, and you leave with a written scope rather than a
                  confirmation screen.
                </p>

                <ul className="mb-s8 space-y-s4">
                  {COVERED.map((item) => (
                    <li key={item} className="flex items-start gap-s4">
                      <span
                        className="mt-[3px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                        style={{ background: 'rgb(var(--c-accent) / 0.14)', color: 'var(--accent-ink)' }}
                      >
                        <Check size={13} strokeWidth={3} aria-hidden />
                      </span>
                      <span className="type-callout" style={{ color: 'var(--label-secondary)' }}>
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>

                <Button size="lg" onClick={openBaBot}>
                  Start scoping <MessageSquareText size={17} aria-hidden />
                </Button>

                <p className="type-footnote mt-s6" style={{ color: 'var(--label-secondary)' }}>
                  Prefer to write to a person?{' '}
                  <a href={`mailto:${ORG.email}`} style={{ color: 'var(--accent-ink)' }}>
                    {ORG.email}
                  </a>{' '}
                  — we reply within one business day.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
