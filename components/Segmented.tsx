'use client';

import { ReactNode, useId } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Screen-reader text when `label` is an icon. */
  srLabel?: string;
}

interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  'aria-label': string;
}

/**
 * The iOS segmented control. The indicator is a shared `layoutId` element, so
 * Motion FLIPs it between segments and we never compute geometry ourselves —
 * it also means clicking a third segment mid-flight retargets from wherever
 * the pill currently is rather than snapping.
 *
 * bounce: 0.15 is the whole trick. A linear slide reads as a web tab bar; that
 * barely-there overshoot is what makes it read as iOS. Keep it under 0.25.
 */
export default function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  'aria-label': ariaLabel,
}: SegmentedProps<T>) {
  const layoutId = useId();
  const reduced = useReducedMotion();

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('inline-flex gap-0.5 p-0.5', className)}
      style={{ background: 'var(--fill-3)', borderRadius: 'var(--radius-md)' }}
    >
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            type="button"
            aria-selected={isActive}
            aria-label={option.srLabel}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative flex min-h-[32px] items-center justify-center px-s5 text-subhead font-medium',
              'transition-[color,transform] duration-instant ease-out active:scale-[0.97]'
            )}
            style={{
              borderRadius: 'calc(var(--radius-md) - 2px)',
              color: isActive ? 'var(--label)' : 'var(--label-secondary)',
            }}
          >
            {isActive && (
              <motion.span
                layoutId={layoutId}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { type: 'spring', bounce: 0.15, visualDuration: 0.3 }
                }
                className="absolute inset-0"
                style={{
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'calc(var(--radius-md) - 2px)',
                  boxShadow: 'var(--shadow-1), 0 0 0 0.5px var(--separator)',
                }}
              />
            )}
            <span className="relative z-[1] flex items-center gap-1.5">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
