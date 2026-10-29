import type { ReactNode } from 'react';
import type { BlogLang } from '@fit/types';
import { Aurora, MarketingNav, MarketingFooter } from '@/components/marketing/marketing-ui';

export function BlogShell({ lang, children }: { lang: BlogLang; children: ReactNode }) {
  return (
    <div
      lang={lang}
      className="relative overflow-x-clip bg-surface font-sans text-fg antialiased selection:bg-brand-500/30"
    >
      <Aurora />
      <MarketingNav active="Blog" />
      <main className="relative z-10 mx-auto min-h-[60vh] max-w-[1180px] px-6 pb-20 pt-12 lg:px-10 lg:pt-16">
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
