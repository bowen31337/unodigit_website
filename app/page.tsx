import type { Metadata } from 'next';
import HomeClient from './HomeClient';

export const metadata: Metadata = {
  title: 'Uno Digit | AI & Digital Transformation Leader Sydney',
  description: 'We partner with forward-thinking enterprises in Sydney and Australia to build intelligent systems, custom AI solutions, and digital ecosystems that drive growth.',
  openGraph: {
    title: 'Uno Digit | AI & Digital Transformation Leader Sydney',
    description: 'We partner with forward-thinking enterprises in Sydney and Australia to build intelligent systems, custom AI solutions, and digital ecosystems that drive growth.',
  },
};

export default function HomePage() {
  return <HomeClient />;
}

