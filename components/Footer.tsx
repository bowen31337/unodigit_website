import Link from 'next/link';
import { Linkedin, Github, Mail } from 'lucide-react';
import Logo from './Logo';

const quickLinks = ['About', 'Services', 'Work', 'Insights', 'Contact'];

const socials = [
  { href: 'https://www.linkedin.com/company/101707731', label: 'LinkedIn', Icon: Linkedin },
  { href: 'https://github.com/organizations/unodigit/', label: 'GitHub', Icon: Github },
  { href: 'mailto:info@unodigit.com.au', label: 'Email', Icon: Mail },
];

export default function Footer() {
  return (
    <footer style={{ background: 'var(--bg-secondary)' }}>
      <div className="container py-s12">
        <div className="grid grid-cols-1 gap-s10 md:grid-cols-12">
          <div className="md:col-span-5">
            <Link href="/" className="mb-s5 inline-block rounded-md" aria-label="Uno Digit — home">
              <Logo />
            </Link>
            <p className="type-body max-w-sm" style={{ color: 'var(--label-secondary)' }}>
              AI-driven digital transformation for forward-thinking enterprises.
              Based in Sydney, working worldwide.
            </p>

            <div className="mt-s7 flex gap-s4">
              {socials.map(({ href, label, Icon }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  target={href.startsWith('http') ? '_blank' : undefined}
                  rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
                  className="flex h-11 w-11 items-center justify-center rounded-capsule transition-[transform,background-color] duration-instant ease-out active:scale-[0.94]"
                  style={{ background: 'var(--fill-4)', color: 'var(--label-secondary)' }}
                >
                  <Icon size={19} strokeWidth={1.9} />
                </a>
              ))}
            </div>
          </div>

          <div className="md:col-span-3 md:col-start-8">
            <h2 className="type-eyebrow mb-s5" style={{ color: 'var(--label-secondary)' }}>
              Explore
            </h2>
            <ul className="space-y-s4">
              {quickLinks.map((item) => (
                <li key={item}>
                  <Link
                    href={`/${item.toLowerCase()}`}
                    className="type-callout transition-colors duration-fast ease-out hover:text-accent-ink"
                    style={{ color: 'var(--label-secondary)' }}
                  >
                    {item}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-2">
            <h2 className="type-eyebrow mb-s5" style={{ color: 'var(--label-secondary)' }}>
              Contact
            </h2>
            <ul className="space-y-s4 type-callout" style={{ color: 'var(--label-secondary)' }}>
              <li>Sydney, Australia</li>
              <li>
                <a
                  href="mailto:info@unodigit.com.au"
                  className="transition-colors duration-fast ease-out hover:text-accent-ink"
                >
                  info@unodigit.com.au
                </a>
              </li>
            </ul>
          </div>
        </div>

        <hr className="hairline my-s9" />

        <div className="flex flex-col items-start justify-between gap-s4 sm:flex-row sm:items-center">
          <p className="type-footnote" style={{ color: 'var(--label-secondary)' }}>
            © {new Date().getFullYear()} Uno Digit. All rights reserved.
          </p>
          <div className="flex gap-s7 type-footnote" style={{ color: 'var(--label-secondary)' }}>
            <Link href="/contact" className="transition-colors duration-fast hover:text-accent-ink">
              Privacy
            </Link>
            <Link href="/contact" className="transition-colors duration-fast hover:text-accent-ink">
              Terms
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
