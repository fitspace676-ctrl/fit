import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Archivo, JetBrains_Mono, Manrope } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@fit/i18n';
import { routing } from '@/src/i18n/routing';
import { ThemeProvider, THEME_COOKIE, type Theme } from '@/src/components/theme/theme-provider';
import { AstryxProvider } from '@/src/components/theme/astryx-provider';
import { SentryInit } from '../sentry-init';
import '../globals.css';
// Astryx component styles (layer `astryx-base`) load AFTER globals.css so the
// layer is declared last and outranks Tailwind's `tw-base` preflight — see the
// cascade note in globals.css (T11.7). A CSS `@import` inside globals.css would
// load before its own rules and invert this order, so it is imported here.
import '@astryxdesign/core/astryx.css';

/** UI body font — Manrope, exposed as a CSS variable Tailwind's `font-sans` reads. */
const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
});

/** Display font — Archivo, for headings (`font-display`). */
const archivo = Archivo({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800', '900'],
  variable: '--font-archivo',
  display: 'swap',
});

/** Data/mono font — JetBrains Mono (`font-mono`), for numbers and codes. */
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

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

  const [messages, cookieStore] = await Promise.all([getMessages(), cookies()]);

  // Seed the theme from the cookie so the painted `<html>` class matches the
  // client provider on first render — the member portal defaults to the dark
  // Aurora-glass skin until the visitor flips the header toggle.
  const theme: Theme = cookieStore.get(THEME_COOKIE)?.value === 'light' ? 'light' : 'dark';

  return (
    <html
      lang={locale}
      className={`${manrope.variable} ${archivo.variable} ${jetbrains.variable} ${theme === 'dark' ? 'dark' : ''}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-white font-sans text-ink-900 antialiased dark:bg-ink-950 dark:text-white">
        <SentryInit />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider initial={theme}>
            <AstryxProvider>{children}</AstryxProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
