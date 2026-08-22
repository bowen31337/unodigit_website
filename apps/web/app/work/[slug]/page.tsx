import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { projects, featuredCase } from '@/data/projects';
import ProjectDetailClient from './ProjectDetailClient';
import JsonLd from '@/components/JsonLd';
import { pageSchema, caseStudyNode } from '@/lib/schema';
import { pageMetadata } from '@/lib/metadata';

interface Props {
  params: Promise<{ slug: string }>;
}

const allProjects = [featuredCase, ...projects];

export async function generateStaticParams() {
  return allProjects.map((project) => ({
    slug: project.slug,
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const project = allProjects.find((p) => p.slug === slug);
  
  if (!project) {
    return {
      title: 'Project Not Found',
    };
  }

  return pageMetadata({
    path: `/work/${slug}`,
    title: `${project.title} | Case Study`,
    description: project.description,
    ogTitle: `${project.title} | Uno Digit Case Study`,
    type: 'article',
    section: project.category,
  });
}

export default async function ProjectDetailPage({ params }: Props) {
  const { slug } = await params;
  const project = allProjects.find((p) => p.slug === slug);

  if (!project) {
    notFound();
  }

  const path = `/work/${slug}`;

  return (
    <>
      <JsonLd
        data={pageSchema({
          path,
          title: project.title,
          description: project.description,
          breadcrumbs: [
            { name: 'Work', path: '/work' },
            { name: project.title, path },
          ],
          extra: [
            caseStudyNode({
              path,
              title: project.title,
              description: project.description,
              category: project.category,
              result: project.result,
              tags: project.tags,
            }),
          ],
        })}
      />
      <ProjectDetailClient project={project} />
    </>
  );
}

