import type { Config } from 'tailwindcss';

/**
 * Tailwind is the bridge to the token layer in app/globals.css — it never
 * defines a value of its own. Every color resolves to a CSS custom property so
 * light/dark and the prefers-* fallbacks flow through utilities automatically.
 *
 * Colors written as `rgb(var(--c-x) / <alpha-value>)` support Tailwind's slash
 * opacity modifier (`bg-accent/12`); the ones pointing straight at a var() do
 * not, because the var already carries its own alpha.
 */
const config: Config = {
  // Dark mode is driven by the [data-theme] attribute set by next-themes, with
  // prefers-color-scheme handled inside globals.css for the no-JS case.
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './data/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: '1.5rem', lg: '2rem' },
      screens: { '2xl': '1200px' },
    },
    extend: {
      colors: {
        /* --- Brand ramps, generated from public/logo.png --- */
        cyan: {
          50: 'var(--cyan-50)',
          100: 'var(--cyan-100)',
          200: 'var(--cyan-200)',
          300: 'var(--cyan-300)',
          400: 'var(--cyan-400)',
          500: 'var(--cyan-500)',
          600: 'var(--cyan-600)',
          700: 'var(--cyan-700)',
          800: 'var(--cyan-800)',
          900: 'var(--cyan-900)',
        },
        violet: {
          50: 'var(--violet-50)',
          100: 'var(--violet-100)',
          200: 'var(--violet-200)',
          300: 'var(--violet-300)',
          400: 'var(--violet-400)',
          500: 'var(--violet-500)',
          600: 'var(--violet-600)',
          700: 'var(--violet-700)',
          800: 'var(--violet-800)',
          900: 'var(--violet-900)',
        },

        /* --- Accent: two tracks. `accent` is graphics-only (the literal logo
           cyan, 2.43:1 on white); `accent-ink` is the contrast-safe text one. --- */
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        'accent-ink': 'rgb(var(--c-accent-ink) / <alpha-value>)',
        'accent-solid': 'var(--accent-solid)',
        'on-accent': 'var(--on-accent)',
        'accent-2': 'rgb(var(--c-accent-2) / <alpha-value>)',
        'accent-2-ink': 'var(--accent-2-ink)',

        /* --- Semantic surfaces --- */
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        'bg-secondary': 'var(--bg-secondary)',
        'bg-tertiary': 'var(--bg-tertiary)',
        'bg-grouped': 'var(--bg-grouped)',

        /* --- Labels: opacity-encoded hierarchy over a base ink --- */
        label: 'rgb(var(--c-label) / <alpha-value>)',
        'label-secondary': 'var(--label-secondary)',
        'label-tertiary': 'var(--label-tertiary)',
        'label-quaternary': 'var(--label-quaternary)',

        separator: 'var(--separator)',
        'fill-1': 'var(--fill-1)',
        'fill-2': 'var(--fill-2)',
        'fill-3': 'var(--fill-3)',
        'fill-4': 'var(--fill-4)',

        /* --- Back-compat aliases so any un-migrated markup still resolves --- */
        background: 'rgb(var(--c-bg) / <alpha-value>)',
        foreground: 'rgb(var(--c-label) / <alpha-value>)',
        muted: 'var(--label-secondary)',
        surface: 'var(--bg-secondary)',
        border: 'var(--separator)',
        primary: {
          DEFAULT: 'rgb(var(--c-accent) / <alpha-value>)',
          600: 'var(--cyan-600)',
        },
        secondary: {
          DEFAULT: 'rgb(var(--c-accent-2) / <alpha-value>)',
          600: 'var(--violet-600)',
        },
      },

      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },

      /* Apple's text styles. Each is a set — size paired with the leading and
         tracking that belong to it, so you can't accidentally split them. */
      fontSize: {
        'large-title': ['var(--text-large-title)', { lineHeight: '1.1', letterSpacing: 'var(--tracking-tight)' }],
        'title-1': ['var(--text-title-1)', { lineHeight: '1.15', letterSpacing: 'var(--tracking-tight)' }],
        'title-2': ['var(--text-title-2)', { lineHeight: 'var(--leading-snug)', letterSpacing: 'var(--tracking-snug)' }],
        'title-3': ['var(--text-title-3)', { lineHeight: 'var(--leading-snug)', letterSpacing: 'var(--tracking-snug)' }],
        headline: ['var(--text-headline)', { lineHeight: 'var(--leading-snug)', letterSpacing: 'var(--tracking-normal)' }],
        body: ['var(--text-body)', { lineHeight: 'var(--leading-normal)', letterSpacing: 'var(--tracking-normal)' }],
        callout: ['var(--text-callout)', { lineHeight: 'var(--leading-normal)' }],
        subhead: ['var(--text-subhead)', { lineHeight: 'var(--leading-normal)' }],
        footnote: ['var(--text-footnote)', { lineHeight: 'var(--leading-normal)', letterSpacing: 'var(--tracking-wide)' }],
        'caption-1': ['var(--text-caption-1)', { lineHeight: 'var(--leading-normal)', letterSpacing: 'var(--tracking-wide)' }],
        'caption-2': ['var(--text-caption-2)', { lineHeight: 'var(--leading-normal)', letterSpacing: 'var(--tracking-wide)' }],
      },

      letterSpacing: {
        tight: 'var(--tracking-tight)',
        snug: 'var(--tracking-snug)',
        normal: 'var(--tracking-normal)',
        wide: 'var(--tracking-wide)',
      },

      lineHeight: {
        tight: 'var(--leading-tight)',
        snug: 'var(--leading-snug)',
        normal: 'var(--leading-normal)',
        relaxed: 'var(--leading-relaxed)',
      },

      fontWeight: {
        regular: 'var(--weight-regular)',
        medium: 'var(--weight-medium)',
        semibold: 'var(--weight-semibold)',
        bold: 'var(--weight-bold)',
      },

      /* 4/8pt grid, as named steps alongside Tailwind's numeric scale. */
      spacing: {
        's1': 'var(--space-1)', 's2': 'var(--space-2)', 's3': 'var(--space-3)',
        's4': 'var(--space-4)', 's5': 'var(--space-5)', 's6': 'var(--space-6)',
        's7': 'var(--space-7)', 's8': 'var(--space-8)', 's9': 'var(--space-9)',
        's10': 'var(--space-10)', 's12': 'var(--space-12)',
      },

      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        capsule: 'var(--radius-capsule)',
      },

      boxShadow: {
        1: 'var(--shadow-1)',
        2: 'var(--shadow-2)',
        3: 'var(--shadow-3)',
        4: 'var(--shadow-4)',
        glass: 'var(--shadow-glass)',
      },

      transitionTimingFunction: {
        out: 'var(--ease-out)',
        'in-out': 'var(--ease-in-out)',
        ios: 'var(--ease-ios)',
        snappy: 'var(--ease-snappy)',
      },

      transitionDuration: {
        instant: '100ms',
        fast: '200ms',
        base: '300ms',
        slow: '450ms',
      },

      backdropBlur: {
        thin: 'var(--material-blur-thin)',
        DEFAULT: 'var(--material-blur)',
        thick: '34px',
      },

      /* The only ambient motion that survives the redesign: a very slow drift
         on the background mesh. Everything interactive uses springs in JS. */
      keyframes: {
        'mesh-drift': {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1)' },
          '50%': { transform: 'translate3d(2%, -3%, 0) scale(1.06)' },
        },
      },
      animation: {
        'mesh-drift': 'mesh-drift 24s var(--ease-in-out) infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
