'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowUpRight, TrendingUp } from 'lucide-react';
import { Project, projects, featuredCase } from '@/data/projects';
import GradientMesh from '@/components/GradientMesh';

const allProjects = [featuredCase, ...projects];

export default function ProjectDetailClient({ project }: { project: Project }) {
  const reduced = useReducedMotion();
  const related = allProjects.filter((p) => p.slug !== project.slug).slice(0, 3);

  const rise = (delay: number) => ({
    initial: { opacity: 0, y: reduced ? 0 : 12 },
    animate: { opacity: 1, y: 0 },
    transition: reduced
      ? { duration: 0.3 }
      : ({ type: 'spring', bounce: 0, visualDuration: 0.55, delay } as const),
  });

  return (
    <>
      <section className="relative overflow-hidden pb-s10 pt-32 sm:pt-40">
        <GradientMesh />
        <div className="container relative z-[1]">
          <Link
            href="/work"
            className="type-subhead mb-s8 inline-flex items-center gap-s3 font-medium transition-colors duration-fast hover:text-accent-ink"
            style={{ color: 'var(--label-secondary)' }}
          >
            <ArrowLeft size={17} /> Back to work
          </Link>

          <motion.div {...rise(0)} className="mb-s6 flex flex-wrap items-center gap-s4">
            <span
              className="type-footnote px-s4 py-1.5 font-medium"
              style={{
                background: 'rgb(var(--c-accent) / 0.14)',
                color: 'var(--accent-ink)',
                borderRadius: 'var(--radius-capsule)',
              }}
            >
              {project.category}
            </span>
            {project.client && (
              <span className="type-footnote" style={{ color: 'var(--label-secondary)' }}>
                {project.client}
              </span>
            )}
          </motion.div>

          <motion.h1 {...rise(0.07)} className="type-display max-w-4xl">
            {project.title}
          </motion.h1>

          <motion.p {...rise(0.14)} className="mt-s7 flex items-center gap-s3">
            <TrendingUp size={24} strokeWidth={2.2} style={{ color: 'var(--accent-ink)' }} />
            <span className="type-title-2" style={{ color: 'var(--label)' }}>
              {project.result}
            </span>
          </motion.p>
        </div>
      </section>

      <section className="pb-s12">
        <div className="container">
          <div className="grid gap-s12 lg:grid-cols-12">
            {/* Reading copy sits directly on the page background. Long-form
                text on a translucent material is the one place glass actively
                hurts — the backdrop shifts as you scroll and contrast with it. */}
            <div className="lg:col-span-8">
              <div className="prose-apple">{project.content}</div>
            </div>

            <aside className="lg:col-span-4">
              <div className="sticky top-28 space-y-s8">
                {project.tags && project.tags.length > 0 && (
                  <div>
                    <h2 className="type-eyebrow mb-s5" style={{ color: 'var(--label-secondary)' }}>
                      Technologies
                    </h2>
                    <ul className="flex flex-wrap gap-s3">
                      {project.tags.map((tag) => (
                        <li
                          key={tag}
                          className="type-footnote px-s4 py-1.5"
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
                  </div>
                )}

                <div>
                  <h2 className="type-eyebrow mb-s5" style={{ color: 'var(--label-secondary)' }}>
                    More projects
                  </h2>
                  <ul className="space-y-s4">
                    {related.map((item) => (
                      <li key={item.slug}>
                        <Link
                          href={`/work/${item.slug}`}
                          className="card card-interactive group block p-s6"
                        >
                          <span
                            className="type-caption-1 mb-s2 block font-semibold uppercase tracking-wide"
                            style={{ color: 'var(--accent-ink)' }}
                          >
                            {item.category}
                          </span>
                          <span className="type-headline mb-s2 flex items-start justify-between gap-s4">
                            {item.title}
                            <ArrowUpRight
                              size={16}
                              className="mt-0.5 shrink-0 transition-transform duration-fast ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                              style={{ color: 'var(--accent-ink)' }}
                            />
                          </span>
                          <span
                            className="type-footnote block"
                            style={{ color: 'var(--label-secondary)' }}
                          >
                            {item.result}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </>
  );
}
