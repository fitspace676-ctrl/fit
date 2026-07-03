import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { Archivo, JetBrains_Mono, Manrope } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import './globals.css';
import { SentryInit } from './sentry-init';
import { ThemeProvider, THEME_COOKIE, type Theme } from '@/components/theme/theme-provider';

/** UI body font — Manrope (`font-sans`). */
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope', display: 'swap' });
/** Display font — Archivo (`font-display`). */
const archivo = Archivo({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800', '900'],
  variable: '--font-archivo',
  display: 'swap',
});
/** Data/mono font — JetBrains Mono (`font-mono`). */
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Fit — Admin',
  description: 'Fit admin console.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Seed the theme from the cookie so the painted `<html>` class matches the
  // client provider on first render — the console defaults to the dark skin.
  const theme: Theme = (await cookies()).get(THEME_COOKIE)?.value === 'light' ? 'light' : 'dark';

  // Resolve the active locale (from the `NEXT_LOCALE` cookie via i18n/request.ts)
  // and its catalogue so both server components and the client provider translate
  // against the same source of truth.
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${manrope.variable} ${archivo.variable} ${jetbrains.variable} ${theme === 'dark' ? 'dark' : ''}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-ink-50 font-sans text-ink-900 antialiased dark:bg-ink-950 dark:text-white">
        <SentryInit />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider initial={theme}>{children}</ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
