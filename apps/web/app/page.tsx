import type { Metadata } from 'next';
import HomeClient from './HomeClient';
import JsonLd from '@/components/JsonLd';
import { pageSchema, faqNode } from '@/lib/schema';
import { HOME_FAQS } from '@/data/faqs';

const TITLE = 'Uno Digit | AI & Digital Transformation Leader Sydney';
const DESCRIPTION =
  'We partner with forward-thinking enterprises in Sydney and Australia to build intelligent systems, custom AI solutions, and digital ecosystems that drive growth.';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, url: '/' },
};

export default function HomePage() {
  return (
    <>
      {/* The home page carries the FAQPage node as well as the entity graph.
          These are entity-level questions — what the company does, where it
          is, how engagements run — which is exactly the shape of question an
          answer engine is asked about a company, and a Question/Answer pair
          is the most directly quotable structure on the site. */}
      <JsonLd
        data={pageSchema({
          path: '/',
          title: TITLE,
          description: DESCRIPTION,
          extra: [faqNode('/', HOME_FAQS)],
        })}
      />
      <HomeClient />
    </>
  );
}
