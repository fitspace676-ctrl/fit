import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Archivo, JetBrains_Mono, Manrope } from 'next/font/google';
import './globals.css';

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
  title: 'Formacore — Run your gym on one platform',
  description:
    'Memberships, class booking, trainer scheduling, payments, and a branded member app — the all-in-one operating system for modern gyms and studios.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${archivo.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-surface font-sans text-ink-100 antialiased">{children}</body>
    </html>
  );
}
