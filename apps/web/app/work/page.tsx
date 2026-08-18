import type { Metadata } from 'next';
import WorkClient from './WorkClient';

export const metadata: Metadata = {
  title: 'Our Work & Case Studies',
  description: 'Explore our portfolio of successful AI implementation, data science projects, and digital transformation case studies across various industries.',
  openGraph: {
    title: 'Our Work & Case Studies | Uno Digit',
    description: 'Explore our portfolio of successful AI implementation, data science projects, and digital transformation case studies.',
  },
};

export default function WorkPage() {
  return <WorkClient />;
}

