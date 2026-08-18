'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { ReactNode } from 'react';

/**
 * Writes the chosen theme to `data-theme` on <html> — the same attribute the
 * token layer's [data-theme='dark'] block and Tailwind's dark variant key off,
 * so CSS, utilities and JS can never disagree about the current mode.
 *
 * `enableSystem` keeps "follow the OS" as the default; globals.css also has a
 * prefers-color-scheme media block so the correct theme still renders before
 * hydration and for users with JS disabled.
 */
export default function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
