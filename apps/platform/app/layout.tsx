import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Archivo, JetBrains_Mono, Manrope } from 'next/font/google';
import './globals.css';
import { SentryInit } from './sentry-init';

/**
 * Marketing type pairing from the design system: Manrope for body/UI, Archivo
 * for display headings, JetBrains Mono for code/eyebrow accents. Loaded via
 * `next/font` so the weights are self-hosted (no layout shift, no external
 * font request) and exposed as CSS variables the Tailwind config consumes.
 */
const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-manrope',
  display: 'swap',
});

const archivo = Archivo({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800', '900'],
  variable: '--font-archivo',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Formacore - Run your gym on one platform',
  description:
    'Memberships, class booking, trainer scheduling, payments, and a branded member app — the all-in-one operating system for modern gyms and studios.',
};

/**
 * Sets the `.dark` class on <html> before first paint, from a saved choice or
 * the OS preference, so the page never flashes the wrong theme. Kept tiny and
 * inline; the in-page toggle updates the same class + localStorage key.
 */
const themeScript = `(function(){try{var s=localStorage.getItem('theme');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${manrope.variable} ${archivo.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-surface font-sans text-fg antialiased">
        <SentryInit />
        {children}
      </body>
    </html>
  );
}
