'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, ArrowUpRight, Clock, Check } from 'lucide-react';
import PageHero from '@/components/PageHero';
import GlassCard from '@/components/GlassCard';
import Button from '@/components/Button';
import ScrollReveal, { staggerParent, staggerChild } from '@/components/ScrollReveal';
import { articles } from '@/data/articles';

const featured = articles[0];
const recent = articles.slice(1);

export default function InsightsClient() {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  return (
    <>
      <PageHero
        eyebrow="Insights"
        title={
          <>
            Thinking on AI and{' '}
            <span style={{ color: 'var(--accent-display)' }}>digital transformation</span>
          </>
        }
        lede="Our latest perspective on where enterprise AI is actually heading, and what that means for the systems you build now."
      />

      {/* ── Featured article ────────────────────────────────────────────── */}
      <section className="pb-s12">
        <div className="container">
          <ScrollReveal>
            <Link href={`/insights/${featured.slug}`} className="group block">
              <GlassCard className="overflow-hidden !p-0" material="thin">
                <div className="grid lg:grid-cols-5">
                  <div
                    className="relative flex min-h-[220px] items-center justify-center lg:col-span-2"
                    style={{
                      background:
                        'linear-gradient(140deg, rgb(var(--c-accent) / 0.22), rgb(var(--c-accent-2) / 0.20))',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        fontSize: 'clamp(3rem, 7vw, 4.5rem)',
                        fontWeight: 'var(--weight-bold)',
                        letterSpacing: 'var(--tracking-tight)',
                        color: 'var(--label)',
                        opacity: 0.14,
                      }}
                    >
                      AI
                    </span>
                  </div>

                  <div className="p-s9 lg:col-span-3 lg:p-s12">
                    <div className="mb-s5 flex flex-wrap items-center gap-s4">
                      <span
                        className="type-footnote px-s4 py-1.5 font-medium"
                        style={{
                          background: 'rgb(var(--c-accent) / 0.14)',
                          color: 'var(--accent-ink)',
                          borderRadius: 'var(--radius-capsule)',
                        }}
                      >
                        {featured.category}
                      </span>
                      <span
                        className="type-footnote flex items-center gap-1.5"
                        style={{ color: 'var(--label-secondary)' }}
                      >
                        <Clock size={13} /> {featured.readTime}
                      </span>
                    </div>

                    <h2 className="type-title-1 mb-s5">{featured.title}</h2>
                    <p className="type-body mb-s7" style={{ color: 'var(--label-secondary)' }}>
                      {featured.excerpt}
                    </p>

                    <span className="flex items-center justify-between gap-s5">
                      <span className="type-footnote" style={{ color: 'var(--label-secondary)' }}>
                        {featured.date}
                      </span>
                      <span
                        className="type-subhead inline-flex items-center gap-1.5 font-medium"
                        style={{ color: 'var(--accent-ink)' }}
                      >
                        Read article
                        <ArrowRight
                          size={15}
                          className="transition-transform duration-fast ease-out group-hover:translate-x-0.5"
                        />
                      </span>
                    </span>
                  </div>
                </div>
              </GlassCard>
            </Link>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Recent ──────────────────────────────────────────────────────── */}
      <section className="py-s12" style={{ background: 'var(--bg-secondary)' }}>
        <div className="container">
          <ScrollReveal className="mb-s9">
            <h2 className="type-title-1">Recent articles</h2>
          </ScrollReveal>

          <motion.ul
            variants={staggerParent}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '0px 0px -10% 0px' }}
            className="grid gap-s6 md:grid-cols-2 xl:grid-cols-3"
          >
            {recent.map((article) => (
              <motion.li key={article.slug} variants={staggerChild}>
                <Link
                  href={`/insights/${article.slug}`}
                  className="card card-interactive group flex h-full flex-col p-s8"
                >
                  <span className="type-eyebrow mb-s4" style={{ color: 'var(--accent-ink)' }}>
                    {article.category}
                  </span>
                  <h3 className="type-title-3 mb-s3">{article.title}</h3>
                  <p className="type-subhead mb-s7" style={{ color: 'var(--label-secondary)' }}>
                    {article.excerpt}
                  </p>

                  <hr className="hairline mb-s5 mt-auto" />
                  <span
                    className="type-footnote flex items-center justify-between gap-s4"
                    style={{ color: 'var(--label-secondary)' }}
                  >
                    <span>{article.date}</span>
                    <span className="flex items-center gap-1.5">
                      <Clock size={12} /> {article.readTime}
                      <ArrowUpRight
                        size={15}
                        className="ml-1 transition-transform duration-fast ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                        style={{ color: 'var(--accent-ink)' }}
                      />
                    </span>
                  </span>
                </Link>
              </motion.li>
            ))}
          </motion.ul>
        </div>
      </section>

      {/* ── Newsletter ──────────────────────────────────────────────────── */}
      <section className="py-s12">
        <div className="container">
          <ScrollReveal className="mx-auto max-w-xl text-center">
            <h2 className="type-title-1 mb-s5">Stay updated</h2>
            <p className="type-body-lg mb-s8" style={{ color: 'var(--label-secondary)' }}>
              Occasional notes on AI, engineering and digital transformation. No noise.
            </p>

            {/*
              Enter settles with a spring, exit leaves quickly — arrivals and
              departures are deliberately asymmetric, the way Apple's are.
            */}
            <AnimatePresence mode="wait" initial={false}>
              {subscribed ? (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ type: 'spring', bounce: 0.15, visualDuration: 0.3 }}
                  className="glass-thin flex items-center justify-center gap-s4 p-s7"
                  role="status"
                >
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                    style={{ background: 'var(--accent-solid)', color: 'var(--on-accent)' }}
                  >
                    <Check size={16} strokeWidth={3} />
                  </span>
                  <span className="type-callout font-medium">
                    Thanks — check your inbox to confirm.
                  </span>
                </motion.div>
              ) : (
                <motion.form
                  key="form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    setSubscribed(true);
                  }}
                  className="mx-auto flex max-w-md flex-col gap-s4 sm:flex-row"
                >
                  <label htmlFor="newsletter-email" className="sr-only">
                    Email address
                  </label>
                  <input
                    id="newsletter-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="field flex-1"
                    style={{ borderRadius: 'var(--radius-capsule)' }}
                  />
                  <Button type="submit">Subscribe</Button>
                </motion.form>
              )}
            </AnimatePresence>
          </ScrollReveal>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <section className="pb-s12">
        <div className="container text-center">
          <ScrollReveal>
            <h2 className="type-title-1 mx-auto max-w-xl">Want to go deeper?</h2>
            <p
              className="type-body-lg mx-auto mt-s5 max-w-lg"
              style={{ color: 'var(--label-secondary)' }}
            >
              Get in touch to discuss how any of this applies to your business.
            </p>
            <div className="mt-s8 flex justify-center">
              <Button href="/contact" size="lg">
                Contact us <ArrowRight size={18} />
              </Button>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
