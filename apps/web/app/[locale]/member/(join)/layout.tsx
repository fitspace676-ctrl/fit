import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getActiveGymPortalSkin } from '@/lib/active-gym';
import { Link } from '@/src/i18n/navigation';
import { LocaleSwitcher } from '@/src/components/LocaleSwitcher';
import { PortalLogo } from '@/src/components/member/portal-logo';
import { ThemeToggle } from '@/src/components/member/theme-toggle';
import { SkipLink, ToastProvider } from '@/src/components/ui';

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
    textDecoration: 'none',
  },
  switches: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
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
  // The tenant's own mark for the header, from the same cached lookup the sign-in
  // screen reads. `null` — no tenant in scope, or a gym that has uploaded nothing
  // — is the bundled FormaCore wordmark, which is what this header showed before
  // a gym could supply one.
  const [t, portal] = await Promise.all([
    getTranslations('member.shell'),
    getActiveGymPortalSkin(),
  ]);

  return (
    <ToastProvider>
      <SkipLink>{t('skipToContent')}</SkipLink>
      <div {...stylex.props(styles.frame)}>
        <header {...stylex.props(styles.header)}>
          <div {...stylex.props(styles.bar)}>
            {/* Home, not `/member/home`: a signed-out visitor has no member home to land on. */}
            <Link href="/" aria-label={t('brand')} {...stylex.props(styles.logo)}>
              <PortalLogo logoUrl={portal?.logoUrl ?? null} />
            </Link>
            <div {...stylex.props(styles.switches)}>
              <ThemeToggle />
              <LocaleSwitcher />
            </div>
          </div>
        </header>

        <main id="main-content" {...stylex.props(styles.main)}>
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
