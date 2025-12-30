import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'motion/react';
import { ArrowRight, Clock, Tag, Send } from 'lucide-react';
import GlassCard from '../components/GlassCard';
import SEO from '../components/SEO';
import { articles } from '../data/articles';

// Featured article is the first one in the list for this example
const featuredArticle = articles[0];
const recentArticles = articles.slice(1);

const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.1 } },
};

const fadeInUp = {
  initial: { opacity: 0, y: 60, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.8, ease: [0.25, 0.1, 0.25, 1] } },
};

export default function Insights() {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  
  const bgY1 = useTransform(scrollYProgress, [0, 1], [0, 100]);
  const bgY2 = useTransform(scrollYProgress, [0, 1], [0, 150]);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    setSubscribed(true);
  };

  return (
    <motion.main
      className="pt-24"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.5 }}
    >
      <SEO 
        title="AI Insights & Tech Blog | Uno Digit"
        description="Stay updated with the latest trends in Artificial Intelligence, Machine Learning, and Enterprise Digital Transformation."
        canonical="/insights"
        schema={{
          "@context": "https://schema.org",
          "@type": "Blog",
          "name": "Uno Digit Insights",
          "description": "Thoughts on AI and Digital Transformation"
        }}
      />
      {/* Hero */}
      <section ref={heroRef} className="py-24 relative overflow-hidden">
        <motion.div 
          style={{ y: bgY1 }} 
          className="absolute -top-20 left-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl" 
        />
        <motion.div 
          style={{ y: bgY2 }} 
          className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-secondary/5 rounded-full blur-3xl" 
        />
        
        <div className="container mx-auto px-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-4xl"
          >
            <span className="text-primary font-medium mb-4 block">Insights</span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
              Thought Leadership & <span className="text-gradient">Industry Insights</span>
            </h1>
            <p className="text-xl text-muted max-w-2xl">
              Stay ahead of the curve with our latest thinking on AI, technology, 
              and digital transformation.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Featured Article */}
      <section className="py-12">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <Link to={`/insights/${featuredArticle.slug}`}>
              <GlassCard className="p-0 overflow-hidden cursor-pointer group">
                <div className="grid lg:grid-cols-2">
                  <motion.div 
                    className="bg-gradient-to-br from-primary/20 to-secondary/20 min-h-[300px] flex items-center justify-center overflow-hidden"
                    initial={{ clipPath: 'inset(100% 0% 0% 0%)' }}
                    whileInView={{ clipPath: 'inset(0% 0% 0% 0%)' }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.2, ease: [0.25, 0.1, 0.25, 1] }}
                  >
                    <motion.div 
                      className="text-8xl font-bold text-white/10"
                      whileHover={{ scale: 1.1 }}
                      transition={{ duration: 0.5 }}
                    >
                      AI
                    </motion.div>
                  </motion.div>
                  <motion.div 
                    className="p-12 lg:p-16 flex flex-col justify-center"
                    initial="initial"
                    whileInView="animate"
                    viewport={{ once: true }}
                  >
                    <motion.div 
                      className="flex items-center gap-4 mb-4"
                      initial={{ opacity: 0, y: 30 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                    >
                      <span className="px-3 py-1 bg-primary/10 text-primary text-sm rounded-full">
                        {featuredArticle.category}
                      </span>
                      <span className="text-muted text-sm flex items-center gap-1">
                        <Clock size={14} /> {featuredArticle.readTime}
                      </span>
                    </motion.div>
                    <motion.h2 
                      className="text-2xl md:text-3xl font-bold mb-4 group-hover:text-primary transition-colors"
                      initial={{ opacity: 0, y: 30 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      {featuredArticle.title}
                    </motion.h2>
                    <motion.p 
                      className="text-muted mb-6"
                      initial={{ opacity: 0, y: 30 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                    >
                      {featuredArticle.excerpt}
                    </motion.p>
                    <motion.div 
                      className="flex items-center justify-between"
                      initial={{ opacity: 0, y: 30 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                    >
                      <span className="text-sm text-muted">{featuredArticle.date}</span>
                      <span className="text-primary flex items-center gap-1 group-hover:gap-2 transition-all">
                        Read Article <ArrowRight size={16} />
                      </span>
                    </motion.div>
                  </motion.div>
                </div>
              </GlassCard>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Articles Grid */}
      <section className="py-24">
        <div className="container mx-auto px-6">
          <motion.h2 
            className="text-3xl md:text-4xl font-bold mb-12"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            Recent Articles
          </motion.h2>

          <motion.div 
            className="grid md:grid-cols-2 lg:grid-cols-3 gap-8"
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: '-20%' }}
          >
            {recentArticles.map((article) => (
              <motion.div key={article.slug} variants={fadeInUp}>
                <Link to={`/insights/${article.slug}`}>
                  <GlassCard className="h-full group cursor-pointer hover:border-primary/30 transition-all">
                    <div className="flex items-center gap-2 mb-4">
                      <Tag size={14} className="text-primary" />
                      <span className="text-xs text-primary">{article.category}</span>
                    </div>
                    <h3 className="text-lg font-semibold mb-3 group-hover:text-primary transition-colors">
                      {article.title}
                    </h3>
                    <p className="text-muted text-sm mb-4">{article.excerpt}</p>
                    <div className="flex items-center justify-between text-sm text-muted mt-auto pt-4 border-t border-white/5">
                      <span>{article.date}</span>
                      <span className="flex items-center gap-1">
                        <Clock size={12} /> {article.readTime}
                      </span>
                    </div>
                  </GlassCard>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Newsletter */}
      <section className="py-24 bg-surface/50">
        <div className="container mx-auto px-6">
          <motion.div 
            className="max-w-2xl mx-auto text-center"
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
          >
            <motion.h2 
              className="text-3xl md:text-4xl font-bold mb-4"
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0 }}
            >
              Stay Updated
            </motion.h2>
            <motion.p 
              className="text-muted mb-8"
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.15 }}
            >
              Subscribe to our newsletter for the latest insights on AI, technology, and digital transformation.
            </motion.p>

            {subscribed ? (
              <motion.div 
                className="glass rounded-xl p-8"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', bounce: 0.4 }}
              >
                <p className="text-primary font-medium">Thanks for subscribing! Check your inbox for confirmation.</p>
              </motion.div>
            ) : (
              <motion.form 
                onSubmit={handleSubscribe} 
                className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto"
                initial={{ opacity: 0, y: 40, scale: 0.95 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.3 }}
              >
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="Enter your email"
                  className="flex-1 px-6 py-4 bg-white/5 border border-white/10 rounded-full focus:outline-none focus:border-primary transition-colors"
                />
                <motion.button
                  type="submit"
                  className="px-8 py-4 bg-primary text-background font-semibold rounded-full hover:bg-primary-600 transition-colors flex items-center justify-center gap-2"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Subscribe <Send size={18} />
                </motion.button>
              </motion.form>
            )}
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="container mx-auto px-6">
          <motion.div 
            className="text-center"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Want to Learn More?</h2>
            <p className="text-muted max-w-xl mx-auto mb-8">
              Get in touch to discuss how these insights can apply to your business.
            </p>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link
                to="/contact"
                className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-background font-semibold rounded-full hover:bg-primary-600 transition-colors"
              >
                Contact Us <ArrowRight size={20} />
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>
    </motion.main>
  );
}
