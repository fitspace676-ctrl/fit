import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getActiveGymPortalSkin } from '@/lib/active-gym';
import { SkipLink, ToastProvider } from '@/src/components/ui';
import { MemberHeader } from '@/src/components/member/member-header';
import { MemberFooter } from '@/src/components/member/member-footer';
import { BottomNav } from '@/src/components/member/bottom-nav';

// FormaCore redesign (T11.10) — the shell frame in StyleX. The ambient Aurora
// backdrop (blurred indigo/iris blobs behind every screen) is gone: the
// direction bans gradient washes outright, and the canvas is now a single flat
// token. The bottom gutter clears the floating nav capsule, which is pinned to
// the foot of the screen at every width.

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
    // Clears the floating nav capsule, which is ~44px tall plus its rail.
    paddingBottom: '7rem',
  },
});

/**
 * The member portal shell — the persistent chrome around every member screen:
 * the sticky header (brand + account controls), the floating navigation capsule
 * at the foot of the screen, and the contact footer. Content is centered at
 * 1180px with a bottom gutter that clears the capsule.
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
  // The header is a client component and the tenant lookup is server-only (it
  // reads the request Host), so the gym's mark is resolved here and handed down.
  const [t, portal] = await Promise.all([
    getTranslations('member.shell'),
    getActiveGymPortalSkin(),
  ]);

  return (
    <ToastProvider>
      <SkipLink>{t('skipToContent')}</SkipLink>
      <div {...stylex.props(styles.frame)}>
        <MemberHeader logoUrl={portal?.logoUrl ?? null} />
        <main id="main-content" {...stylex.props(styles.main)}>
          {children}
        </main>
        <MemberFooter />
        <BottomNav />
      </div>
    </ToastProvider>
  );
}
