import type { Metadata } from 'next';
import { Suspense } from 'react';
import QuoteClient from './QuoteClient';

export const metadata: Metadata = {
  title: 'Your indicative quote — Uno Digit',
  // A quote link is private-by-obscurity; keep it out of search results.
  robots: { index: false, follow: false },
};

export default function QuotePage() {
  // useSearchParams() requires a Suspense boundary during static export,
  // otherwise the build fails with a missing-suspense-with-csr-bailout error.
  return (
    <Suspense fallback={null}>
      <QuoteClient />
    </Suspense>
  );
}
