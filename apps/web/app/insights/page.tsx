import type { Metadata } from 'next';
import InsightsClient from './InsightsClient';

export const metadata: Metadata = {
  title: 'AI Insights & Tech Blog',
  description: 'Stay updated with the latest trends in Artificial Intelligence, Machine Learning, and Enterprise Digital Transformation.',
  openGraph: {
    title: 'AI Insights & Tech Blog | Uno Digit',
    description: 'Stay updated with the latest trends in Artificial Intelligence, Machine Learning, and Enterprise Digital Transformation.',
  },
};

export default function InsightsPage() {
  return <InsightsClient />;
}

