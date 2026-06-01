import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { SentryInit } from './sentry-init';

export const metadata: Metadata = {
  title: 'Fit — Web',
  description: 'Fit web application.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white font-sans text-slate-900 antialiased">
        <SentryInit />
        {children}
      </body>
    </html>
  );
}
