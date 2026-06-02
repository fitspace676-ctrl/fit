'use client';

import * as Sentry from '@sentry/nextjs';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

/**
 * Route-segment error boundary. Next.js renders this in place of the segment
 * whenever a Server/Client Component below the root layout throws, while keeping
 * the layout (`<html>`/`<body>`) intact. It sits inside the locale layout, so
 * its copy is localized via `useTranslations`. Fatal layout errors are handled
 * by the (English-only, provider-less) `global-error.tsx` instead.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors.generic');
  const [eventId, setEventId] = useState<string | null>(null);

  useEffect(() => {
    // Report to Sentry and keep the event id so the user can quote it to
    // support. Falls back to Next's `digest` when Sentry is not configured.
    setEventId(Sentry.captureException(error));
  }, [error]);

  const reference = eventId || error.digest;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-gutter text-center">
      <span className="rounded-card bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
        {t('badge')}
      </span>
      <h1 className="text-4xl font-bold tracking-tight text-brand-600">{t('title')}</h1>
      <p className="max-w-md text-slate-500">{t('description')}</p>
      {reference ? (
        <p className="text-xs text-slate-400">{t('reference', { id: reference })}</p>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="rounded-card bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
      >
        {t('tryAgain')}
      </button>
    </main>
  );
}
