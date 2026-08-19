'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Menu, X } from 'lucide-react';
import Logo from './Logo';
import Button from './Button';
import ThemeToggle from './ThemeToggle';
import { cn } from '@/lib/utils';

const navLinks = [
  { path: '/', label: 'Home' },
  { path: '/about', label: 'About' },
  { path: '/services', label: 'Services' },
  { path: '/work', label: 'Work' },
  { path: '/insights', label: 'Insights' },
];

/** Apple's drawer/sheet spring: damping 0.8 / response 0.3. */
const sheetSpring = { type: 'spring', bounce: 0.2, visualDuration: 0.3 } as const;
/** Apple's reposition spring: damping 1.0 / response 0.4. */
const moveSpring = { type: 'spring', bounce: 0, visualDuration: 0.35 } as const;

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();
  const reduced = useReducedMotion();

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setIsMenuOpen(false), [pathname]);

  // Lock the page behind the sheet, and close on Escape.
  useEffect(() => {
    if (!isMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setIsMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [isMenuOpen]);

  return (
    <>
      <header
        className={cn(
          'fixed inset-x-0 top-0 z-50 transition-[padding] duration-base ease-out print:hidden',
          isScrolled ? 'py-s3' : 'py-s5'
        )}
      >
        <div className="container">
          {/*
            The bar only materialises once you scroll. At the top of the page
            the chrome is invisible and content owns the screen; as soon as
            content would pass under it, the material appears to separate them.
          */}
          <div
            className={cn(
              'flex items-center justify-between gap-s5 rounded-capsule px-s5 py-s3',
              'transition-[background-color,box-shadow,padding] duration-base ease-out',
              isScrolled ? 'glass' : 'bg-transparent shadow-none'
            )}
            style={!isScrolled ? { boxShadow: 'none', background: 'transparent' } : undefined}
          >
            <Link href="/" className="shrink-0 rounded-md" aria-label="Uno Digit — home">
              <Logo size={isScrolled ? 28 : 30} />
            </Link>

            <nav aria-label="Primary" className="hidden items-center gap-s2 lg:flex">
              {navLinks.map((link) => {
                const isActive = pathname === link.path;
                return (
                  <Link
                    key={link.path}
                    href={link.path}
                    aria-current={isActive ? 'page' : undefined}
                    className="relative rounded-capsule px-s5 py-s3 text-subhead font-medium transition-colors duration-fast ease-out"
                    style={{ color: isActive ? 'var(--label)' : 'var(--label-secondary)' }}
                  >
                    {/*
                      A filled pill that FLIPs between items rather than an
                      underline that fades in and out — the indicator is one
                      object moving, so the eye can follow where it went.
                    */}
                    {isActive && (
                      <motion.span
                        layoutId="nav-indicator"
                        transition={reduced ? { duration: 0 } : moveSpring}
                        className="absolute inset-0 rounded-capsule"
                        style={{ background: 'var(--fill-4)' }}
                      />
                    )}
                    <span className="relative z-[1]">{link.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="flex items-center gap-s4">
              <ThemeToggle className="hidden sm:inline-flex" />
              <Button href="/contact" size="sm" className="hidden lg:inline-flex">
                Contact
              </Button>

              <button
                type="button"
                onClick={() => setIsMenuOpen((v) => !v)}
                aria-expanded={isMenuOpen}
                aria-controls="mobile-menu"
                aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
                className="flex h-11 w-11 items-center justify-center rounded-capsule transition-transform duration-instant ease-out active:scale-[0.94] lg:hidden"
                style={{ color: 'var(--label)' }}
              >
                {isMenuOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
            </div>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div
              key="scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 z-40 lg:hidden print:hidden"
              style={{ background: 'rgba(0,0,0,0.4)' }}
            />

            {/*
              The sheet springs down from the top edge it belongs to, and
              exits back the same way — enter and exit share one path, so the
              menu reads as an object that lives above the screen rather than
              a panel that materialises out of nowhere.
            */}
            <motion.div
              key="sheet"
              id="mobile-menu"
              initial={reduced ? { opacity: 0 } : { y: '-100%' }}
              animate={reduced ? { opacity: 1 } : { y: 0 }}
              exit={reduced ? { opacity: 0 } : { y: '-100%' }}
              transition={reduced ? { duration: 0.2 } : sheetSpring}
              className="glass-thick fixed inset-x-0 top-0 z-40 px-s7 pb-s9 pt-24 lg:hidden print:hidden"
              style={{ borderRadius: '0 0 var(--radius-2xl) var(--radius-2xl)' }}
            >
              <nav aria-label="Mobile" className="flex flex-col">
                {navLinks.map((link) => {
                  const isActive = pathname === link.path;
                  return (
                    <Link
                      key={link.path}
                      href={link.path}
                      aria-current={isActive ? 'page' : undefined}
                      className="flex min-h-[52px] items-center justify-between rounded-md px-s3 text-title-3 font-semibold transition-colors duration-instant"
                      style={{ color: isActive ? 'var(--accent-ink)' : 'var(--label)' }}
                    >
                      {link.label}
                      {isActive && (
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: 'var(--accent)' }}
                        />
                      )}
                    </Link>
                  );
                })}
              </nav>

              <hr className="hairline my-s6" />

              <div className="flex items-center justify-between gap-s5">
                <ThemeToggle />
                <Button href="/contact" size="sm">
                  Contact
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
