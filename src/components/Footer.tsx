import { Link } from 'react-router-dom';
import { Linkedin, Twitter, Github, Mail } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-white/5 py-16">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          <div className="col-span-1 md:col-span-2">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                <span className="text-background font-bold text-lg">U</span>
              </div>
              <span className="font-semibold text-lg">Uno Digit</span>
            </Link>
            <p className="text-muted max-w-md mb-6">
              AI-Driven Digital Transformation for forward-thinking enterprises. 
              Based in Sydney, serving the world.
            </p>
            <div className="flex gap-4">
              <a href="#" className="p-2 rounded-full glass hover:border-primary/30 transition-colors">
                <Linkedin size={20} />
              </a>
              <a href="#" className="p-2 rounded-full glass hover:border-primary/30 transition-colors">
                <Twitter size={20} />
              </a>
              <a href="#" className="p-2 rounded-full glass hover:border-primary/30 transition-colors">
                <Github size={20} />
              </a>
              <a href="#" className="p-2 rounded-full glass hover:border-primary/30 transition-colors">
                <Mail size={20} />
              </a>
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-3">
              {['About', 'Services', 'Work', 'Insights', 'Contact'].map((item) => (
                <li key={item}>
                  <Link
                    to={`/${item.toLowerCase()}`}
                    className="text-muted hover:text-primary transition-colors"
                  >
                    {item}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Contact</h4>
            <ul className="space-y-3 text-muted">
              <li>Sydney, Australia</li>
              <li>hello@unodigit.com</li>
              <li>+61 2 8000 0000</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/5 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-muted text-sm">
            2024 Uno Digit. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm text-muted">
            <a href="#" className="hover:text-primary transition-colors">Privacy</a>
            <a href="#" className="hover:text-primary transition-colors">Terms</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
