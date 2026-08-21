import type { Metadata } from 'next';
import InsightsClient from './InsightsClient';
import JsonLd from '@/components/JsonLd';
import { pageSchema, itemListNode } from '@/lib/schema';
import { articles } from '@/data/articles';

const TITLE = 'AI Insights & Tech Blog';
const DESCRIPTION =
  'Stay updated with the latest trends in Artificial Intelligence, Machine Learning, and Enterprise Digital Transformation.';

export const metadata: Metadata = {
  alternates: { canonical: '/insights' },
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: 'AI Insights & Tech Blog | Uno Digit',
    description: DESCRIPTION,
    url: '/insights',
  },
};

export default function InsightsPage() {
  return (
    <>
      <JsonLd
        data={pageSchema({
          path: '/insights',
          title: TITLE,
          description: DESCRIPTION,
          pageType: 'CollectionPage',
          breadcrumbs: [{ name: 'Insights', path: '/insights' }],
          extra: [
            itemListNode(
              '/insights',
              articles.map((a) => ({ name: a.title, path: `/insights/${a.slug}` })),
            ),
          ],
        })}
      />
      <InsightsClient />
    </>
  );
}
