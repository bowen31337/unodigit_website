import { useState, useRef } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { Mail, Phone, MapPin, Send, CheckCircle } from 'lucide-react';
import GlassCard from '../components/GlassCard';
import MagneticButton from '../components/MagneticButton';

const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.15 } },
};

const fadeInUp = {
  initial: { opacity: 0, y: 60, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.8, ease: [0.25, 0.1, 0.25, 1] } },
};

const formFieldVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] } },
};

export default function Contact() {
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    email: '',
    need: '',
    budget: '',
    message: '',
  });
  
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  
  const bgY1 = useTransform(scrollYProgress, [0, 1], [0, 100]);
  const bgY2 = useTransform(scrollYProgress, [0, 1], [0, 150]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
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
      {/* Hero */}
      <section ref={heroRef} className="py-24 relative overflow-hidden">
        <motion.div 
          style={{ y: bgY1 }} 
          className="absolute -top-20 -left-20 w-96 h-96 bg-primary/5 rounded-full blur-3xl" 
        />
        <motion.div 
          style={{ y: bgY2 }} 
          className="absolute bottom-0 right-20 w-[500px] h-[500px] bg-secondary/5 rounded-full blur-3xl" 
        />
        
        <div className="container mx-auto px-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-4xl"
          >
            <span className="text-primary font-medium mb-4 block">Contact Us</span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
              Let's Build Something <span className="text-gradient">Amazing Together</span>
            </h1>
            <p className="text-xl text-muted max-w-2xl">
              Ready to transform your business with AI? Get in touch and let's discuss 
              how we can help you achieve your goals.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Contact Content */}
      <section className="py-12 pb-24">
        <div className="container mx-auto px-6">
          <div className="grid lg:grid-cols-3 gap-12">
            {/* Contact Info */}
            <div className="lg:col-span-1">
              <motion.div 
                className="space-y-6"
                variants={staggerContainer}
                initial="initial"
                whileInView="animate"
                viewport={{ once: true }}
              >
                <motion.div variants={fadeInUp}>
                  <GlassCard className="flex items-start gap-4 group hover:border-primary/30 transition-all">
                    <motion.div 
                      className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"
                      whileHover={{ scale: 1.1 }}
                      transition={{ type: 'spring', stiffness: 300 }}
                    >
                      <Mail className="text-primary" size={24} />
                    </motion.div>
                    <div>
                      <h3 className="font-semibold mb-1">Email Us</h3>
                      <a href="mailto:hello@unodigit.com" className="text-muted hover:text-primary transition-colors">
                        hello@unodigit.com
                      </a>
                    </div>
                  </GlassCard>
                </motion.div>

                <motion.div variants={fadeInUp}>
                  <GlassCard className="flex items-start gap-4 group hover:border-primary/30 transition-all">
                    <motion.div 
                      className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"
                      whileHover={{ scale: 1.1 }}
                      transition={{ type: 'spring', stiffness: 300 }}
                    >
                      <Phone className="text-primary" size={24} />
                    </motion.div>
                    <div>
                      <h3 className="font-semibold mb-1">Call Us</h3>
                      <a href="tel:+61280000000" className="text-muted hover:text-primary transition-colors">
                        +61 2 8000 0000
                      </a>
                    </div>
                  </GlassCard>
                </motion.div>

                <motion.div variants={fadeInUp}>
                  <GlassCard className="flex items-start gap-4 group hover:border-primary/30 transition-all">
                    <motion.div 
                      className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"
                      whileHover={{ scale: 1.1 }}
                      transition={{ type: 'spring', stiffness: 300 }}
                    >
                      <MapPin className="text-primary" size={24} />
                    </motion.div>
                    <div>
                      <h3 className="font-semibold mb-1">Visit Us</h3>
                      <p className="text-muted">
                        100 Tech Avenue<br />
                        Sydney NSW 2000<br />
                        Australia
                      </p>
                    </div>
                  </GlassCard>
                </motion.div>
              </motion.div>
            </div>

            {/* Contact Form */}
            <div className="lg:col-span-2">
              <motion.div
                initial={{ opacity: 0, x: 50, rotateY: -10 }}
                whileInView={{ opacity: 1, x: 0, rotateY: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8 }}
                style={{ perspective: 1000 }}
              >
                <GlassCard>
                  {submitted ? (
                    <motion.div 
                      className="text-center py-12"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.5, type: 'spring', bounce: 0.4 }}
                    >
                      <motion.div 
                        className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: 'spring', bounce: 0.5 }}
                      >
                        <CheckCircle size={40} className="text-primary" />
                      </motion.div>
                      <h3 className="text-2xl font-bold mb-4">Thank You!</h3>
                      <p className="text-muted">
                        We've received your message and will get back to you within 24 hours.
                      </p>
                    </motion.div>
                  ) : (
                    <motion.form 
                      onSubmit={handleSubmit} 
                      className="space-y-6"
                      initial="initial"
                      whileInView="animate"
                      viewport={{ once: true }}
                    >
                      <div className="grid md:grid-cols-2 gap-6">
                        <motion.div variants={formFieldVariants} transition={{ delay: 0 }}>
                          <label className="block text-sm font-medium mb-2">Name *</label>
                          <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            required
                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-primary transition-colors"
                            placeholder="Your name"
                          />
                        </motion.div>
                        <motion.div variants={formFieldVariants} transition={{ delay: 0.08 }}>
                          <label className="block text-sm font-medium mb-2">Company</label>
                          <input
                            type="text"
                            name="company"
                            value={formData.company}
                            onChange={handleChange}
                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-primary transition-colors"
                            placeholder="Your company"
                          />
                        </motion.div>
                      </div>

                      <motion.div variants={formFieldVariants} transition={{ delay: 0.16 }}>
                        <label className="block text-sm font-medium mb-2">Email *</label>
                        <input
                          type="email"
                          name="email"
                          value={formData.email}
                          onChange={handleChange}
                          required
                          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-primary transition-colors"
                          placeholder="your@email.com"
                        />
                      </motion.div>

                      <div className="grid md:grid-cols-2 gap-6">
                        <motion.div variants={formFieldVariants} transition={{ delay: 0.24 }}>
                          <label className="block text-sm font-medium mb-2">What do you need?</label>
                          <select
                            name="need"
                            value={formData.need}
                            onChange={handleChange}
                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-primary transition-colors"
                          >
                            <option value="">Select a service</option>
                            <option value="ai-strategy">AI Strategy</option>
                            <option value="ml-development">ML Development</option>
                            <option value="web-app">Web/App Development</option>
                            <option value="data-engineering">Data Engineering</option>
                            <option value="other">Other</option>
                          </select>
                        </motion.div>
                        <motion.div variants={formFieldVariants} transition={{ delay: 0.32 }}>
                          <label className="block text-sm font-medium mb-2">Budget Range</label>
                          <select
                            name="budget"
                            value={formData.budget}
                            onChange={handleChange}
                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-primary transition-colors"
                          >
                            <option value="">Select budget</option>
                            <option value="10-50k">$10,000 - $50,000</option>
                            <option value="50-100k">$50,000 - $100,000</option>
                            <option value="100-500k">$100,000 - $500,000</option>
                            <option value="500k+">$500,000+</option>
                          </select>
                        </motion.div>
                      </div>

                      <motion.div variants={formFieldVariants} transition={{ delay: 0.4 }}>
                        <label className="block text-sm font-medium mb-2">Message *</label>
                        <textarea
                          name="message"
                          value={formData.message}
                          onChange={handleChange}
                          required
                          rows={5}
                          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-primary transition-colors resize-none"
                          placeholder="Tell us about your project..."
                        />
                      </motion.div>

                      <motion.div variants={formFieldVariants} transition={{ delay: 0.48 }}>
                        <MagneticButton>
                          <motion.button
                            type="submit"
                            className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-primary to-secondary text-background font-semibold rounded-full hover:shadow-lg hover:shadow-primary/25 transition-all"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            Send Message <Send size={20} />
                          </motion.button>
                        </MagneticButton>
                      </motion.div>
                    </motion.form>
                  )}
                </GlassCard>
              </motion.div>
            </div>
          </div>
        </div>
      </section>
    </motion.main>
  );
}
