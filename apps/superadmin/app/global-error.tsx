'use client';

import { useEffect } from 'react';

/**
 * Root error boundary. Catches errors thrown in the root layout itself — the
 * one place a segment-level `error.tsx` cannot reach. Because it replaces the
 * root layout, it must render its own `<html>` and `<body>`. Only ever shown in
 * production builds.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // TODO(observability): forward to Sentry once the web SDK is wired up.
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-white font-sans text-slate-900 antialiased">
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-gutter text-center">
          <h1 className="text-4xl font-bold tracking-tight text-brand-600">Something went wrong</h1>
          <p className="max-w-md text-slate-500">
            The operator console failed to load. Please try again.
          </p>
          {error.digest ? (
            <p className="text-xs text-slate-400">Reference: {error.digest}</p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            className="rounded-card bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
