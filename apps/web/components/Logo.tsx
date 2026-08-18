interface LogoProps {
  className?: string;
  showText?: boolean;
  size?: number;
}

/**
 * The mark is the source of truth for the whole design system, so its two
 * colors stay literal here rather than going through the accent tokens — the
 * logo must render identically in light and dark. Everything else in the UI
 * derives from these two values.
 *
 * Geometry note: the stroke is 6 wide with round caps, so each cap already
 * describes a circle of r=3 at the stem tops. The violet nodes sit exactly on
 * those caps, which is why they read as part of the stroke rather than as
 * dots placed on top of it.
 */
export default function Logo({ className = '', showText = true, size = 30 }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Uno Digit"
        // saturate() on surrounding glass must not shift brand color
        style={{ flexShrink: 0, filter: 'none' }}
      >
        <path
          d="M11 11V21C11 25.9706 15.0294 30 20 30C24.9706 30 29 25.9706 29 21V11"
          stroke="#06b6d4"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="29" cy="11" r="3" fill="#8b5cf6" />
        <circle cx="11" cy="11" r="3" fill="#8b5cf6" />
      </svg>

      {showText && (
        <span
          className="font-semibold"
          style={{
            fontSize: 'var(--text-title-3)',
            letterSpacing: 'var(--tracking-snug)',
            color: 'var(--label)',
            lineHeight: 1,
          }}
        >
          Uno <span style={{ color: 'var(--accent-ink)' }}>Digit</span>
        </span>
      )}
    </span>
  );
}
