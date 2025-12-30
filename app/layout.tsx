import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: {
    default: 'Uno Digit | AI & Digital Transformation Sydney',
    template: '%s | Uno Digit',
  },
  description: 'Sydney\'s Leading AI Consultancy. We partner with forward-thinking enterprises to build intelligent systems that drive growth, efficiency, and competitive advantage.',
  keywords: ['AI', 'Digital Transformation', 'Machine Learning', 'Sydney', 'Australia', 'AI Consulting', 'Enterprise AI'],
  authors: [{ name: 'Uno Digit' }],
  creator: 'Uno Digit',
  openGraph: {
    type: 'website',
    locale: 'en_AU',
    url: 'https://unodigit.com.au',
    siteName: 'Uno Digit',
    title: 'Uno Digit | AI & Digital Transformation Sydney',
    description: 'Sydney\'s Leading AI Consultancy helping enterprises harness the power of artificial intelligence.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Uno Digit | AI & Digital Transformation Sydney',
    description: 'Sydney\'s Leading AI Consultancy helping enterprises harness the power of artificial intelligence.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body className="min-h-screen bg-background antialiased">
        <Navbar />
        {children}
        <Footer />
      </body>
    </html>
  );
}

