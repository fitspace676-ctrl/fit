import type { ReactNode } from 'react';
import type { BlogLang } from '@fit/types';
import { Aurora, MarketingNav, MarketingFooter } from '@/components/marketing/marketing-ui';

export function BlogShell({ lang, children }: { lang: BlogLang; children: ReactNode }) {
  return (
    <div
      lang={lang}
      className="relative flex min-h-dvh flex-col overflow-x-clip bg-surface font-sans text-fg antialiased selection:bg-brand-500/30"
    >
      <Aurora />
      <MarketingNav active="resources" />
      <main className="relative z-10 mx-auto w-full max-w-[1180px] flex-1 px-6 pb-20 pt-12 lg:px-10 lg:pt-16">
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
