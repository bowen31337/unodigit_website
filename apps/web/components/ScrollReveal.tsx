'use client';

import { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { Variants } from 'motion/react';

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  /** Travel distance in px. Kept small on purpose. */
  y?: number;
  as?: 'div' | 'section' | 'li' | 'article';
}

/** Critically damped — Apple's reposition spring (damping 1.0 / response 0.4). */
export const revealSpring = { type: 'spring', bounce: 0, visualDuration: 0.5 } as const;

/**
 * Content rises and fades in ONCE as it enters. Deliberately restrained: the
 * old version travelled 50-60px and scaled from 0.95, which reads as a wall of
 * animation on a long marketing page. 16px and no scale is enough to signal
 * arrival without the page feeling like it's assembling itself.
 *
 * Under prefers-reduced-motion the travel drops out entirely and only the
 * opacity crossfade remains — gentler, not gone.
 */
export default function ScrollReveal({
  children,
  className,
  delay = 0,
  y = 16,
  as = 'div',
}: ScrollRevealProps) {
  const reduced = useReducedMotion();
  const MotionTag = motion[as];

  return (
    <MotionTag
      initial={{ opacity: 0, y: reduced ? 0 : y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={reduced ? { duration: 0.25 } : { ...revealSpring, delay }}
      className={className}
    >
      {children}
    </MotionTag>
  );
}

/**
 * Parent/child pair for staggered groups. Stagger is capped at 60ms — beyond
 * ~80ms a grid stops reading as one group arriving and starts reading as
 * items queuing up one by one.
 */
export const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

export const staggerChild: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: revealSpring },
};
