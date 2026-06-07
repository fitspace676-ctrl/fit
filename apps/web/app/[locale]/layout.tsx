import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@fit/i18n';
import { Link } from '@/src/i18n/navigation';
import { routing } from '@/src/i18n/routing';
import { LocaleSwitcher } from '@/src/components/LocaleSwitcher';
import { SentryInit } from '../sentry-init';
import '../globals.css';

export const metadata: Metadata = {
  title: 'Fit — Web',
  description: 'Fit web application.',
};

/** Pre-render every supported locale at build time. */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }
  // Opt this layout into static rendering for the resolved locale.
  setRequestLocale(locale);

  const [messages, t] = await Promise.all([getMessages(), getTranslations('common')]);

  return (
    <html lang={locale}>
      <body className="min-h-screen bg-white font-sans text-slate-900 antialiased">
        <SentryInit />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <header className="flex items-center justify-between gap-4 border-b border-slate-100 px-gutter py-4">
            <nav className="flex items-center gap-6 text-sm font-medium text-slate-600">
              <Link href="/" className="font-semibold text-brand-600">
                {t('appName')}
              </Link>
              <Link href="/" className="hover:text-brand-600">
                {t('nav.home')}
              </Link>
              <Link href="/classes" className="hover:text-brand-600">
                {t('nav.classes')}
              </Link>
              <Link href="/trainers" className="hover:text-brand-600">
                {t('nav.trainers')}
              </Link>
              <Link href="/shop" className="hover:text-brand-600">
                {t('nav.shop')}
              </Link>
            </nav>
            <LocaleSwitcher />
          </header>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
