import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform, useSpring } from 'motion/react';
import { Target, Lightbulb, Users, MapPin, ArrowRight } from 'lucide-react';
import GlassCard from '../components/GlassCard';
import SEO from '../components/SEO';

const values = [
  { icon: Target, title: 'Transparency', description: 'Open communication and honest partnerships built on trust.' },
  { icon: Lightbulb, title: 'Innovation', description: 'Pushing boundaries with cutting-edge technology solutions.' },
  { icon: Users, title: 'Collaboration', description: 'Working together to achieve exceptional outcomes.' },
];

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

// Counter component
function AnimatedCounter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end center'],
  });
  
  const count = useTransform(scrollYProgress, [0, 0.5], [0, value]);
  const rounded = useSpring(count, { stiffness: 50, damping: 20 });

  return (
    <motion.div ref={ref} className="text-3xl font-bold text-gradient mb-2">
      <motion.span>{rounded}</motion.span>{suffix}
    </motion.div>
  );
}

export default function About() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  
  const bgY1 = useTransform(scrollYProgress, [0, 1], [0, 100]);
  const bgY2 = useTransform(scrollYProgress, [0, 1], [0, 150]);

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
        title="About Uno Digit | AI Consultancy Sydney"
        description="Learn about Uno Digit, a Sydney-based AI consultancy. Meet our team of experts dedicated to democratizing AI technology for enterprises."
        canonical="/about"
        schema={{
          "@context": "https://schema.org",
          "@type": "AboutPage",
          "name": "About Uno Digit",
          "description": "Information about Uno Digit, an AI consultancy in Sydney."
        }}
      />
      {/* Hero with parallax elements */}
      <section ref={heroRef} className="py-24 relative overflow-hidden">
        <motion.div 
          style={{ y: bgY1 }} 
          className="absolute -top-20 -left-20 w-96 h-96 bg-primary/5 rounded-full blur-3xl" 
        />
        <motion.div 
          style={{ y: bgY2 }} 
          className="absolute top-40 right-0 w-[500px] h-[500px] bg-secondary/5 rounded-full blur-3xl" 
        />
        
        <div className="container mx-auto px-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-4xl"
          >
            <span className="text-primary font-medium mb-4 block">About Uno Digit</span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
              Building the Future of <span className="text-gradient">Intelligent Business</span>
            </h1>
            <p className="text-xl text-muted max-w-2xl">
              We are a Sydney-based AI consultancy helping enterprises harness the power 
              of artificial intelligence to transform operations and drive growth.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Mission */}
      <section className="py-24 bg-surface/50">
        <div className="container mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <motion.h2 
                className="text-3xl md:text-4xl font-bold mb-6"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
              >
                Our Mission
              </motion.h2>
              <motion.p 
                className="text-lg text-muted mb-6"
                initial={{ opacity: 0, x: -50 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
              >
                To democratize AI technology for enterprises of all sizes, enabling them to 
                compete in an increasingly digital world. We believe that intelligent automation 
                should be accessible, practical, and transformative.
              </motion.p>
              <motion.p 
                className="text-lg text-muted"
                initial={{ opacity: 0, x: 50 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
              >
                Founded in 2018, Uno Digit has grown from a small team of passionate engineers 
                to a full-service AI consultancy serving clients across Australia and beyond.
              </motion.p>
            </div>
            
            <motion.div 
              className="grid grid-cols-2 gap-4"
              variants={staggerContainer}
              initial="initial"
              whileInView="animate"
              viewport={{ once: true, margin: '-15%' }}
            >
              {[
                { value: 2018, label: 'Founded', suffix: '' },
                { value: 50, label: 'Team Members', suffix: '+' },
                { value: 150, label: 'Projects', suffix: '+' },
                { value: 95, label: 'Retention Rate', suffix: '%' },
              ].map((stat) => (
                <motion.div key={stat.label} variants={fadeInUp}>
                  <GlassCard className="text-center transform-gpu">
                    <AnimatedCounter value={stat.value} suffix={stat.suffix} />
                    <div className="text-sm text-muted">{stat.label}</div>
                  </GlassCard>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-24">
        <div className="container mx-auto px-6">
          <motion.div 
            className="text-center mb-16"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Our Core Values</h2>
            <p className="text-muted max-w-2xl mx-auto">
              The principles that guide every decision we make.
            </p>
          </motion.div>

          <motion.div 
            className="grid md:grid-cols-3 gap-8"
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: '-20%' }}
          >
            {values.map((value) => (
              <motion.div key={value.title} variants={fadeInUp}>
                <GlassCard className="text-center h-full">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center mx-auto mb-6">
                    <value.icon size={32} className="text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-3">{value.title}</h3>
                  <p className="text-muted">{value.description}</p>
                </GlassCard>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>
    </motion.main>
  );
}
