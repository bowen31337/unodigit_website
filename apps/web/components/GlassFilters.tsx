/**
 * The SVG displacement filter behind `.glass-liquid` — the iOS-26 "wet glass"
 * lensing where the backdrop bends at a panel's edge.
 *
 * Defined once at the document root and referenced by id. It is a progressive
 * enhancement: feeding url() into backdrop-filter is Chromium-only today, and
 * globals.css has an @supports fallback so every other browser gets clean
 * Recipe-1 glass instead. Restrained on purpose — scale above ~25 stops
 * looking like glass and starts looking like a funhouse mirror.
 */
export default function GlassFilters() {
  return (
    <svg
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
    >
      <defs>
        <filter id="uno-liquid-refraction" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.008 0.012"
            numOctaves="2"
            seed="4"
            result="noise"
          />
          <feGaussianBlur in="noise" stdDeviation="2" result="soft" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="soft"
            scale="16"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
