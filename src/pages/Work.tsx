import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform, useSpring } from 'motion/react';
import { ArrowRight, ExternalLink, TrendingUp } from 'lucide-react';
import GlassCard from '../components/GlassCard';
import SEO from '../components/SEO';

const featuredCase = {
  title: 'AI-Powered Logistics Optimization',
  client: 'TransCorp International',
  result: '40% reduction in delivery costs',
  description: 'Implemented machine learning algorithms to optimize route planning and demand forecasting for a major logistics provider.',
  tags: ['Machine Learning', 'Python', 'AWS'],
};

const projects = [
  {
    title: 'Predictive Maintenance Platform',
    client: 'Industrial Co',
    category: 'AI/ML',
    result: '$2M saved annually',
    description: 'IoT sensor data analysis for predictive equipment maintenance.',
  },
  {
    title: 'E-Commerce Recommendation Engine',
    client: 'RetailMax',
    category: 'Data Science',
    result: '35% increase in sales',
    description: 'Personalized product recommendations using collaborative filtering.',
  },
  {
    title: 'Healthcare Analytics Dashboard',
    client: 'MediCare Plus',
    category: 'Web Development',
    result: '60% faster insights',
    description: 'Real-time analytics platform for patient outcome tracking.',
  },
  {
    title: 'Fintech Mobile App',
    client: 'PayStream',
    category: 'Mobile',
    result: '500K+ downloads',
    description: 'Cross-platform mobile banking application with biometric security.',
  },
  {
    title: 'Supply Chain Automation',
    client: 'GlobalTrade',
    category: 'Automation',
    result: '75% process automation',
    description: 'End-to-end supply chain digitization with AI-driven insights.',
  },
  {
    title: 'Customer Service Chatbot',
    client: 'ServiceFirst',
    category: 'NLP',
    result: '80% query resolution',
    description: 'Intelligent chatbot handling customer inquiries 24/7.',
  },
];

const stats = [
  { value: '$50M+', label: 'Value Created', numValue: 50, prefix: '$', suffix: 'M+' },
  { value: '150+', label: 'Projects Completed', numValue: 150, suffix: '+' },
  { value: '40+', label: 'Happy Clients', numValue: 40, suffix: '+' },
];

const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.08 } },
};

const fadeInUp = {
  initial: { opacity: 0, y: 60, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.8, ease: [0.25, 0.1, 0.25, 1] } },
};

// Counter component
function AnimatedCounter({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end center'],
  });
  
  const count = useTransform(scrollYProgress, [0, 0.5], [0, value]);
  const rounded = useSpring(count, { stiffness: 50, damping: 20 });

  return (
    <motion.div ref={ref} className="text-3xl md:text-5xl font-bold text-gradient mb-2">
      {prefix}<motion.span>{rounded}</motion.span>{suffix}
    </motion.div>
  );
}

export default function Work() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  
  const bgY = useTransform(scrollYProgress, [0, 1], [0, 100]);

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
        title="Our Work & Case Studies | Uno Digit"
        description="Explore our portfolio of successful AI implementation, data science projects, and digital transformation case studies across various industries."
        canonical="/work"
        schema={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          "name": "Uno Digit Case Studies",
          "description": "A collection of AI and digital transformation case studies."
        }}
      />
      {/* Hero */}
      <section ref={heroRef} className="py-24 relative overflow-hidden">
        <motion.div 
          style={{ y: bgY }} 
          className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl" 
        />
        
        <div className="container mx-auto px-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="max-w-4xl"
          >
            <span className="text-primary font-medium mb-4 block">Our Work</span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
              Proven Results, <span className="text-gradient">Real Impact</span>
            </h1>
            <p className="text-xl text-muted max-w-2xl">
              Explore our portfolio of successful projects and discover how we've helped 
              businesses achieve transformational outcomes.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Featured Case */}
      <section className="py-12">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <GlassCard className="p-0 overflow-hidden">
              <div className="grid lg:grid-cols-2">
                <motion.div 
                  className="p-12 lg:p-16 flex flex-col justify-center"
                  initial="initial"
                  whileInView="animate"
                  viewport={{ once: true }}
                >
                  <motion.span 
                    className="text-primary text-sm font-medium mb-4"
                    initial={{ opacity: 0, x: -30 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                  >
                    Featured Case Study
                  </motion.span>
                  <motion.h2 
                    className="text-3xl md:text-4xl font-bold mb-4"
                    initial={{ opacity: 0, x: -30 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    {featuredCase.title}
                  </motion.h2>
                  <motion.p 
                    className="text-muted mb-4"
                    initial={{ opacity: 0, x: -30 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    {featuredCase.description}
                  </motion.p>
                  <motion.div 
                    className="flex items-center gap-2 text-2xl font-bold text-gradient mb-6"
                    initial={{ opacity: 0, x: -30 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    <TrendingUp className="text-primary" />
                    {featuredCase.result}
                  </motion.div>
                  <motion.div 
                    className="flex flex-wrap gap-2 mb-8"
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                  >
                    {featuredCase.tags.map((tag, i) => (
                      <motion.span 
                        key={tag} 
                        className="px-3 py-1 glass rounded-full text-sm"
                        initial={{ opacity: 0, scale: 0.8 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.5 + i * 0.05, type: 'spring', bounce: 0.5 }}
                      >
                        {tag}
                      </motion.span>
                    ))}
                  </motion.div>
                  <Link to="/contact" className="inline-flex items-center gap-2 text-primary hover:underline">
                    Read Full Case Study <ExternalLink size={16} />
                  </Link>
                </motion.div>
                <motion.div 
                  className="bg-gradient-to-br from-primary/20 to-secondary/20 min-h-[300px] lg:min-h-0 flex items-center justify-center overflow-hidden"
                  initial={{ scale: 1.2, opacity: 0 }}
                  whileInView={{ scale: 1, opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1 }}
                >
                  <div className="text-6xl font-bold text-white/10">TC</div>
                </motion.div>
              </div>
            </GlassCard>
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-24">
        <div className="container mx-auto px-6">
          <motion.div 
            className="grid grid-cols-3 gap-8"
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: '-15%' }}
          >
            {stats.map((stat) => (
              <motion.div key={stat.label} className="text-center" variants={fadeInUp}>
                <AnimatedCounter value={stat.numValue} prefix={stat.prefix || ''} suffix={stat.suffix || ''} />
                <div className="text-muted">{stat.label}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Project Grid */}
      <section className="py-24 bg-surface/50">
        <div className="container mx-auto px-6">
          <motion.h2 
            className="text-3xl md:text-4xl font-bold mb-12"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            All Projects
          </motion.h2>

          <motion.div 
            className="grid md:grid-cols-2 lg:grid-cols-3 gap-8"
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: '-20%' }}
          >
            {projects.map((project) => (
              <motion.div key={project.title} variants={fadeInUp}>
                <GlassCard className="h-full group cursor-pointer hover:border-primary/30 transition-all">
                  <span className="text-primary text-xs font-medium uppercase tracking-wider">{project.category}</span>
                  <h3 className="text-xl font-semibold mt-2 mb-2 group-hover:text-primary transition-colors">{project.title}</h3>
                  <p className="text-muted text-sm mb-4">{project.description}</p>
                  <div className="flex items-center justify-between mt-auto pt-4 border-t border-white/5">
                    <span className="text-primary font-semibold">{project.result}</span>
                    <ArrowRight size={16} className="text-muted group-hover:text-primary group-hover:translate-x-1 transition-all" />
                  </div>
                </GlassCard>
              </motion.div>
            ))}
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
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Have a Project in Mind?</h2>
            <p className="text-muted max-w-xl mx-auto mb-8">
              Let's discuss how we can help you achieve similar results.
            </p>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link
                to="/contact"
                className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-background font-semibold rounded-full hover:bg-primary-600 transition-colors"
              >
                Start a Conversation <ArrowRight size={20} />
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>
    </motion.main>
  );
}
