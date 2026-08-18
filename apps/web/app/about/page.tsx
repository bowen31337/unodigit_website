import type { Metadata } from 'next';
import AboutClient from './AboutClient';

export const metadata: Metadata = {
  title: 'About Us',
  description: 'Learn about Uno Digit, a Sydney-based AI consultancy. Meet our team of experts dedicated to democratizing AI technology for enterprises.',
  openGraph: {
    title: 'About Uno Digit | AI Consultancy Sydney',
    description: 'Learn about Uno Digit, a Sydney-based AI consultancy helping enterprises harness the power of artificial intelligence.',
  },
};

export default function AboutPage() {
  return <AboutClient />;
}

