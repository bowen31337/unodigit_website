import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform, useSpring } from 'motion/react';
import { Brain, Code, Database, LineChart, Cog, Cloud, ArrowRight, Check } from 'lucide-react';
import GlassCard from '../components/GlassCard';
import SEO from '../components/SEO';

const services = [
  {
    icon: Brain,
    title: 'AI Strategy & Consulting',
    description: 'Strategic roadmaps for AI adoption that align with your business objectives.',
    features: ['AI Readiness Assessment', 'Use Case Identification', 'ROI Analysis', 'Implementation Planning'],
  },
  {
    icon: LineChart,
    title: 'Machine Learning Solutions',
    description: 'Custom ML models for predictive analytics, NLP, and computer vision.',
    features: ['Predictive Analytics', 'Natural Language Processing', 'Computer Vision', 'Recommendation Systems'],
  },
  {
    icon: Database,
    title: 'Data Engineering',
    description: 'Robust data pipelines and infrastructure for AI-ready organizations.',
    features: ['Data Pipeline Design', 'ETL Development', 'Data Warehouse', 'Real-time Processing'],
  },
  {
    icon: Code,
    title: 'Web & App Development',
    description: 'Modern, scalable applications built with cutting-edge technology.',
    features: ['React/Next.js', 'Mobile Apps', 'API Development', 'Cloud Architecture'],
  },
  {
    icon: Cog,
    title: 'Process Automation',
    description: 'Intelligent automation to streamline operations and reduce costs.',
    features: ['RPA Implementation', 'Workflow Automation', 'Document Processing', 'Integration Services'],
  },
  {
    icon: Cloud,
    title: 'Cloud & MLOps',
    description: 'Enterprise-grade infrastructure for deploying and scaling AI solutions.',
    features: ['AWS/GCP/Azure', 'Model Deployment', 'CI/CD Pipelines', 'Monitoring & Maintenance'],
  },
];

const process = [
  { step: '01', title: 'Discovery', description: 'Deep dive into your business challenges and objectives' },
  { step: '02', title: 'Strategy', description: 'Define the roadmap and technical approach' },
  { step: '03', title: 'Build', description: 'Agile development with continuous feedback' },
  { step: '04', title: 'Deploy', description: 'Launch, monitor, and iterate for optimal results' },
];

const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.05 } },
};

const fadeInUp = {
  initial: { opacity: 0, y: 60, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.8, ease: [0.25, 0.1, 0.25, 1] } },
};

export default function Services() {
  const heroRef = useRef<HTMLDivElement>(null);
  const horizontalRef = useRef<HTMLDivElement>(null);
  const processRef = useRef<HTMLDivElement>(null);
  
  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  
  const { scrollYProgress: horizontalProgress } = useScroll({
    target: horizontalRef,
    offset: ['start start', 'end end'],
  });
  
  const { scrollYProgress: processProgress } = useScroll({
    target: processRef,
    offset: ['start end', 'end center'],
  });
  
  // Parallax orbs
  const bgY1 = useTransform(heroProgress, [0, 1], [0, 100]);
  const bgY2 = useTransform(heroProgress, [0, 1], [0, 150]);
  
  // Horizontal scroll
  const x = useTransform(horizontalProgress, [0, 1], ['0%', '-66%']);
  const smoothX = useSpring(x, { stiffness: 100, damping: 30 });
  
  // Process line width
  const lineScaleX = useTransform(processProgress, [0, 1], [0, 1]);

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
        title="AI Services & Web Development | Uno Digit Sydney"
        description="Comprehensive AI strategies, Machine Learning solutions, and Web Development services for Australian businesses. Transform your operations today."
        canonical="/services"
        schema={{
          "@context": "https://schema.org",
          "@type": "Service",
          "serviceType": "AI Consulting",
          "provider": {
            "@type": "Organization",
            "name": "Uno Digit"
          },
          "areaServed": "Australia"
        }}
      />
      {/* Hero */}
      <section ref={heroRef} className="py-24 relative overflow-hidden">
        <motion.div 
          style={{ y: bgY1 }} 
          className="absolute top-0 left-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl" 
        />
        <motion.div 
          style={{ y: bgY2 }} 
          className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-secondary/5 rounded-full blur-3xl" 
        />
        
        <div className="container mx-auto px-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="max-w-4xl"
          >
            <span className="text-primary font-medium mb-4 block">Our Services</span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
              End-to-End <span className="text-gradient">AI Solutions</span>
            </h1>
            <p className="text-xl text-muted max-w-2xl">
              From strategy to deployment, we provide comprehensive services to help 
              you leverage the full potential of artificial intelligence.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Horizontal Scroll Services Section */}
      <section ref={horizontalRef} className="h-[300vh] relative">
        <div className="sticky top-0 h-screen overflow-hidden flex items-center">
          <div className="absolute top-8 left-6 z-10">
            <h2 className="text-2xl md:text-3xl font-bold mb-2">Our Expertise</h2>
            <p className="text-muted text-sm">Scroll to explore our services</p>
          </div>
          
          <motion.div 
            style={{ x: smoothX }}
            className="flex items-center h-full gap-8 px-6 pt-20"
          >
            {services.map((service, i) => (
              <motion.div
                key={service.title}
                className="w-[400px] h-[480px] flex-shrink-0 transform-gpu"
                initial={{ opacity: 0.5, scale: 0.85, rotateY: -15 }}
                whileInView={{ opacity: 1, scale: 1, rotateY: 0 }}
                viewport={{ margin: '-30%' }}
                transition={{ duration: 0.5 }}
              >
                <GlassCard className="h-full flex flex-col">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center mb-6">
                    <service.icon size={28} className="text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-3">{service.title}</h3>
                  <p className="text-muted mb-6">{service.description}</p>
                  <ul className="space-y-2 mt-auto">
                    {service.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm">
                        <Check size={16} className="text-primary shrink-0" />
                        <span className="text-muted">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </GlassCard>
              </motion.div>
            ))}
            <div className="w-[100px] flex-shrink-0" />
          </motion.div>
          
          {/* Scroll indicator */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 text-muted text-sm">
            <div className="w-8 h-[2px] bg-primary/50 rounded animate-pulse" />
            <span>Scroll horizontally</span>
            <ArrowRight size={14} className="animate-bounce" />
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="py-24 bg-surface/50">
        <div className="container mx-auto px-6">
          <motion.div 
            className="text-center mb-16"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Our Process</h2>
            <p className="text-muted max-w-2xl mx-auto">
              A proven methodology that delivers results on time and within budget.
            </p>
          </motion.div>

          <div ref={processRef} className="relative">
            {/* Connecting line */}
            <motion.div 
              className="hidden md:block absolute top-1/2 left-0 right-0 h-[2px] bg-gradient-to-r from-primary/20 via-primary to-secondary/20 origin-left"
              style={{ scaleX: lineScaleX }}
            />
            
            <div className="grid md:grid-cols-4 gap-8 relative">
              {process.map((step, i) => (
                <motion.div 
                  key={step.step} 
                  className="text-center relative"
                  initial={{ opacity: 0, y: 60, scale: 0.8 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, margin: '-15%' }}
                  transition={{ delay: i * 0.1, type: 'spring', bounce: 0.4 }}
                >
                  <motion.div 
                    className="text-5xl font-bold text-gradient mb-4 inline-block"
                    initial={{ scale: 0, rotate: -180 }}
                    whileInView={{ scale: 1, rotate: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 + 0.2, type: 'spring', bounce: 0.5 }}
                  >
                    {step.step}
                  </motion.div>
                  <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                  <p className="text-muted text-sm">{step.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="py-24">
        <div className="container mx-auto px-6">
          <motion.div 
            className="text-center mb-16"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Technology Stack</h2>
            <p className="text-muted max-w-2xl mx-auto">
              We use the latest technologies to build robust, scalable solutions.
            </p>
          </motion.div>

          <motion.div 
            className="flex flex-wrap justify-center gap-4"
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: '-20%' }}
          >
            {['Python', 'TensorFlow', 'PyTorch', 'React', 'Node.js', 'AWS', 'GCP', 'Docker', 'Kubernetes', 'PostgreSQL', 'MongoDB', 'Redis'].map((tech) => (
              <motion.div 
                key={tech} 
                variants={fadeInUp}
                whileHover={{ scale: 1.05, borderColor: 'rgba(var(--primary), 0.3)' }}
                whileTap={{ scale: 0.95 }}
                className="px-6 py-3 glass rounded-full text-sm font-medium cursor-default transition-colors"
              >
                {tech}
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-surface/50">
        <div className="container mx-auto px-6">
          <motion.div 
            className="text-center"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Get Started?</h2>
            <p className="text-muted max-w-xl mx-auto mb-8">
              Let's discuss your project and find the right solution for your needs.
            </p>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link
                to="/contact"
                className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-background font-semibold rounded-full hover:bg-primary-600 transition-colors"
              >
                Schedule a Consultation <ArrowRight size={20} />
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>
    </motion.main>
  );
}
