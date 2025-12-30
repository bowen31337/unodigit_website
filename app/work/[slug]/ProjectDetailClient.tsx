'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { motion, useScroll, useTransform } from 'motion/react';
import { ArrowLeft, TrendingUp } from 'lucide-react';
import { Project, projects, featuredCase } from '@/data/projects';
import GlassCard from '@/components/GlassCard';

const allProjects = [featuredCase, ...projects];

const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

interface Props {
  project: Project;
}

export default function ProjectDetailClient({ project }: Props) {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  
  const bgY = useTransform(scrollYProgress, [0, 1], [0, 100]);

  return (
    <motion.main
      className="pt-24 min-h-screen"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.5 }}
    >
      {/* Header */}
      <section ref={heroRef} className="relative py-20 overflow-hidden">
        <motion.div 
          style={{ y: bgY }} 
          className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl" 
        />
        
        <div className="container mx-auto px-6 relative z-10">
          <Link href="/work" className="inline-flex items-center gap-2 text-muted hover:text-primary transition-colors mb-8">
            <ArrowLeft size={20} /> Back to Work
          </Link>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-4xl"
          >
            <div className="flex flex-wrap items-center gap-4 mb-6">
              <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
                {project.category}
              </span>
              {project.client && (
                <span className="text-muted text-sm border-l border-white/10 pl-4">
                  Client: {project.client}
                </span>
              )}
            </div>
            
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
              {project.title}
            </h1>
            
            <div className="flex items-center gap-3 text-xl md:text-2xl font-bold text-gradient">
              <TrendingUp className="text-primary" />
              {project.result}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Content */}
      <section className="pb-24">
        <div className="container mx-auto px-6">
          <div className="grid lg:grid-cols-12 gap-12">
            <div className="lg:col-span-8">
              <GlassCard className="p-8 md:p-12">
                <div className="prose prose-invert prose-lg max-w-none prose-headings:text-foreground prose-p:text-muted prose-strong:text-primary">
                  {project.content}
                </div>
              </GlassCard>
            </div>
            
            {/* Sidebar / Stats / Tags */}
            <div className="lg:col-span-4 space-y-8">
              <div className="sticky top-32">
                {project.tags && project.tags.length > 0 && (
                  <GlassCard className="p-6 mb-6">
                    <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">Technologies</h3>
                    <div className="flex flex-wrap gap-2">
                      {project.tags.map(tag => (
                        <span key={tag} className="px-3 py-1 bg-white/5 rounded-full text-xs text-primary-200">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </GlassCard>
                )}
                
                <h3 className="text-lg font-bold mb-4">More Projects</h3>
                <div className="space-y-4">
                  {allProjects
                    .filter(p => p.slug !== project.slug)
                    .slice(0, 3)
                    .map(related => (
                      <Link key={related.slug} href={`/work/${related.slug}`} className="block group">
                        <GlassCard className="p-4 hover:border-primary/30 transition-all">
                          <span className="text-xs text-primary font-medium">{related.category}</span>
                          <h4 className="font-semibold mt-1 mb-2 group-hover:text-primary transition-colors">
                            {related.title}
                          </h4>
                          <span className="text-xs text-muted block">{related.result}</span>
                        </GlassCard>
                      </Link>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </motion.main>
  );
}

