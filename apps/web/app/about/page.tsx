import type { Metadata } from 'next';
import AboutClient from './AboutClient';
import JsonLd from '@/components/JsonLd';
import { pageMetadata } from '@/lib/metadata';
import { pageSchema } from '@/lib/schema';

const TITLE = 'About Us';
const DESCRIPTION =
  'Learn about Uno Digit, a Sydney-based AI consultancy. Meet our team of experts dedicated to democratizing AI technology for enterprises.';

export const metadata: Metadata = pageMetadata({
  path: '/about',
  title: TITLE,
  description: DESCRIPTION,
  ogTitle: 'About Uno Digit | AI Consultancy Sydney',
  ogDescription:
    'Learn about Uno Digit, a Sydney-based AI consultancy helping enterprises harness the power of artificial intelligence.',
});

export default function AboutPage() {
  return (
    <>
      <JsonLd
        data={pageSchema({
          path: '/about',
          title: TITLE,
          description: DESCRIPTION,
          pageType: 'AboutPage',
          breadcrumbs: [{ name: 'About', path: '/about' }],
        })}
      />
      <AboutClient />
    </>
  );
}
