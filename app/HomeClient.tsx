'use client';

import { useEffect, useRef } from 'react';
import { animate, motion, useInView, useReducedMotion } from 'motion/react';
import { ArrowRight, Zap, Shield, TrendingUp, Brain, Code, BarChart3 } from 'lucide-react';
import GradientMesh from '@/components/GradientMesh';
import GlassCard from '@/components/GlassCard';
import Button from '@/components/Button';
import ScrollReveal, { staggerParent, staggerChild } from '@/components/ScrollReveal';

const valueProps = [
  { icon: Zap, title: 'Lightning fast', desc: 'Rapid deployment with agile methodologies.' },
  { icon: Shield, title: 'Enterprise security', desc: 'Bank-grade security for peace of mind.' },
  { icon: TrendingUp, title: 'Scalable growth', desc: 'Solutions that grow with your business.' },
];

const services = [
  { icon: Brain, title: 'AI Strategy', description: 'Transform your business with intelligent automation and predictive analytics.' },
  { icon: Code, title: 'Custom Development', description: 'Scalable web and mobile applications built with cutting-edge technology.' },
  { icon: BarChart3, title: 'Data Intelligence', description: 'Turn raw data into actionable insights that drive growth.' },
];

const stats = [
  { value: 150, prefix: '', suffix: '+', label: 'Projects delivered' },
  { value: 50, prefix: '$', suffix: 'M+', label: 'Value created' },
  { value: 98, prefix: '', suffix: '%', label: 'Client satisfaction' },
  { value: 24, prefix: '', suffix: '/7', label: 'Support' },
];

/**
 * Counts up once when it scrolls into view, then stops.
 *
 * The number is written straight to textContent rather than through state:
 * a scroll-linked MotionValue rendered as a child prints unrounded floats and
 * runs backwards when the user scrolls up, and a setState-per-frame version
 * would re-render the tree ~60x/second per counter for no benefit.
 */
function Counter({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -15% 0px' });
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!inView) {
      el.textContent = `${prefix}0${suffix}`;
      return;
    }
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
        fontSize: 'clamp(2.25rem, 3.5vw + 1rem, 3.25rem)',
        fontWeight: 'var(--weight-bold)',
        letterSpacing: 'var(--tracking-tight)',
        lineHeight: 1.05,
        color: 'var(--label)',
      }}
    >
      {prefix}0{suffix}
    </span>
  );
}

export default function HomeClient() {
  const reduced = useReducedMotion();
  const enter = reduced
    ? { duration: 0.3 }
    : ({ type: 'spring', bounce: 0, visualDuration: 0.6 } as const);

  return (
    <>
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative flex min-h-[86svh] items-center overflow-hidden">
        <GradientMesh animated />

        <div className="container relative z-[1] pb-s10 pt-s12 text-center">
          <motion.div
            initial={{ opacity: 0, y: reduced ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...enter, delay: 0.05 }}
            className="glass-thin mb-s7 inline-flex items-center gap-s3 px-s5 py-s3"
            style={{ borderRadius: 'var(--radius-capsule)' }}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: 'var(--accent)' }} />
            <span className="type-footnote" style={{ color: 'var(--label-secondary)' }}>
              Sydney&rsquo;s leading AI consultancy
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: reduced ? 0 : 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...enter, delay: 0.12 }}
            className="type-display mx-auto max-w-4xl"
          >
            AI-driven digital
            <br className="hidden sm:block" />{' '}
            {/* --accent-display, not --accent-ink: at 72px bold the WCAG bar
                drops to 3:1, which buys a more vivid ramp stop in light mode. */}
            <span style={{ color: 'var(--accent-display)' }}>transformation</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: reduced ? 0 : 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...enter, delay: 0.2 }}
            className="type-body-lg mx-auto mt-s7 max-w-xl text-balance"
            style={{ color: 'var(--label-secondary)' }}
          >
            We partner with forward-thinking enterprises to build intelligent systems
            that drive growth, efficiency and competitive advantage.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: reduced ? 0 : 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...enter, delay: 0.28 }}
            className="mt-s9 flex flex-col items-center justify-center gap-s4 sm:flex-row"
          >
            <Button href="/contact" size="lg">
              Start your journey <ArrowRight size={18} />
            </Button>
            <Button href="/work" variant="glass" size="lg">
              View our work
            </Button>
          </motion.div>
        </div>
      </section>

      {/* ── Why Uno Digit ─────────────────────────────────────────────────
          The mesh is load-bearing here, not decoration: these cards are glass,
          and a material over a flat white section has nothing to refract, so
          all four optical layers collapse into an empty outline. */}
      <section className="relative overflow-hidden py-s12">
        <GradientMesh fadeOut={false} soft className="opacity-60" />
        <div className="container relative z-[1]">
          <ScrollReveal className="mx-auto mb-s10 max-w-2xl text-center">
            <p className="type-eyebrow mb-s4" style={{ color: 'var(--accent-ink)' }}>
              Why Uno Digit
            </p>
            <h2 className="type-title-1">
              Deep technical expertise, applied with strategic judgement
            </h2>
          </ScrollReveal>

          <motion.ul
            variants={staggerParent}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '0px 0px -12% 0px' }}
            className="grid gap-s6 md:grid-cols-3"
          >
            {valueProps.map((item) => (
              <motion.li key={item.title} variants={staggerChild}>
                <GlassCard className="h-full" material="thin">
                  <span
                    className="mb-s6 flex h-12 w-12 items-center justify-center rounded-md"
                    style={{ background: 'rgb(var(--c-accent) / 0.14)', color: 'var(--accent-ink)' }}
                  >
                    <item.icon size={22} strokeWidth={2} />
                  </span>
                  <h3 className="type-title-3 mb-s3">{item.title}</h3>
                  <p className="type-callout" style={{ color: 'var(--label-secondary)' }}>
                    {item.desc}
                  </p>
                </GlassCard>
              </motion.li>
            ))}
          </motion.ul>
        </div>
      </section>

      {/* ── Services ────────────────────────────────────────────────────── */}
      <section className="py-s12" style={{ background: 'var(--bg-secondary)' }}>
        <div className="container">
          <ScrollReveal className="mb-s10 flex flex-col justify-between gap-s5 md:flex-row md:items-end">
            <div className="max-w-xl">
              <p className="type-eyebrow mb-s4" style={{ color: 'var(--accent-ink)' }}>
                Services
              </p>
              <h2 className="type-title-1">End-to-end, powered by modern AI</h2>
            </div>
            <Button href="/services" variant="plain" size="sm" className="self-start md:self-auto">
              View all services <ArrowRight size={16} />
            </Button>
          </ScrollReveal>

          <motion.ul
            variants={staggerParent}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '0px 0px -12% 0px' }}
            className="grid gap-s6 md:grid-cols-3"
          >
            {services.map((service) => (
              <motion.li key={service.title} variants={staggerChild}>
                {/* Opaque card, not glass — this section already sits on a
                    secondary background, and stacking two translucent layers
                    muddies both. */}
                <a href="/services" className="card card-interactive block h-full p-s8">
                  <span
                    className="mb-s6 flex h-12 w-12 items-center justify-center rounded-md"
                    style={{ background: 'rgb(var(--c-accent-2) / 0.14)', color: 'var(--accent-2-ink)' }}
                  >
                    <service.icon size={22} strokeWidth={2} />
                  </span>
                  <h3 className="type-title-3 mb-s3">{service.title}</h3>
                  <p className="type-callout mb-s5" style={{ color: 'var(--label-secondary)' }}>
                    {service.description}
                  </p>
                  <span
                    className="type-subhead inline-flex items-center gap-1.5 font-medium"
                    style={{ color: 'var(--accent-ink)' }}
                  >
                    Learn more <ArrowRight size={14} />
                  </span>
                </a>
              </motion.li>
            ))}
          </motion.ul>
        </div>
      </section>

      {/* ── Stats ───────────────────────────────────────────────────────── */}
      <section className="py-s12">
        <div className="container">
          <ul className="grid grid-cols-2 gap-s8 md:grid-cols-4">
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

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <section className="pb-s12">
        <div className="container">
          <ScrollReveal>
            <div className="relative overflow-hidden rounded-2xl">
              <GradientMesh fadeOut={false} />
              {/* The one liquid-glass surface on the page. Refraction is a
                  hero-only move — using it everywhere defeats the point. */}
              <div className="glass-liquid glass-tinted relative px-s7 py-s12 text-center sm:px-s12">
                <div className="relative z-[1]">
                  <h2 className="type-title-1 mx-auto max-w-xl">Ready to transform?</h2>
                  <p
                    className="type-body-lg mx-auto mt-s5 max-w-lg"
                    style={{ color: 'var(--label-secondary)' }}
                  >
                    Let&rsquo;s discuss how AI can reshape your business operations.
                  </p>
                  <div className="mt-s8 flex justify-center">
                    <Button href="/contact" size="lg">
                      Get started <ArrowRight size={18} />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
