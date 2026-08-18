'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Mail, MapPin, Send, Check } from 'lucide-react';
import PageHero from '@/components/PageHero';
import GlassCard from '@/components/GlassCard';
import Button from '@/components/Button';

const needs = [
  { value: 'ai-strategy', label: 'AI Strategy' },
  { value: 'ml-development', label: 'ML Development' },
  { value: 'web-app', label: 'Web / App Development' },
  { value: 'data-engineering', label: 'Data Engineering' },
  { value: 'other', label: 'Other' },
];

const budgets = [
  { value: '10-50k', label: '$10,000 – $50,000' },
  { value: '50-100k', label: '$50,000 – $100,000' },
  { value: '100-500k', label: '$100,000 – $500,000' },
  { value: '500k+', label: '$500,000+' },
];

const EMPTY = { name: '', company: '', email: '', need: '', budget: '', message: '' };

export default function ContactClient() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const reduced = useReducedMotion();

  const update = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm({ ...form, [e.target.name]: e.target.value });

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
        lede="Tell us what you're working on. We'll come back within one business day with a considered response, not a sales sequence."
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
                    href="mailto:info@unodigit.com.au"
                    className="type-callout transition-colors duration-fast hover:text-accent-ink"
                    style={{ color: 'var(--label-secondary)' }}
                  >
                    info@unodigit.com.au
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

            {/* ── Form ────────────────────────────────────────────────── */}
            <div className="lg:col-span-2">
              <div className="card p-s8 sm:p-s10">
                <AnimatePresence mode="wait" initial={false}>
                  {submitted ? (
                    <motion.div
                      key="thanks"
                      initial={{ opacity: 0, scale: reduced ? 1 : 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={
                        reduced
                          ? { duration: 0.25 }
                          : { type: 'spring', bounce: 0.15, visualDuration: 0.35 }
                      }
                      className="py-s10 text-center"
                      role="status"
                    >
                      <span
                        className="mx-auto mb-s7 flex h-16 w-16 items-center justify-center rounded-full"
                        style={{ background: 'var(--accent-solid)', color: 'var(--on-accent)' }}
                      >
                        <Check size={30} strokeWidth={3} />
                      </span>
                      <h2 className="type-title-2 mb-s4">Thank you</h2>
                      <p
                        className="type-body mx-auto max-w-sm"
                        style={{ color: 'var(--label-secondary)' }}
                      >
                        We&rsquo;ve received your message and will get back to you within one
                        business day.
                      </p>
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
                        setSubmitted(true);
                      }}
                      className="space-y-s6"
                      noValidate={false}
                    >
                      <div className="grid gap-s6 sm:grid-cols-2">
                        <div>
                          <label htmlFor="name" className="field-label">
                            Name <span aria-hidden="true">*</span>
                          </label>
                          <input
                            id="name"
                            name="name"
                            type="text"
                            required
                            autoComplete="name"
                            value={form.name}
                            onChange={update}
                            placeholder="Your name"
                            className="field"
                          />
                        </div>
                        <div>
                          <label htmlFor="company" className="field-label">
                            Company
                          </label>
                          <input
                            id="company"
                            name="company"
                            type="text"
                            autoComplete="organization"
                            value={form.company}
                            onChange={update}
                            placeholder="Your company"
                            className="field"
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="email" className="field-label">
                          Email <span aria-hidden="true">*</span>
                        </label>
                        <input
                          id="email"
                          name="email"
                          type="email"
                          required
                          autoComplete="email"
                          value={form.email}
                          onChange={update}
                          placeholder="you@company.com"
                          className="field"
                        />
                      </div>

                      <div className="grid gap-s6 sm:grid-cols-2">
                        <div>
                          <label htmlFor="need" className="field-label">
                            What do you need?
                          </label>
                          <select
                            id="need"
                            name="need"
                            value={form.need}
                            onChange={update}
                            className="field"
                          >
                            <option value="">Select a service</option>
                            {needs.map((n) => (
                              <option key={n.value} value={n.value}>
                                {n.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label htmlFor="budget" className="field-label">
                            Budget range
                          </label>
                          <select
                            id="budget"
                            name="budget"
                            value={form.budget}
                            onChange={update}
                            className="field"
                          >
                            <option value="">Select a range</option>
                            {budgets.map((b) => (
                              <option key={b.value} value={b.value}>
                                {b.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label htmlFor="message" className="field-label">
                          Message <span aria-hidden="true">*</span>
                        </label>
                        <textarea
                          id="message"
                          name="message"
                          required
                          rows={5}
                          value={form.message}
                          onChange={update}
                          placeholder="Tell us about your project…"
                          className="field"
                        />
                      </div>

                      <Button type="submit" size="lg">
                        Send message <Send size={17} />
                      </Button>
                    </motion.form>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
