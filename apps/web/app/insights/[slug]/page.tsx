import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { articles } from '@/data/articles';
import ArticleDetailClient from './ArticleDetailClient';
import JsonLd from '@/components/JsonLd';
import { pageSchema, articleNode } from '@/lib/schema';
import { pageMetadata } from '@/lib/metadata';
import { toIsoDate } from '@/lib/site';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return articles.map((article) => ({
    slug: article.slug,
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = articles.find((a) => a.slug === slug);
  
  if (!article) {
    return {
      title: 'Article Not Found',
    };
  }

  return pageMetadata({
    path: `/insights/${slug}`,
    title: article.title,
    description: article.excerpt,
    ogTitle: `${article.title} | Uno Digit Insights`,
    type: 'article',
    // `article.date` is a DISPLAY string ("Dec 15, 2024"). It was handed to
    // publishedTime verbatim, which requires ISO 8601 — an unparseable date
    // that consumers drop rather than guess at.
    publishedTime: toIsoDate(article.date),
    section: article.category,
  });
}

export default async function ArticleDetailPage({ params }: Props) {
  const { slug } = await params;
  const article = articles.find((a) => a.slug === slug);

  if (!article) {
    notFound();
  }

  const path = `/insights/${slug}`;

  return (
    <>
      <JsonLd
        data={pageSchema({
          path,
          title: article.title,
          description: article.excerpt,
          breadcrumbs: [
            { name: 'Insights', path: '/insights' },
            { name: article.title, path },
          ],
          extra: [
            articleNode({
              path,
              title: article.title,
              excerpt: article.excerpt,
              isoDate: toIsoDate(article.date),
              category: article.category,
            }),
          ],
        })}
      />
      <ArticleDetailClient article={article} />
    </>
  );
}

