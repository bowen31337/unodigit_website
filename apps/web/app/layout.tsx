import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SITE_URL, ORG } from '@/lib/site';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ThemeProvider from '@/components/ThemeProvider';
import GlassFilters from '@/components/GlassFilters';
import BaBot from '@/components/BaBot';

export const metadata: Metadata = {
  /**
   * Without metadataBase, Next resolves og:image / og:url against no origin at
   * all and emits relative paths. Crawlers and social scrapers need absolute
   * URLs, so every OpenGraph image and canonical on the site was unusable.
   *
   * NOTE: no default `alternates.canonical` here on purpose. Child metadata
   * inherits what the layout sets, so a canonical of '/' in this file would
   * make every page on the site declare the home page as its canonical — the
   * fastest way to deindex a whole site. Each page sets its own.
   */
  metadataBase: new URL(SITE_URL),
  applicationName: ORG.name,
  title: {
    default: 'Uno Digit | AI & Digital Transformation Sydney',
    template: '%s | Uno Digit',
  },
  description:
    "Sydney's Leading AI Consultancy. We partner with forward-thinking enterprises to build intelligent systems that drive growth, efficiency, and competitive advantage.",
  keywords: ['AI', 'Digital Transformation', 'Machine Learning', 'Sydney', 'Australia', 'AI Consulting', 'Enterprise AI'],
  authors: [{ name: 'Uno Digit' }],
  creator: 'Uno Digit',
  openGraph: {
    type: 'website',
    locale: 'en_AU',
    url: 'https://unodigit.com.au',
    siteName: 'Uno Digit',
    title: 'Uno Digit | AI & Digital Transformation Sydney',
    description: "Sydney's Leading AI Consultancy helping enterprises harness the power of artificial intelligence.",
    // There was no og:image at all, so every share and every AI-generated
    // preview card rendered blank. Inherited by every page unless overridden.
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Uno Digit — AI and digital transformation consultancy, Sydney' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Uno Digit | AI & Digital Transformation Sydney',
    description: "Sydney's Leading AI Consultancy helping enterprises harness the power of artificial intelligence.",
    images: ['/og.png'],
  },
  robots: {
    index: true,
    follow: true,
    // Explicitly invite the rich snippets that answer engines and search
    // results build previews from. Defaults are conservative and truncate.
    googleBot: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
      'max-video-preview': -1,
    },
  },
  // Sydney-first geography, stated where it is machine-readable rather than
  // only in prose. The canonical geo signal is the PostalAddress + areaServed
  // in the JSON-LD graph; these are the lightweight corroborating hints.
  other: {
    'geo.region': 'AU-NSW',
    'geo.placename': ORG.address.locality,
  },
};

/**
 * Two theme-colors so mobile Safari tints its chrome to match the page in
 * both modes — the browser UI is part of the material continuity.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
  /**
   * `viewportFit: 'cover'` is what makes `env(safe-area-inset-*)` resolve to
   * anything but 0. Without it those insets are inert, and the three fixed
   * surfaces here — the floating navbar, the footer and the BaBot sheet —
   * sit underneath the iPhone home indicator and the Dynamic Island in
   * landscape. Nothing in this codebase referenced safe areas before.
   */
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: next-themes writes data-theme on <html> before
    // React hydrates, which is intentionally a server/client mismatch.
    <html lang="en" suppressHydrationWarning>
      {/*
        No <head> element here on purpose. React 19 — which Next 16's App
        Router builds on — treats <link rel="preload"> as a HOISTABLE resource
        and lifts it into <head> from wherever it appears. Writing it literally
        inside <head> as well produced TWO copies of each preload in the built
        HTML (visible by their differing attribute order). Browsers dedupe
        preloads by URL so nothing downloaded twice, but it is noise a
        Lighthouse audit flags. Let the hoisting mechanism place them.

        `crossOrigin` is REQUIRED even though these are same-origin: fonts are
        always fetched in CORS mode, and a preload without it is keyed as a
        different request than the one @font-face makes, so the file downloads
        twice and the preload buys nothing.

        Only the two faces that paint above the fold are preloaded. Uno Display
        700 renders the hero H1 — the LCP element on every page — for 4.6 KB.
        Uno Sans latin (67.3 KB) covers everything else. Italic, mono and
        latin-ext are deliberately NOT preloaded: a browser fetches a font only
        when a glyph needs it, so they cost nothing on pages that never use one.
      */}
      <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      <link
        rel="preload"
        href="/fonts/uno-sans-latin.woff2"
        as="font"
        type="font/woff2"
        crossOrigin="anonymous"
      />
      <link
        rel="preload"
        href="/fonts/uno-display-700.woff2"
        as="font"
        type="font/woff2"
        crossOrigin="anonymous"
      />
      {/* 100dvh, not Tailwind's `min-h-screen` (= 100vh): on iOS Safari 100vh
          includes the collapsing URL bar, which is the classic scroll jump. */}
      <body className="min-h-[100dvh] antialiased">
        <ThemeProvider>
          <GlassFilters />
          <a
            href="#main"
            className="btn btn-filled sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100]"
          >
            Skip to content
          </a>
          <Navbar />
          <main id="main">{children}</main>
          <Footer />
          {/* Mounted here, not per-page, so the interview survives client-side
              navigation between routes. Renders nothing when the bot API URL
              is not configured at build time. */}
          <BaBot />
        </ThemeProvider>
      </body>
    </html>
  );
}
