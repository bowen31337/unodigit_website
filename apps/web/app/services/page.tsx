import type { Metadata } from 'next';
import ServicesClient from './ServicesClient';
import JsonLd from '@/components/JsonLd';
import { pageMetadata } from '@/lib/metadata';
import { pageSchema } from '@/lib/schema';

const TITLE = 'AI Services & Web Development';
const DESCRIPTION =
  'Comprehensive AI strategies, Machine Learning solutions, and Web Development services for Australian businesses. Transform your operations today.';

export const metadata: Metadata = pageMetadata({
  path: '/services',
  title: TITLE,
  description: DESCRIPTION,
  ogTitle: 'AI Services & Web Development | Uno Digit Sydney',
  ogDescription: 'Comprehensive AI strategies, Machine Learning solutions, and Web Development services for Australian businesses.',
});

export default function ServicesPage() {
  return (
    <>
      {/* The six services already ride on the Organization node as an
          OfferCatalog, so this page does not re-declare them as loose Service
          nodes — that would be the same six offerings asserted twice with no
          relationship between the copies. */}
      <JsonLd
        data={pageSchema({
          path: '/services',
          title: TITLE,
          description: DESCRIPTION,
          pageType: 'CollectionPage',
          breadcrumbs: [{ name: 'Services', path: '/services' }],
        })}
      />
      <ServicesClient />
    </>
  );
}
