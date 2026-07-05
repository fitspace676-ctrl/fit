import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { Archivo, JetBrains_Mono, Manrope } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import './globals.css';
import { SentryInit } from './sentry-init';
import { ThemeProvider, THEME_COOKIE, type Theme } from '@/components/theme/theme-provider';
import { AstryxProvider } from '@/components/theme/astryx-provider';
import { ThemeScript } from '@/components/theme/theme-script';

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
      // Both theme surfaces are stamped server-side from the cookie so the very
      // first paint is correct: the Tailwind `.dark` class drives the legacy
      // formacore screens, while `data-theme` (→ `color-scheme`, so Astryx's
      // `light-dark()` tokens resolve) and `data-astryx-theme="fit"` (activates
      // the @scope'd Fit brand token/component CSS) drive the Astryx surfaces.
      className={`${manrope.variable} ${archivo.variable} ${jetbrains.variable} ${theme === 'dark' ? 'dark' : ''}`}
      data-theme={theme}
      data-astryx-theme="fit"
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-ink-50 font-sans text-ink-900 antialiased dark:bg-ink-950 dark:text-white">
        {/* Reconcile the theme from the cookie before hydration so a statically
            cached document can never flash the wrong theme (belt-and-suspenders
            over the server-stamped attributes above). */}
        <ThemeScript />
        <SentryInit />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider initial={theme}>
            {/* Route theme switching through Astryx's <Theme>: it keeps
                `data-theme`/`data-astryx-theme` on <html> in lockstep with the
                toggle so Astryx surfaces flip instantly, no FOUC, brand colors. */}
            <AstryxProvider>{children}</AstryxProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
