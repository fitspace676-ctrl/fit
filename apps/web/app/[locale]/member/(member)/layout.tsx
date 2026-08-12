import type { ReactNode } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AuroraBackground, SkipLink, ToastProvider } from '@/src/components/ui';
import { MemberHeader } from '@/src/components/member/member-header';
import { MemberFooter } from '@/src/components/member/member-footer';
import { MobileTabBar } from '@/src/components/member/mobile-tab-bar';

/**
 * The member portal shell — the persistent chrome around every member screen:
 * the Aurora backdrop, the sticky header (logo, primary nav, theme toggle,
 * notifications, avatar), and the mobile bottom tab bar. Content is centered at
 * `max-w-[1200px]` with a bottom gutter that clears the mobile tab bar.
 */
export default async function MemberLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('member.shell');

  return (
    <ToastProvider>
      <SkipLink>{t('skipToContent')}</SkipLink>
      <AuroraBackground />
      <div className="relative flex min-h-screen flex-col">
        <MemberHeader />
        <main
          id="main-content"
          className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-24 pt-6 sm:px-6 sm:pt-8 lg:px-8 md:pb-10"
        >
          {children}
        </main>
        <MemberFooter />
        <MobileTabBar />
      </div>
    </ToastProvider>
  );
}
