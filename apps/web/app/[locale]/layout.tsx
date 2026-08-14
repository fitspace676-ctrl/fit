import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { JetBrains_Mono, Noto_Sans_Georgian } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@fit/i18n';
import { routing } from '@/src/i18n/routing';
import { ThemeProvider } from '@/src/components/theme/theme-provider';
import { THEME_COOKIE, resolveTheme, type Theme } from '@/src/lib/theme';
import { AstryxProvider } from '@/src/components/theme/astryx-provider';
import { SentryInit } from '../sentry-init';
import '../globals.css';
// Astryx component styles (layer `astryx-base`) load AFTER globals.css so the
// layer is declared last and outranks Tailwind's `tw-base` preflight — see the
// cascade note in globals.css (T11.7). A CSS `@import` inside globals.css would
// load before its own rules and invert this order, so it is imported here.
import '@astryxdesign/core/astryx.css';

/**
 * The one UI family — Noto Sans Georgian, body AND display.
 *
 * The FormaCore direction runs Georgian and Latin on the same skeleton at every
 * weight. Manrope/Archivo (the Aurora-glass pair this replaces) ship no Georgian
 * coverage, so every Georgian string fell back to a system face mid-paragraph —
 * two type systems fighting inside one heading. Noto Sans Georgian covers both
 * scripts, and the `georgian` subset is loaded explicitly because the portal's
 * default locale is `ka`. The full 400–900 range is requested: the direction
 * leans on weight for hierarchy, and headings sit at 800/900.
 */
const notoGeorgian = Noto_Sans_Georgian({
  subsets: ['georgian', 'latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-noto-georgian',
  display: 'swap',
});

/**
 * Data/mono font — JetBrains Mono (`font-mono`). Not a utility face here: the
 * direction's signature move is the giant cropped numeral (a class time, a
 * credit balance, a total), so this family carries the page's visual accent.
 */
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
  // "Lime Block" skin until the visitor flips the header toggle.
  const theme: Theme = resolveTheme(cookieStore.get(THEME_COOKIE)?.value);

  return (
    <html
      lang={locale}
      className={`${notoGeorgian.variable} ${jetbrains.variable} ${theme === 'dark' ? 'dark' : ''}`}
      suppressHydrationWarning
    >
      {/* The canvas is the theme's own body token in both modes — an ink-100
          page in light, ink-950 in dark — so the not-yet-migrated shell and the
          Astryx screens it wraps sit on one surface. */}
      <body className="min-h-screen bg-ink-100 font-sans text-ink-950 antialiased dark:bg-ink-950 dark:text-white">
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
