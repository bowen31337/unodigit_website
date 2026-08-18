'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor } from 'lucide-react';
import Segmented from './Segmented';

type ThemeValue = 'light' | 'dark' | 'system';

const OPTIONS = [
  { value: 'light' as const, label: <Sun size={15} strokeWidth={2.2} />, srLabel: 'Light' },
  { value: 'dark' as const, label: <Moon size={15} strokeWidth={2.2} />, srLabel: 'Dark' },
  { value: 'system' as const, label: <Monitor size={15} strokeWidth={2.2} />, srLabel: 'System' },
];

/**
 * Light / Dark / Auto, matching how macOS System Settings presents it.
 *
 * The mounted guard exists because the resolved theme is only known on the
 * client — rendering the real state during SSR would mismatch at hydration.
 * We render a same-sized placeholder rather than nothing so the nav doesn't
 * reflow when it swaps in.
 */
export default function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div
        className={className}
        style={{ width: 122, height: 36, borderRadius: 'var(--radius-md)' }}
        aria-hidden="true"
      />
    );
  }

  return (
    <Segmented<ThemeValue>
      aria-label="Colour theme"
      options={OPTIONS}
      value={(theme as ThemeValue) ?? 'system'}
      onChange={setTheme}
      className={className}
    />
  );
}
