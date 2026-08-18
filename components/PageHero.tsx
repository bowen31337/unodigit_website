'use client';

import { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import GradientMesh from './GradientMesh';

interface PageHeroProps {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  children?: ReactNode;
  align?: 'left' | 'center';
}

/**
 * The shared page opener. Every route used to hand-roll its own hero with a
 * different heading size, a different parallax blob offset and a different
 * entrance duration, which is why the site read as several sites. One
 * component means the type ramp and the entrance timing are identical
 * everywhere — consistency is most of what "considered" looks like.
 */
export default function PageHero({
  eyebrow,
  title,
  lede,
  children,
  align = 'left',
}: PageHeroProps) {
  const reduced = useReducedMotion();
  const enter = reduced
    ? { duration: 0.3 }
    : ({ type: 'spring', bounce: 0, visualDuration: 0.55 } as const);

  const rise = (delay: number) => ({
    initial: { opacity: 0, y: reduced ? 0 : 12 },
    animate: { opacity: 1, y: 0 },
    transition: { ...enter, delay },
  });

  return (
    <section className="relative overflow-hidden pb-s12 pt-32 sm:pt-40">
      <GradientMesh />
      <div className="container relative z-[1]">
        <div className={align === 'center' ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'}>
          <motion.p
            {...rise(0)}
            className="type-eyebrow mb-s5"
            style={{ color: 'var(--accent-ink)' }}
          >
            {eyebrow}
          </motion.p>

          <motion.h1 {...rise(0.07)} className="type-display">
            {title}
          </motion.h1>

          {lede && (
            <motion.p
              {...rise(0.14)}
              className="type-body-lg mt-s7 max-w-2xl text-balance"
              style={{ color: 'var(--label-secondary)', marginInline: align === 'center' ? 'auto' : undefined }}
            >
              {lede}
            </motion.p>
          )}

          {children && (
            <motion.div {...rise(0.21)} className="mt-s8">
              {children}
            </motion.div>
          )}
        </div>
      </div>
    </section>
  );
}
