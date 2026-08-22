import type { Metadata } from 'next';
import ContactClient from './ContactClient';
import JsonLd from '@/components/JsonLd';
import { pageMetadata } from '@/lib/metadata';
import { pageSchema } from '@/lib/schema';

const TITLE = 'Contact Us';
const DESCRIPTION =
  'Get in touch with Uno Digit. We are ready to help you transform your business with AI. Located in Sydney, Australia.';

export const metadata: Metadata = pageMetadata({
  path: '/contact',
  title: TITLE,
  description: DESCRIPTION,
  ogTitle: 'Contact Uno Digit | AI Consultancy Sydney',
  ogDescription: 'Get in touch with Uno Digit. We are ready to help you transform your business with AI.',
});

export default function ContactPage() {
  return (
    <>
      <JsonLd
        data={pageSchema({
          path: '/contact',
          title: TITLE,
          description: DESCRIPTION,
          pageType: 'ContactPage',
          breadcrumbs: [{ name: 'Contact', path: '/contact' }],
        })}
      />
      <ContactClient />
    </>
  );
}
