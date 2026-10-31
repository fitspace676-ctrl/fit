'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import { platformMessages } from '@fit/i18n/platform';
import { localeFromPathname } from '@/src/i18n/routing';

/**
 * Root error boundary. Catches errors thrown in the locale layout itself — the
 * one place a segment-level `error.tsx` cannot reach. Because it replaces the
 * layout, it must render its own `<html>` and `<body>`, and it has no message
 * provider above it: the locale is read off the URL and the catalogue is
 * imported directly. Only ever shown in production builds.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale = localeFromPathname(usePathname());
  const [eventId, setEventId] = useState<string | null>(null);

  useEffect(() => {
    setEventId(Sentry.captureException(error));
  }, [error]);

  const reference = eventId || error.digest;

  return (
    <html lang={locale}>
      <body className="min-h-screen bg-white font-sans text-slate-900 antialiased">
        <NextIntlClientProvider locale={locale} messages={platformMessages[locale]}>
          <GlobalErrorBody reference={reference} reset={reset} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

function GlobalErrorBody({ reference, reset }: { reference?: string; reset: () => void }) {
  const t = useTranslations('common.error');
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-gutter text-center">
      <h1 className="text-4xl font-bold tracking-tight text-brand-600">{t('globalTitle')}</h1>
      <p className="max-w-md text-slate-500">{t('globalBody')}</p>
      {reference ? <p className="text-xs text-slate-400">{t('reference', { reference })}</p> : null}
      <button
        type="button"
        onClick={reset}
        className="rounded-card bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
      >
        {t('retry')}
      </button>
    </main>
  );
}
