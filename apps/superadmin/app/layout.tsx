import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { SentryInit } from './sentry-init';

export const metadata: Metadata = {
  title: 'Fit — SuperAdmin',
  description: 'Fit platform operator console.',
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
