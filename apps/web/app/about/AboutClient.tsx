'use client';

import { useEffect, useRef } from 'react';
import { animate, motion, useInView, useReducedMotion } from 'motion/react';
import { Target, Lightbulb, Users } from 'lucide-react';
import PageHero from '@/components/PageHero';
import GlassCard from '@/components/GlassCard';
import ScrollReveal, { staggerParent, staggerChild } from '@/components/ScrollReveal';

const values = [
  { icon: Target, title: 'Transparency', description: 'Open communication and honest partnerships built on trust.' },
  { icon: Lightbulb, title: 'Innovation', description: 'Pushing boundaries with proven, current technology.' },
  { icon: Users, title: 'Collaboration', description: 'Working alongside your team to reach exceptional outcomes.' },
];

const facts = [
  { value: 2018, label: 'Founded', suffix: '', plain: true },
  { value: 50, label: 'Team members', suffix: '+' },
  { value: 150, label: 'Projects', suffix: '+' },
  { value: 95, label: 'Retention rate', suffix: '%' },
];

/**
 * `plain` skips the count-up for the founding year — animating a year from 0
 * up to 2018 reads as a number rolling, not as a date, and the digits are the
 * content here rather than the magnitude.
 */
function Fact({ value, suffix, plain }: { value: number; suffix: string; plain?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -15% 0px' });
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (plain || reduced || !inView) {
      el.textContent = inView || plain ? `${value}${suffix}` : `0${suffix}`;
      return;
    }
    const controls = animate(0, value, {
      duration: 1,
      ease: [0.23, 1, 0.32, 1],
      onUpdate: (v) => {
        el.textContent = `${Math.round(v)}${suffix}`;
      },
    });
    return () => controls.stop();
  }, [inView, value, suffix, plain, reduced]);

  return (
    <span
      ref={ref}
      className="tabular block"
      style={{
        fontSize: 'var(--text-title-1)',
        fontWeight: 'var(--weight-bold)',
        letterSpacing: 'var(--tracking-tight)',
        lineHeight: 1.1,
      }}
    >
      {plain ? `${value}${suffix}` : `0${suffix}`}
    </span>
  );
}

export default function AboutClient() {
  return (
    <>
      <PageHero
        eyebrow="About Uno Digit"
        title={
          <>
            Building the future of{' '}
            <span style={{ color: 'var(--accent-display)' }}>intelligent business</span>
          </>
        }
        lede="We are a Sydney-based AI consultancy helping enterprises harness artificial intelligence to transform operations and drive growth."
      />

      {/* ── Mission ─────────────────────────────────────────────────────── */}
      <section className="py-s12" style={{ background: 'var(--bg-secondary)' }}>
        <div className="container">
          <div className="grid items-center gap-s12 lg:grid-cols-2">
            <ScrollReveal>
              <p className="type-eyebrow mb-s4" style={{ color: 'var(--accent-ink)' }}>
                Our mission
              </p>
              <h2 className="type-title-1 mb-s7">
                Make AI practical for enterprises of every size
              </h2>
              <div className="space-y-s5 type-body-lg" style={{ color: 'var(--label-secondary)' }}>
                <p>
                  We believe intelligent automation should be accessible, practical and
                  genuinely transformative — not a research project that never ships.
                </p>
                <p>
                  Founded in 2018, Uno Digit has grown from a small team of engineers into a
                  full-service AI consultancy serving clients across Australia and beyond.
                </p>
              </div>
            </ScrollReveal>

            <motion.ul
              variants={staggerParent}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '0px 0px -12% 0px' }}
              className="grid grid-cols-2 gap-s5"
            >
              {facts.map((fact) => (
                <motion.li key={fact.label} variants={staggerChild}>
                  <div className="card h-full p-s7 text-center">
                    <Fact value={fact.value} suffix={fact.suffix} plain={fact.plain} />
                    <span
                      className="type-footnote mt-s3 block"
                      style={{ color: 'var(--label-secondary)' }}
                    >
                      {fact.label}
                    </span>
                  </div>
                </motion.li>
              ))}
            </motion.ul>
          </div>
        </div>
      </section>

      {/* ── Values ──────────────────────────────────────────────────────── */}
      <section className="py-s12">
        <div className="container">
          <ScrollReveal className="mx-auto mb-s10 max-w-2xl text-center">
            <p className="type-eyebrow mb-s4" style={{ color: 'var(--accent-ink)' }}>
              Values
            </p>
            <h2 className="type-title-1">The principles behind every decision</h2>
          </ScrollReveal>

          <motion.ul
            variants={staggerParent}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '0px 0px -12% 0px' }}
            className="grid gap-s6 md:grid-cols-3"
          >
            {values.map((value) => (
              <motion.li key={value.title} variants={staggerChild}>
                <GlassCard className="h-full text-center" material="thin">
                  <span
                    className="mx-auto mb-s6 flex h-14 w-14 items-center justify-center rounded-lg"
                    style={{ background: 'rgb(var(--c-accent) / 0.14)', color: 'var(--accent-ink)' }}
                  >
                    <value.icon size={26} strokeWidth={1.9} />
                  </span>
                  <h3 className="type-title-3 mb-s3">{value.title}</h3>
                  <p className="type-callout" style={{ color: 'var(--label-secondary)' }}>
                    {value.description}
                  </p>
                </GlassCard>
              </motion.li>
            ))}
          </motion.ul>
        </div>
      </section>
    </>
  );
}
