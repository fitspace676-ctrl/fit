import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ToastProvider } from '@/src/components/ui';
import { AstryxProvider } from '@/src/components/theme/astryx-provider';
import { MemberHeader } from '@/src/components/member/member-header';
import { MobileTabBar } from '@/src/components/member/mobile-tab-bar';

/**
 * The member portal shell — the persistent chrome around every member screen:
 * the branded backdrop, the sticky Astryx `TopNav` header (logo, primary nav,
 * theme toggle, notifications, avatar), and the mobile bottom tab bar. Content is
 * centered at `1200px` with a bottom gutter that clears the mobile tab bar.
 *
 * Astryx migration (T11.10): the shell is now wrapped in `AstryxProvider`, which
 * stamps `data-astryx-theme="fit"` + the light/dark `color-scheme` so every
 * Astryx component and token `var(--color-*)` below resolves to the Fit brand.
 * The container, skip link, and accent aura are authored in compiled StyleX on
 * those tokens — no Tailwind utilities and no formacore Aurora glass.
 */
const styles = stylex.create({
  shell: {
    position: 'relative',
    isolation: 'isolate',
    display: 'flex',
    minHeight: '100vh',
    flexDirection: 'column',
    backgroundColor: 'var(--color-background-body)',
  },
  aura: {
    pointerEvents: 'none',
    position: 'absolute',
    inset: 0,
    zIndex: -1,
    backgroundImage:
      'radial-gradient(50% 40% at 8% -8%, color-mix(in srgb, var(--color-accent) 14%, transparent), transparent 70%), radial-gradient(45% 40% at 100% 0%, color-mix(in srgb, var(--color-accent) 10%, transparent), transparent 70%)',
  },
  main: {
    marginInline: 'auto',
    width: '100%',
    maxWidth: '1200px',
    flex: 1,
    paddingInline: {
      default: '1rem',
      '@media (min-width: 640px)': '1.5rem',
      '@media (min-width: 1024px)': '2rem',
    },
    paddingTop: {
      default: '1.5rem',
      '@media (min-width: 640px)': '2rem',
    },
    // Clear the fixed mobile tab bar on small screens; normal gutter from `md`.
    paddingBottom: {
      default: '6rem',
      '@media (min-width: 768px)': '2.5rem',
    },
  },
  skipLink: {
    position: 'fixed',
    top: '1rem',
    insetInlineStart: '1rem',
    zIndex: 100,
    paddingBlock: '0.5rem',
    paddingInline: '0.875rem',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-surface)',
    color: 'var(--color-text-accent)',
    fontSize: '0.875rem',
    fontWeight: 600,
    textDecoration: 'none',
    boxShadow: 'var(--shadow-med)',
    transitionProperty: 'transform, opacity',
    transitionDuration: '150ms',
    opacity: {
      default: 0,
      ':focus': 1,
    },
    pointerEvents: {
      default: 'none',
      ':focus': 'auto',
    },
    transform: {
      default: 'translateY(-200%)',
      ':focus': 'translateY(0)',
    },
  },
});

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
    <AstryxProvider>
      <ToastProvider>
        <a href="#main-content" {...stylex.props(styles.skipLink)}>
          {t('skipToContent')}
        </a>
        <div {...stylex.props(styles.shell)}>
          <div aria-hidden {...stylex.props(styles.aura)} />
          <MemberHeader />
          <main id="main-content" {...stylex.props(styles.main)}>
            {children}
          </main>
          <MobileTabBar />
        </div>
      </ToastProvider>
    </AstryxProvider>
  );
}
