import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { JetBrains_Mono, Noto_Sans_Georgian } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import './globals.css';
// Astryx component styles (layer `astryx-base`) load AFTER globals.css so the
// layer is declared last and outranks Tailwind's `tw-base` preflight — see the
// cascade note in globals.css (T11.17, mirroring the web fix in T11.7). A CSS
// `@import` inside globals.css would load before its own rules and invert this
// order, so it is imported here.
import '@astryxdesign/core/astryx.css';
import { SentryInit } from './sentry-init';
import { TopLoader } from '@/components/top-loader';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { THEME_COOKIE, resolveTheme, type Theme } from '@/lib/theme';
import { AstryxProvider } from '@/components/theme/astryx-provider';

/**
 * The one UI family — Noto Sans Georgian, body AND display (`font-sans` and
 * `font-display` both resolve to it).
 *
 * It replaced Manrope + Archivo, which is not a taste change: neither ships
 * Georgian, so every Georgian string in the console fell back to a system face
 * mid-sentence — two type systems fighting inside one heading, on a product
 * whose staff work in Georgian. Noto Sans Georgian covers Georgian and Latin on
 * the same skeleton at every weight, so a heading holds together. The member
 * portal made the same swap; this puts the two apps on one face.
 */
const notoGeorgian = Noto_Sans_Georgian({
  subsets: ['latin', 'georgian'],
  variable: '--font-noto-georgian',
  display: 'swap',
});
/**
 * Data/mono font — JetBrains Mono (`font-mono`). Not a utility face here: the
 * direction treats numerals as its primary visual accent, so every id, price,
 * count and clock time in the console is set in it.
 */
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'FormaCore - Admin',
  description: 'FormaCore admin console.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Seed the theme from the cookie so the painted `<html>` class matches the
  // client provider on first render — the console defaults to the dark skin.
  const theme: Theme = resolveTheme((await cookies()).get(THEME_COOKIE)?.value);

  // Resolve the active locale (from the `NEXT_LOCALE` cookie via i18n/request.ts)
  // and its catalogue so both server components and the client provider translate
  // against the same source of truth.
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${notoGeorgian.variable} ${jetbrains.variable} ${theme === 'dark' ? 'dark' : ''}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen font-sans antialiased">
        <SentryInit />
        <TopLoader />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider initial={theme}>
            <AstryxProvider>{children}</AstryxProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
