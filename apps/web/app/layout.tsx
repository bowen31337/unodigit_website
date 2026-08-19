import type { Metadata, Viewport } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ThemeProvider from '@/components/ThemeProvider';
import GlassFilters from '@/components/GlassFilters';
import BaBot from '@/components/BaBot';

export const metadata: Metadata = {
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
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Uno Digit | AI & Digital Transformation Sydney',
    description: "Sydney's Leading AI Consultancy helping enterprises harness the power of artificial intelligence.",
  },
  robots: { index: true, follow: true },
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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: next-themes writes data-theme on <html> before
    // React hydrates, which is intentionally a server/client mismatch.
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body className="min-h-screen antialiased">
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
