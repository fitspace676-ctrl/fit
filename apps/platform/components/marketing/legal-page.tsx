'use client';

import type { ReactNode } from 'react';
import { Aurora, MarketingFooter, MarketingNav } from './marketing-ui';

/**
 * Shared shell for the legal pages (/privacy, /terms): the marketing chrome
 * around a readable single column of text.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="font-sans bg-surface text-fg antialiased relative overflow-x-clip selection:bg-brand-500/30">
      <Aurora />
      <MarketingNav />
      <main className="relative z-10 mx-auto w-full max-w-[760px] px-6 pb-20 pt-12 lg:pt-16">
        <h1 className="font-display text-4xl font-black tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-3 font-mono text-xs text-faint">{updated}</p>
        <div className="mt-10 space-y-5 text-base leading-relaxed text-strong [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-black [&_h2]:text-fg [&_a]:text-brand-600 [&_a]:underline dark:[&_a]:text-brand-300">
          {children}
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
