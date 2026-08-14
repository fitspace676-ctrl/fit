import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SkipLink, ToastProvider } from '@/src/components/ui';
import { MemberHeader } from '@/src/components/member/member-header';
import { MemberFooter } from '@/src/components/member/member-footer';
import { MobileTabBar } from '@/src/components/member/mobile-tab-bar';

// FormaCore redesign (T11.10) — the shell frame in StyleX. The ambient Aurora
// backdrop (blurred indigo/iris blobs behind every screen) is gone: the
// direction bans gradient washes outright, and the canvas is now a single flat
// token. The bottom gutter clears the mobile tab bar, which hides at `lg`.

const styles = stylex.create({
  frame: {
    position: 'relative',
    display: 'flex',
    minHeight: '100vh',
    flexDirection: 'column',
  },
  main: {
    marginInline: 'auto',
    width: '100%',
    maxWidth: '1180px',
    flex: 1,
    paddingInline: {
      default: '1.5rem',
      '@media (min-width: 1024px)': '2.5rem',
    },
    paddingTop: '2.5rem',
    paddingBottom: {
      default: '7rem',
      '@media (min-width: 1024px)': '4rem',
    },
  },
});

/**
 * The member portal shell — the persistent chrome around every member screen:
 * the sticky header (logo, primary nav, theme toggle, notifications, avatar),
 * the contact footer, and the mobile bottom tab bar. Content is centered at
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
      <div {...stylex.props(styles.frame)}>
        <MemberHeader />
        <main id="main-content" {...stylex.props(styles.main)}>
          {children}
        </main>
        <MemberFooter />
        <MobileTabBar />
      </div>
    </ToastProvider>
  );
}
