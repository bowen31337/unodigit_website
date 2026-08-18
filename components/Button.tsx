import Link from 'next/link';
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'filled' | 'tinted' | 'glass' | 'plain';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  children: ReactNode;
  href?: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  type?: 'button' | 'submit';
  disabled?: boolean;
  onClick?: () => void;
  'aria-label'?: string;
}

const VARIANTS: Record<Variant, string> = {
  filled: 'btn-filled',
  tinted: 'btn-tinted',
  glass: 'btn-glass glass',
  plain: 'btn-plain',
};

const SIZES: Record<Size, string> = {
  sm: 'text-subhead px-s6 min-h-[36px]',
  md: '',
  lg: 'text-body px-s8 py-s5 min-h-[52px]',
};

/**
 * The single control primitive. Replaces MagneticButton — a cursor-chasing
 * button is the opposite of the Apple model, where a control is a fixed
 * physical target that responds to being pressed rather than one that moves
 * toward you before you touch it.
 *
 * Press feedback lives in CSS (`.btn:active { transform: scale(0.97) }`), which
 * means it fires on pointer-DOWN with zero latency and needs no JS. Capsule
 * radius and a 44px minimum height come from the token layer.
 */
export default function Button({
  children,
  href,
  variant = 'filled',
  size = 'md',
  className,
  type = 'button',
  disabled,
  onClick,
  'aria-label': ariaLabel,
}: ButtonProps) {
  const classes = cn('btn', VARIANTS[variant], SIZES[size], className);
  const isExternal = href?.startsWith('http') || href?.startsWith('mailto:');

  if (href) {
    return isExternal ? (
      <a
        href={href}
        className={classes}
        aria-label={ariaLabel}
        target={href.startsWith('http') ? '_blank' : undefined}
        rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
      >
        {children}
      </a>
    ) : (
      <Link href={href} className={classes} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      style={disabled ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
    >
      {children}
    </button>
  );
}
