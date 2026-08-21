import type { Metadata } from 'next';
import WorkClient from './WorkClient';
import JsonLd from '@/components/JsonLd';
import { pageSchema, itemListNode } from '@/lib/schema';
import { projects, featuredCase } from '@/data/projects';

const TITLE = 'Our Work & Case Studies';
const DESCRIPTION =
  'Explore our portfolio of successful AI implementation, data science projects, and digital transformation case studies across various industries.';

const seen = new Set<string>();
const allProjects = [featuredCase, ...projects].filter((p) =>
  seen.has(p.slug) ? false : seen.add(p.slug),
);

export const metadata: Metadata = {
  alternates: { canonical: '/work' },
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: 'Our Work & Case Studies | Uno Digit',
    description: 'Explore our portfolio of successful AI implementation, data science projects, and digital transformation case studies.',
    url: '/work',
  },
};

export default function WorkPage() {
  return (
    <>
      <JsonLd
        data={pageSchema({
          path: '/work',
          title: TITLE,
          description: DESCRIPTION,
          pageType: 'CollectionPage',
          breadcrumbs: [{ name: 'Work', path: '/work' }],
          extra: [
            itemListNode(
              '/work',
              allProjects.map((p) => ({ name: p.title, path: `/work/${p.slug}` })),
            ),
          ],
        })}
      />
      <WorkClient />
    </>
  );
}
