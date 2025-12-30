'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { motion, useScroll, useTransform } from 'motion/react';
import { ArrowLeft, Clock, Tag, Calendar } from 'lucide-react';
import { Article, articles } from '@/data/articles';
import GlassCard from '@/components/GlassCard';

const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

interface Props {
  article: Article;
}

export default function ArticleDetailClient({ article }: Props) {
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
          <Link href="/insights" className="inline-flex items-center gap-2 text-muted hover:text-primary transition-colors mb-8">
            <ArrowLeft size={20} /> Back to Insights
          </Link>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-4xl"
          >
            <div className="flex flex-wrap items-center gap-4 mb-6 text-sm">
              <span className="px-3 py-1 bg-primary/10 text-primary rounded-full flex items-center gap-2">
                <Tag size={14} /> {article.category}
              </span>
              <span className="text-muted flex items-center gap-2">
                <Calendar size={14} /> {article.date}
              </span>
              <span className="text-muted flex items-center gap-2">
                <Clock size={14} /> {article.readTime}
              </span>
            </div>
            
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
              {article.title}
            </h1>
            <p className="text-xl text-muted max-w-2xl">
              {article.excerpt}
            </p>
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
                  {article.content}
                </div>
              </GlassCard>
            </div>
            
            {/* Sidebar / Related */}
            <div className="lg:col-span-4 space-y-8">
              <div className="sticky top-32">
                <h3 className="text-lg font-bold mb-4">Related Insights</h3>
                <div className="space-y-4">
                  {articles
                    .filter(a => a.slug !== article.slug)
                    .slice(0, 3)
                    .map(related => (
                      <Link key={related.slug} href={`/insights/${related.slug}`} className="block group">
                        <GlassCard className="p-4 hover:border-primary/30 transition-all">
                          <h4 className="font-semibold mb-2 group-hover:text-primary transition-colors">
                            {related.title}
                          </h4>
                          <span className="text-xs text-muted">{related.date}</span>
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

