'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { animate, motion, useInView, useReducedMotion } from 'motion/react';
import { ArrowRight, ArrowUpRight, TrendingUp } from 'lucide-react';
import PageHero from '@/components/PageHero';
import GlassCard from '@/components/GlassCard';
import Button from '@/components/Button';
import Segmented from '@/components/Segmented';
import ScrollReveal, { staggerParent, staggerChild } from '@/components/ScrollReveal';
import { projects, featuredCase } from '@/data/projects';

const stats = [
  { value: 50, prefix: '$', suffix: 'M+', label: 'Value created' },
  { value: 150, prefix: '', suffix: '+', label: 'Projects completed' },
  { value: 40, prefix: '', suffix: '+', label: 'Happy clients' },
];

function Counter({ value, prefix, suffix }: { value: number; prefix: string; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -15% 0px' });
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!inView) return;
    if (reduced) {
      el.textContent = `${prefix}${value}${suffix}`;
      return;
    }
    const controls = animate(0, value, {
      duration: 1.1,
      ease: [0.23, 1, 0.32, 1],
      onUpdate: (v) => {
        el.textContent = `${prefix}${Math.round(v)}${suffix}`;
      },
    });
    return () => controls.stop();
  }, [inView, value, prefix, suffix, reduced]);

  return (
    <span
      ref={ref}
      className="tabular block"
      style={{
        fontSize: 'clamp(2rem, 3vw + 1rem, 3rem)',
        fontWeight: 'var(--weight-bold)',
        letterSpacing: 'var(--tracking-tight)',
        lineHeight: 1.05,
      }}
    >
      {prefix}0{suffix}
    </span>
  );
}

export default function WorkClient() {
  const categories = useMemo(() => {
    const unique = Array.from(new Set(projects.map((p) => p.category)));
    return [{ value: 'All', label: 'All' }, ...unique.map((c) => ({ value: c, label: c }))];
  }, []);

  const [filter, setFilter] = useState('All');
  const visible = filter === 'All' ? projects : projects.filter((p) => p.category === filter);

  return (
    <>
      <PageHero
        eyebrow="Our work"
        title={
          <>
            Proven results, <span style={{ color: 'var(--accent-display)' }}>real impact</span>
          </>
        }
        lede="A portfolio of projects where AI moved a genuine business metric — not a proof of concept that never left the lab."
      />

      {/* ── Featured case ───────────────────────────────────────────────── */}
      <section className="pb-s12">
        <div className="container">
          <ScrollReveal>
            <GlassCard className="overflow-hidden !p-0" material="thin">
              <div className="grid lg:grid-cols-5">
                <div className="p-s9 lg:col-span-3 lg:p-s12">
                  <p className="type-eyebrow mb-s4" style={{ color: 'var(--accent-ink)' }}>
                    Featured case study
                  </p>
                  <h2 className="type-title-1 mb-s5">{featuredCase.title}</h2>
                  <p className="type-body mb-s6" style={{ color: 'var(--label-secondary)' }}>
                    {featuredCase.description}
                  </p>

                  <p className="mb-s7 flex items-center gap-s3">
                    <TrendingUp size={22} strokeWidth={2.2} style={{ color: 'var(--accent-ink)' }} />
                    <span className="type-title-3" style={{ color: 'var(--label)' }}>
                      {featuredCase.result}
                    </span>
                  </p>

                  <ul className="mb-s8 flex flex-wrap gap-s3">
                    {featuredCase.tags?.map((tag) => (
                      <li
                        key={tag}
                        className="type-footnote px-s5 py-s3"
                        style={{
                          background: 'var(--fill-4)',
                          borderRadius: 'var(--radius-capsule)',
                          color: 'var(--label-secondary)',
                        }}
                      >
                        {tag}
                      </li>
                    ))}
                  </ul>

                  <Button href={`/work/${featuredCase.slug}`} variant="tinted" size="sm">
                    Read the case study <ArrowRight size={16} />
                  </Button>
                </div>

                {/*
                  A calm two-tone wash drawn from the logo's own colours,
                  standing in for imagery. The initials sit at low contrast on
                  purpose — this is a surface, not a headline.
                */}
                <div
                  className="relative flex min-h-[240px] items-center justify-center lg:col-span-2"
                  style={{
                    background:
                      'linear-gradient(140deg, rgb(var(--c-accent) / 0.22), rgb(var(--c-accent-2) / 0.20))',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      fontSize: 'clamp(3rem, 8vw, 5rem)',
                      fontWeight: 'var(--weight-bold)',
                      letterSpacing: 'var(--tracking-tight)',
                      color: 'var(--label)',
                      opacity: 0.14,
                    }}
                  >
                    {featuredCase.client
                      ?.split(' ')
                      .slice(0, 2)
                      .map((w) => w[0])
                      .join('') ?? 'UD'}
                  </span>
                </div>
              </div>
            </GlassCard>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Stats ───────────────────────────────────────────────────────── */}
      <section className="pb-s12">
        <div className="container">
          <ul className="grid grid-cols-1 gap-s8 sm:grid-cols-3">
            {stats.map((stat) => (
              <li key={stat.label} className="text-center">
                <Counter value={stat.value} prefix={stat.prefix} suffix={stat.suffix} />
                <span
                  className="type-subhead mt-s3 block"
                  style={{ color: 'var(--label-secondary)' }}
                >
                  {stat.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── All projects ────────────────────────────────────────────────── */}
      <section className="py-s12" style={{ background: 'var(--bg-secondary)' }}>
        <div className="container">
          <ScrollReveal className="mb-s9 flex flex-col justify-between gap-s6 md:flex-row md:items-end">
            <h2 className="type-title-1">All projects</h2>
            {categories.length > 2 && (
              <div className="overflow-x-auto">
                <Segmented
                  aria-label="Filter projects by category"
                  options={categories}
                  value={filter}
                  onChange={setFilter}
                />
              </div>
            )}
          </ScrollReveal>

          {/*
            `layout` on each card means filtering reflows with a spring instead
            of a hard cut, so items that survive the filter visibly slide to
            their new position rather than teleporting. `key={filter}` on the
            list restarts the stagger for the incoming set.
          */}
          <motion.ul
            key={filter}
            variants={staggerParent}
            initial="hidden"
            animate="show"
            className="grid gap-s6 md:grid-cols-2 xl:grid-cols-3"
          >
            {visible.map((project) => (
              <motion.li key={project.slug} variants={staggerChild} layout>
                <Link
                  href={`/work/${project.slug}`}
                  className="card card-interactive group flex h-full flex-col p-s8"
                >
                  <span className="type-eyebrow mb-s4" style={{ color: 'var(--accent-ink)' }}>
                    {project.category}
                  </span>
                  <h3 className="type-title-3 mb-s3">{project.title}</h3>
                  <p className="type-subhead mb-s7" style={{ color: 'var(--label-secondary)' }}>
                    {project.description}
                  </p>

                  <hr className="hairline mb-s5 mt-auto" />
                  <span className="flex items-center justify-between gap-s4">
                    <span className="type-subhead font-semibold" style={{ color: 'var(--label)' }}>
                      {project.result}
                    </span>
                    <ArrowUpRight
                      size={18}
                      className="shrink-0 transition-transform duration-fast ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                      style={{ color: 'var(--accent-ink)' }}
                    />
                  </span>
                </Link>
              </motion.li>
            ))}
          </motion.ul>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <section className="py-s12">
        <div className="container text-center">
          <ScrollReveal>
            <h2 className="type-title-1 mx-auto max-w-xl">Have a project in mind?</h2>
            <p
              className="type-body-lg mx-auto mt-s5 max-w-lg"
              style={{ color: 'var(--label-secondary)' }}
            >
              Let&rsquo;s discuss how we can help you reach similar results.
            </p>
            <div className="mt-s8 flex justify-center">
              <Button href="/contact" size="lg">
                Start a conversation <ArrowRight size={18} />
              </Button>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
