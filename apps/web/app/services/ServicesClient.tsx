'use client';

import { motion } from 'motion/react';
import { Brain, Code, Database, LineChart, Cog, Cloud, ArrowRight, Check } from 'lucide-react';
import PageHero from '@/components/PageHero';
import Button from '@/components/Button';
import ScrollReveal, { staggerParent, staggerChild } from '@/components/ScrollReveal';

const services = [
  {
    icon: Brain,
    title: 'AI Strategy & Consulting',
    description: 'Strategic roadmaps for AI adoption that align with your business objectives.',
    features: ['AI readiness assessment', 'Use case identification', 'ROI analysis', 'Implementation planning'],
  },
  {
    icon: LineChart,
    title: 'Machine Learning Solutions',
    description: 'Custom ML models for predictive analytics, NLP and computer vision.',
    features: ['Predictive analytics', 'Natural language processing', 'Computer vision', 'Recommendation systems'],
  },
  {
    icon: Database,
    title: 'Data Engineering',
    description: 'Robust data pipelines and infrastructure for AI-ready organisations.',
    features: ['Data pipeline design', 'ETL development', 'Data warehouse', 'Real-time processing'],
  },
  {
    icon: Code,
    title: 'Web & App Development',
    description: 'Modern, scalable applications built with current technology.',
    features: ['React / Next.js', 'Mobile apps', 'API development', 'Cloud architecture'],
  },
  {
    icon: Cog,
    title: 'Process Automation',
    description: 'Intelligent automation to streamline operations and reduce cost.',
    features: ['RPA implementation', 'Workflow automation', 'Document processing', 'Integration services'],
  },
  {
    icon: Cloud,
    title: 'Cloud & MLOps',
    description: 'Enterprise-grade infrastructure for deploying and scaling AI solutions.',
    features: ['AWS / GCP / Azure', 'Model deployment', 'CI/CD pipelines', 'Monitoring & maintenance'],
  },
];

const process = [
  { step: '01', title: 'Discovery', description: 'A deep dive into your business challenges and objectives.' },
  { step: '02', title: 'Strategy', description: 'Define the roadmap and the technical approach.' },
  { step: '03', title: 'Build', description: 'Agile development with continuous feedback.' },
  { step: '04', title: 'Deploy', description: 'Launch, monitor and iterate for optimal results.' },
];

const stack = ['Python', 'TensorFlow', 'PyTorch', 'React', 'Node.js', 'AWS', 'GCP', 'Docker', 'Kubernetes', 'PostgreSQL', 'MongoDB', 'Redis'];

export default function ServicesClient() {
  return (
    <>
      <PageHero
        eyebrow="Services"
        title={
          <>
            End-to-end <span style={{ color: 'var(--accent-display)' }}>AI solutions</span>
          </>
        }
        lede="From strategy through to deployment, we provide the full set of services needed to realise the potential of artificial intelligence."
      />

      {/* ── Service grid ────────────────────────────────────────────────────
          Replaces the previous 300vh pinned horizontal scroll. Hijacking three
          viewports of scrolling to reveal six cards costs the reader control
          of the page and hides the content from anyone who scrolls past — a
          plain grid shows all six at once and is fully keyboard reachable. */}
      <section className="py-s12" style={{ background: 'var(--bg-secondary)' }}>
        <div className="container">
          <ScrollReveal className="mb-s10 max-w-2xl">
            <p className="type-eyebrow mb-s4" style={{ color: 'var(--accent-ink)' }}>
              Expertise
            </p>
            <h2 className="type-title-1">Six disciplines, one delivery team</h2>
          </ScrollReveal>

          <motion.ul
            variants={staggerParent}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '0px 0px -10% 0px' }}
            className="grid gap-s6 md:grid-cols-2 xl:grid-cols-3"
          >
            {services.map((service) => (
              <motion.li key={service.title} variants={staggerChild}>
                <div className="card flex h-full flex-col p-s8">
                  <span
                    className="mb-s6 flex h-12 w-12 items-center justify-center rounded-md"
                    style={{ background: 'rgb(var(--c-accent) / 0.14)', color: 'var(--accent-ink)' }}
                  >
                    <service.icon size={22} strokeWidth={2} />
                  </span>
                  <h3 className="type-title-3 mb-s3">{service.title}</h3>
                  <p className="type-callout mb-s6" style={{ color: 'var(--label-secondary)' }}>
                    {service.description}
                  </p>
                  <ul className="mt-auto space-y-s3">
                    {service.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-s3 type-subhead">
                        <Check
                          size={16}
                          strokeWidth={2.4}
                          className="mt-0.5 shrink-0"
                          style={{ color: 'var(--accent-ink)' }}
                        />
                        <span style={{ color: 'var(--label-secondary)' }}>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.li>
            ))}
          </motion.ul>
        </div>
      </section>

      {/* ── Process ─────────────────────────────────────────────────────── */}
      <section className="py-s12">
        <div className="container">
          <ScrollReveal className="mx-auto mb-s10 max-w-2xl text-center">
            <p className="type-eyebrow mb-s4" style={{ color: 'var(--accent-ink)' }}>
              Process
            </p>
            <h2 className="type-title-1">A methodology that delivers on time</h2>
          </ScrollReveal>

          <motion.ol
            variants={staggerParent}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '0px 0px -12% 0px' }}
            className="grid gap-s8 md:grid-cols-4"
          >
            {process.map((step) => (
              <motion.li key={step.step} variants={staggerChild} className="relative">
                {/* A hairline rule instead of the old scroll-scrubbed gradient
                    bar — it marks the sequence without competing with it. */}
                <hr className="hairline mb-s5" />
                <span
                  className="type-footnote tabular mb-s4 block font-semibold"
                  style={{ color: 'var(--accent-ink)' }}
                >
                  {step.step}
                </span>
                <h3 className="type-title-3 mb-s3">{step.title}</h3>
                <p className="type-subhead" style={{ color: 'var(--label-secondary)' }}>
                  {step.description}
                </p>
              </motion.li>
            ))}
          </motion.ol>
        </div>
      </section>

      {/* ── Stack ───────────────────────────────────────────────────────── */}
      <section className="py-s12" style={{ background: 'var(--bg-secondary)' }}>
        <div className="container">
          <ScrollReveal className="mx-auto mb-s9 max-w-2xl text-center">
            <p className="type-eyebrow mb-s4" style={{ color: 'var(--accent-ink)' }}>
              Technology
            </p>
            <h2 className="type-title-1">The tools we build with</h2>
          </ScrollReveal>

          <motion.ul
            variants={staggerParent}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '0px 0px -10% 0px' }}
            className="mx-auto flex max-w-3xl flex-wrap justify-center gap-s3"
          >
            {stack.map((tech) => (
              <motion.li
                key={tech}
                variants={staggerChild}
                className="type-subhead px-s6 py-s4 font-medium"
                style={{
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-capsule)',
                  boxShadow: 'var(--shadow-1), 0 0 0 0.5px var(--separator)',
                  color: 'var(--label-secondary)',
                }}
              >
                {tech}
              </motion.li>
            ))}
          </motion.ul>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <section className="py-s12">
        <div className="container text-center">
          <ScrollReveal>
            <h2 className="type-title-1 mx-auto max-w-xl">Ready to get started?</h2>
            <p
              className="type-body-lg mx-auto mt-s5 max-w-lg"
              style={{ color: 'var(--label-secondary)' }}
            >
              Let&rsquo;s talk through your project and find the right approach.
            </p>
            <div className="mt-s8 flex justify-center">
              <Button href="/contact" size="lg">
                Schedule a consultation <ArrowRight size={18} />
              </Button>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
