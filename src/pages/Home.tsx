import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform, useSpring } from 'motion/react';
import { ArrowRight, Zap, Shield, TrendingUp, Brain, Code, BarChart3, ChevronDown, Quote } from 'lucide-react';
import ParticleBackground from '../components/ParticleBackground';
import GlassCard from '../components/GlassCard';
import MagneticButton from '../components/MagneticButton';
import SEO from '../components/SEO';

const services = [
  { icon: Brain, title: 'AI Strategy', description: 'Transform your business with intelligent automation and predictive analytics.' },
  { icon: Code, title: 'Custom Development', description: 'Scalable web and mobile applications built with cutting-edge technology.' },
  { icon: BarChart3, title: 'Data Intelligence', description: 'Turn raw data into actionable insights that drive growth.' },
];

const stats = [
  { value: '150+', label: 'Projects Delivered', numValue: 150, suffix: '+' },
  { value: '$50M+', label: 'Value Created', numValue: 50, prefix: '$', suffix: 'M+' },
  { value: '98%', label: 'Client Satisfaction', numValue: 98, suffix: '%' },
  { value: '24/7', label: 'Support', numValue: 24, suffix: '/7' },
];

const testimonials = [
  { quote: 'Uno Digit transformed our operations with AI solutions that exceeded expectations.', author: 'Sarah Chen', role: 'CTO, TechCorp' },
  { quote: 'Their expertise in machine learning helped us achieve a 40% efficiency gain.', author: 'Michael Ross', role: 'CEO, DataFlow' },
  { quote: 'The team delivered exceptional results on time and within budget.', author: 'Emma Williams', role: 'VP Engineering, NextGen' },
];

const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

const staggerContainer = {
  animate: {
    transition: { staggerChildren: 0.1 },
  },
};

const fadeInUp = {
  initial: { opacity: 0, y: 60, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.8, ease: [0.25, 0.1, 0.25, 1] } },
};

// Counter component
function AnimatedCounter({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end center'],
  });
  
  const count = useTransform(scrollYProgress, [0, 0.5], [0, value]);
  const rounded = useSpring(count, { stiffness: 50, damping: 20 });

  return (
    <motion.span ref={ref} className="text-4xl md:text-5xl font-bold text-gradient mb-2 block">
      {prefix}
      <motion.span>{rounded}</motion.span>
      {suffix}
    </motion.span>
  );
}

export default function Home() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: heroScrollProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  
  // Parallax for background elements
  const bgY1 = useTransform(heroScrollProgress, [0, 1], [0, 100]);
  const bgY2 = useTransform(heroScrollProgress, [0, 1], [0, 150]);
  const heroOpacity = useTransform(heroScrollProgress, [0, 0.5], [1, 0]);
  const heroY = useTransform(heroScrollProgress, [0, 0.5], [0, -50]);
  const heroScale = useTransform(heroScrollProgress, [0, 0.5], [1, 0.95]);
  const bgScale = useTransform(heroScrollProgress, [0, 1], [1, 1.2]);

  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Uno Digit",
    "url": "https://unodigit.com.au",
    "logo": "https://unodigit.com.au/favicon.svg",
    "description": "Sydney's Leading AI Consultancy helping enterprises harness the power of artificial intelligence.",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "100 Tech Avenue",
      "addressLocality": "Sydney",
      "addressRegion": "NSW",
      "postalCode": "2000",
      "addressCountry": "AU"
    }
  };

  return (
    <motion.main
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.5 }}
    >
      <SEO 
        title="Uno Digit | AI & Digital Transformation Leader Sydney"
        description="We partner with forward-thinking enterprises in Sydney and Australia to build intelligent systems, custom AI solutions, and digital ecosystems that drive growth."
        schema={schema}
      />
      {/* Hero Section */}
      <section ref={heroRef} className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <motion.div style={{ scale: bgScale }} className="absolute inset-0">
          <ParticleBackground />
        </motion.div>
        
        {/* Parallax background elements */}
        <motion.div 
          style={{ y: bgY1 }} 
          className="absolute top-20 left-10 w-64 h-64 bg-primary/5 rounded-full blur-3xl" 
        />
        <motion.div 
          style={{ y: bgY2 }} 
          className="absolute bottom-20 right-10 w-96 h-96 bg-secondary/5 rounded-full blur-3xl" 
        />
        
        <motion.div 
          style={{ opacity: heroOpacity, y: heroY, scale: heroScale }}
          className="container mx-auto px-6 pt-24 text-center relative z-10"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 glass rounded-full mb-8"
          >
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-sm text-muted">Sydney's Leading AI Consultancy</span>
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 max-w-4xl mx-auto leading-tight"
          >
            <span className="text-gradient">AI-Driven</span> Digital{' '}
            <span className="text-gradient">Transformation</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="text-lg md:text-xl text-muted max-w-2xl mx-auto mb-10"
          >
            We partner with forward-thinking enterprises to build intelligent systems 
            that drive growth, efficiency, and competitive advantage.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.6 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <MagneticButton>
              <Link
                to="/contact"
                className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-primary to-secondary text-background font-semibold rounded-full hover:shadow-lg hover:shadow-primary/25 transition-all"
              >
                Start Your Journey <ArrowRight size={20} />
              </Link>
            </MagneticButton>
            <MagneticButton>
              <Link
                to="/work"
                className="inline-flex items-center gap-2 px-8 py-4 glass rounded-full font-semibold hover:border-primary/30 transition-all"
              >
                View Our Work
              </Link>
            </MagneticButton>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 1 }}
            className="absolute bottom-10 left-1/2 -translate-x-1/2"
          >
            <ChevronDown size={32} className="animate-bounce text-muted" />
          </motion.div>
        </motion.div>
      </section>

      {/* Value Props */}
      <section className="py-24">
        <div className="container mx-auto px-6">
          <motion.div 
            className="text-center mb-16"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Why Choose Uno Digit
            </h2>
            <p className="text-muted max-w-2xl mx-auto">
              We combine deep technical expertise with strategic thinking to deliver exceptional results.
            </p>
          </motion.div>

          <motion.div 
            className="grid md:grid-cols-3 gap-8"
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: '-20%' }}
          >
            {[
              { icon: Zap, title: 'Lightning Fast', desc: 'Rapid deployment with agile methodologies' },
              { icon: Shield, title: 'Enterprise Security', desc: 'Bank-grade security for peace of mind' },
              { icon: TrendingUp, title: 'Scalable Growth', desc: 'Solutions that grow with your business' },
            ].map((item) => (
              <motion.div key={item.title} variants={fadeInUp}>
                <GlassCard className="text-center h-full transform-gpu">
                  <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
                    <item.icon size={28} className="text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-3">{item.title}</h3>
                  <p className="text-muted">{item.desc}</p>
                </GlassCard>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Services Preview */}
      <section className="py-24 bg-surface/50">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-16 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Our Services</h2>
              <p className="text-muted max-w-xl">
                End-to-end solutions powered by cutting-edge AI and modern development practices.
              </p>
            </motion.div>
            <Link to="/services" className="text-primary hover:underline flex items-center gap-2">
              View All Services <ArrowRight size={16} />
            </Link>
          </div>

          <motion.div 
            className="grid md:grid-cols-3 gap-8"
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: '-20%' }}
          >
            {services.map((service) => (
              <motion.div key={service.title} variants={fadeInUp}>
                <GlassCard className="h-full group cursor-pointer">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <service.icon size={24} className="text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-3">{service.title}</h3>
                  <p className="text-muted mb-4">{service.description}</p>
                  <span className="text-primary text-sm font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                    Learn More <ArrowRight size={14} />
                  </span>
                </GlassCard>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Stats with counter */}
      <section className="py-24">
        <div className="container mx-auto px-6">
          <motion.div 
            className="grid grid-cols-2 md:grid-cols-4 gap-8"
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: '-15%' }}
          >
            {stats.map((stat, i) => (
              <motion.div 
                key={stat.label} 
                className="text-center"
                variants={fadeInUp}
              >
                <AnimatedCounter value={stat.numValue} prefix={stat.prefix || ''} suffix={stat.suffix || ''} />
                <div className="text-muted">{stat.label}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 bg-surface/50">
        <div className="container mx-auto px-6">
          <motion.h2 
            className="text-3xl md:text-4xl font-bold text-center mb-16"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            What Our Clients Say
          </motion.h2>

          <motion.div 
            className="grid md:grid-cols-3 gap-8"
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: '-20%' }}
          >
            {testimonials.map((t) => (
              <motion.div key={t.author} variants={fadeInUp}>
                <GlassCard className="h-full">
                  <Quote size={32} className="text-primary/30 mb-4" />
                  <p className="text-lg mb-6">{t.quote}</p>
                  <div>
                    <div className="font-semibold">{t.author}</div>
                    <div className="text-sm text-muted">{t.role}</div>
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
            className="glass rounded-2xl p-12 md:p-16 text-center relative overflow-hidden"
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <motion.div 
              className="absolute inset-0 bg-gradient-to-r from-primary/10 to-secondary/10"
              initial={{ scale: 0.8, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            />
            <div className="relative z-10">
              <motion.h2 
                className="text-3xl md:text-4xl font-bold mb-4"
                initial={{ y: 50, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
              >
                Ready to Transform?
              </motion.h2>
              <motion.p 
                className="text-muted max-w-xl mx-auto mb-8"
                initial={{ y: 30, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 }}
              >
                Let's discuss how AI can revolutionize your business operations.
              </motion.p>
              <motion.div
                initial={{ y: 30, opacity: 0, scale: 0.9 }}
                whileInView={{ y: 0, opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 }}
              >
                <MagneticButton>
                  <Link
                    to="/contact"
                    className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-background font-semibold rounded-full hover:bg-primary-600 transition-colors"
                  >
                    Get Started <ArrowRight size={20} />
                  </Link>
                </MagneticButton>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>
    </motion.main>
  );
}
