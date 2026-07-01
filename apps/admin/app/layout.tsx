import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { Archivo, JetBrains_Mono, Manrope } from 'next/font/google';
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

  return (
    <html
      lang="en"
      className={`${manrope.variable} ${archivo.variable} ${jetbrains.variable} ${theme === 'dark' ? 'dark' : ''}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-ink-50 font-sans text-ink-900 antialiased dark:bg-ink-950 dark:text-white">
        <SentryInit />
        <ThemeProvider initial={theme}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
