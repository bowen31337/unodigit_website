import type { Metadata } from 'next';
import ServicesClient from './ServicesClient';

export const metadata: Metadata = {
  title: 'AI Services & Web Development',
  description: 'Comprehensive AI strategies, Machine Learning solutions, and Web Development services for Australian businesses. Transform your operations today.',
  openGraph: {
    title: 'AI Services & Web Development | Uno Digit Sydney',
    description: 'Comprehensive AI strategies, Machine Learning solutions, and Web Development services for Australian businesses.',
  },
};

export default function ServicesPage() {
  return <ServicesClient />;
}

