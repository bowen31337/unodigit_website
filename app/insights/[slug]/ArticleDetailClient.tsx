'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowUpRight, Clock, Calendar } from 'lucide-react';
import { Article, articles } from '@/data/articles';
import GradientMesh from '@/components/GradientMesh';

export default function ArticleDetailClient({ article }: { article: Article }) {
  const reduced = useReducedMotion();
  const related = articles.filter((a) => a.slug !== article.slug).slice(0, 3);

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
            href="/insights"
            className="type-subhead mb-s8 inline-flex items-center gap-s3 font-medium transition-colors duration-fast hover:text-accent-ink"
            style={{ color: 'var(--label-secondary)' }}
          >
            <ArrowLeft size={17} /> Back to insights
          </Link>

          <motion.div {...rise(0)} className="mb-s6 flex flex-wrap items-center gap-s5">
            <span
              className="type-footnote px-s4 py-1.5 font-medium"
              style={{
                background: 'rgb(var(--c-accent) / 0.14)',
                color: 'var(--accent-ink)',
                borderRadius: 'var(--radius-capsule)',
              }}
            >
              {article.category}
            </span>
            <span
              className="type-footnote flex items-center gap-1.5"
              style={{ color: 'var(--label-secondary)' }}
            >
              <Calendar size={13} /> {article.date}
            </span>
            <span
              className="type-footnote flex items-center gap-1.5"
              style={{ color: 'var(--label-secondary)' }}
            >
              <Clock size={13} /> {article.readTime}
            </span>
          </motion.div>

          <motion.h1 {...rise(0.07)} className="type-display max-w-4xl">
            {article.title}
          </motion.h1>

          <motion.p
            {...rise(0.14)}
            className="type-body-lg mt-s7 max-w-2xl"
            style={{ color: 'var(--label-secondary)' }}
          >
            {article.excerpt}
          </motion.p>
        </div>
      </section>

      <section className="pb-s12">
        <div className="container">
          <div className="grid gap-s12 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <div className="prose-apple">{article.content}</div>
            </div>

            <aside className="lg:col-span-4">
              <div className="sticky top-28">
                <h2 className="type-eyebrow mb-s5" style={{ color: 'var(--label-secondary)' }}>
                  Related insights
                </h2>
                <ul className="space-y-s4">
                  {related.map((item) => (
                    <li key={item.slug}>
                      <Link
                        href={`/insights/${item.slug}`}
                        className="card card-interactive group block p-s6"
                      >
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
                          {item.date}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </>
  );
}
