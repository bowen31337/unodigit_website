import { useRef, useEffect, useState, RefObject } from 'react';
import { useScroll, useTransform, useSpring, useInView, MotionValue } from 'motion/react';

// Parallax Hook using Motion
export function useParallax(speed: number = 0.5) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  
  const y = useTransform(scrollYProgress, [0, 1], [0, (1 - speed) * 200]);
  const smoothY = useSpring(y, { stiffness: 100, damping: 30 });
  
  return { ref, y: smoothY };
}

// Stagger animation - returns ref and tracks visibility
export function useStaggerReveal(staggerAmount: number = 0.1) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: '-20% 0px' });
  
  return { ref: containerRef, isInView, staggerAmount };
}

// Scroll transform hook
export function useScrollTransform(options?: {
  scale?: { from: number; to: number };
  rotate?: { from: number; to: number };
  opacity?: { from: number; to: number };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'center center'],
  });
  
  const scale = useTransform(
    scrollYProgress,
    [0, 1],
    [options?.scale?.from ?? 0.8, options?.scale?.to ?? 1]
  );
  const rotate = useTransform(
    scrollYProgress,
    [0, 1],
    [options?.rotate?.from ?? 0, options?.rotate?.to ?? 0]
  );
  const opacity = useTransform(
    scrollYProgress,
    [0, 1],
    [options?.opacity?.from ?? 0, options?.opacity?.to ?? 1]
  );
  
  return { ref, scale, rotate, opacity };
}

// Split text reveal - returns ref and visibility state
export function useSplitTextReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-15% 0px' });
  
  return { ref, isInView };
}

// Timeline sequence hook - just uses inView for triggering
export function useTimelineSequence() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: '-30% 0px' });
  
  return { ref: containerRef, isInView };
}

// Clip reveal hook
export function useClipReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-20% 0px' });
  
  return { ref, isInView };
}

// Counter animation hook
export function useCounterAnimation(endValue: number, duration: number = 2) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-20% 0px' });
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    if (!isInView) return;
    
    let startTime: number;
    let animationFrame: number;
    
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / (duration * 1000), 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(easeOut * endValue));
      
      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };
    
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [isInView, endValue, duration]);
  
  return { ref, count, isInView };
}

// Horizontal scroll progress hook
export function useHorizontalScrollProgress() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });
  
  return { containerRef, scrollYProgress };
}

// Pinned section scroll progress
export function usePinnedSection() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  });
  
  return { ref, scrollYProgress };
}

// Generic inView hook for simple reveals
export function useScrollReveal(margin: string = '-20% 0px') {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: margin as any });
  
  return { ref, isInView };
}
