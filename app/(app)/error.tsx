'use client';

import { PageError } from '@/_pages/feedback';

export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PageError retry={reset} />;
}
