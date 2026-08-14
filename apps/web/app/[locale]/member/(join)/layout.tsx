import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/src/i18n/navigation';
import { LocaleSwitcher } from '@/src/components/LocaleSwitcher';
import { Icon, SkipLink, ToastProvider } from '@/src/components/ui';

// FormaCore redesign (T11.10) — the join shell in StyleX. The artboards treat
// this and the login screen as one pair: same charcoal canvas, no nav, a logo
// and a locale switcher, and nothing else competing with the single lime block
// the page is built around (there, the order summary).

const styles = stylex.create({
  frame: {
    position: 'relative',
    display: 'flex',
    minHeight: '100vh',
    flexDirection: 'column',
  },
  header: {
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
  },
  bar: {
    marginInline: 'auto',
    display: 'flex',
    height: '5rem',
    maxWidth: '1180px',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    paddingInline: {
      default: '1.5rem',
      '@media (min-width: 1024px)': '2.5rem',
    },
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.625rem',
    textDecoration: 'none',
  },
  logoMark: {
    display: 'grid',
    placeItems: 'center',
    height: '2.5rem',
    width: '2.5rem',
    borderRadius: 'var(--radius-inner)',
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
  },
  logoIcon: {
    height: '1.25rem',
    width: '1.25rem',
  },
  logoWord: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.25rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  main: {
    flex: 1,
  },
});

/**
 * The join funnel's shell — the chrome around the purchase wizard and its
 * confirmation.
 *
 * Deliberately *not* the member portal's. The wizard's whole audience is people
 * who are not members yet, and the portal header offers them a menu they cannot
 * use: bookings they have none of, a cart, notifications, an account avatar. So
 * this group carries only what a checkout needs — the brand mark (an exit back
 * to the site) and a locale switcher.
 *
 * The route group changes no URLs: the wizard stays at `/member/checkout`. It exists
 * purely to break the layout inheritance that put the member nav on a page for
 * non-members.
 *
 * A member *renewing* their membership passes through here too (the membership
 * page links to `/member/checkout`); the brand mark is their way back out, and the
 * wizard's own Back button walks the steps.
 */
export default async function JoinLayout({
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
        <header {...stylex.props(styles.header)}>
          <div {...stylex.props(styles.bar)}>
            {/* Home, not `/member/home`: a signed-out visitor has no member home to land on. */}
            <Link href="/" {...stylex.props(styles.logo)}>
              <span {...stylex.props(styles.logoMark)}>
                <Icon name="bolt" sw={2.4} {...stylex.props(styles.logoIcon)} />
              </span>
              <span {...stylex.props(styles.logoWord)}>{t('brand')}</span>
            </Link>
            <LocaleSwitcher />
          </div>
        </header>

        <main id="main-content" {...stylex.props(styles.main)}>
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
