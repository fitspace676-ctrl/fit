'use client';

import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/src/i18n/navigation';
import { Icon } from '@/src/components/ui';
import { useSession } from '@/hooks/use-session';
import { logout } from '@/lib/auth';
import { LocaleSwitcher } from '@/src/components/LocaleSwitcher';
import { ThemeToggle } from './theme-toggle';

// FormaCore redesign (T11.10) — the member shell, off Tailwind and onto compiled
// StyleX over the FormaCore theme, and matched to the `web-member-*` artboards
// measurement for measurement rather than approximately:
//
//   bar        80px tall, content capped at 1180px, 24px gutter (40px from lg)
//   logo       40px lime tile at the `inner` radius, 19px extrabold wordmark
//   actions    40px controls on the `--fc-control` surface; the avatar is a
//              SQUIRCLE (not a circle) ringed in lime, which is how the artboards
//              mark "this is you"
//   menu       240px, 14px bold name over the plan · gym line
//
// The header carries NO navigation. The primary nav is the floating capsule in
// `bottom-nav.tsx`, at every width — see the note there. What is left here is the
// brand mark and the account controls, which is why the bar keeps its height but
// loses its middle. The notification bell went with the nav — it is a floating
// capsule beside it now, so what happened while you were away is answered in the
// same place you steer from.
//
// The cart shortcut went too, and the language switch took its place. The cart is
// reached from the shop, where a basket is something you are already carrying;
// parked in the chrome it was a permanent affordance for a page most visits never
// touch. Language is the opposite — it belongs beside the theme switch, the pair
// the auth screens already show together, because both change how the whole
// portal reads rather than where you are in it.

const styles = stylex.create({
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 30,
    // No rule under the bar. It had one when the header carried the navigation
    // and needed to read as a separate deck; with the nav moved to the floating
    // capsule, the header is just a brand mark and two switches sitting on the
    // canvas, and a full-width line across the page only drew a seam where there
    // is no longer a division. Scroll separation is the translucency's job.
    //
    // The artboards' one translucent surface: the canvas at 95% behind a small
    // blur, so content scrolling under the bar is sensed but never legible.
    backgroundColor: 'var(--fc-header)',
    backdropFilter: 'blur(8px)',
  },
  bar: {
    marginInline: 'auto',
    display: 'flex',
    height: '5rem',
    width: '100%',
    maxWidth: '1180px',
    alignItems: 'center',
    gap: '1.5rem',
    paddingInline: {
      default: '1.5rem',
      '@media (min-width: 1024px)': '2.5rem',
    },
  },

  /* --------------------------------- brand -------------------------------- */
  logo: {
    display: 'flex',
    flexShrink: 0,
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
    fontSize: '1.1875rem',
    fontWeight: 800,
    letterSpacing: '-0.025em',
    color: 'var(--color-text-primary)',
  },

  /* -------------------------------- actions ------------------------------- */
  actions: {
    marginInlineStart: 'auto',
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: '0.5rem',
  },
  // Header controls sit on the header surface, so they take the opposite step:
  // white in light, the panel colour in dark — the artboards' `t.iconBtn`.

  /* -------------------------------- avatar -------------------------------- */
  avatarWrap: {
    position: 'relative',
  },
  // A squircle ringed in lime — the artboards never draw the member as a circle,
  // which is what keeps them distinct from the round trainer avatars.
  avatar: {
    display: 'grid',
    placeItems: 'center',
    height: '2.5rem',
    width: '2.5rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: 0,
    boxShadow: '0 0 0 2px var(--color-accent)',
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
    cursor: 'pointer',
    transitionProperty: 'transform',
    transitionDuration: '150ms',
    ':hover': { transform: 'scale(1.05)' },
  },
  avatarIcon: {
    height: '1.25rem',
    width: '1.25rem',
  },

  /* ------------------------------ account menu ---------------------------- */
  scrim: {
    position: 'fixed',
    inset: 0,
    zIndex: 40,
    borderWidth: 0,
    backgroundColor: 'transparent',
    cursor: 'default',
  },
  menu: {
    position: 'absolute',
    insetInlineEnd: 0,
    zIndex: 50,
    marginTop: '0.75rem',
    width: '15rem',
    overflow: 'hidden',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-popover)',
    paddingBlock: '0.5rem',
    // Floating chrome is the one thing the direction lets carry elevation.
    boxShadow: 'var(--shadow-high)',
  },
  menuIdentity: {
    paddingInline: '1rem',
    paddingTop: '0.5rem',
    paddingBottom: '0.75rem',
  },
  menuName: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.875rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  menuItem: {
    display: 'flex',
    width: '100%',
    alignItems: 'center',
    gap: '0.625rem',
    borderWidth: 0,
    backgroundColor: { default: 'transparent', ':hover': 'var(--color-overlay-hover)' },
    paddingInline: '1rem',
    paddingBlock: '0.625rem',
    textAlign: 'start',
    fontSize: '0.8125rem',
    fontWeight: 600,
    textDecoration: 'none',
    cursor: 'pointer',
    color: { default: 'var(--color-text-secondary)', ':hover': 'var(--color-text-primary)' },
    transitionProperty: 'background-color, color',
    transitionDuration: '150ms',
  },
  menuDanger: {
    color: 'var(--color-text-red)',
  },
  menuIcon: {
    height: '1rem',
    width: '1rem',
  },
  menuRule: {
    marginBlock: '0.25rem',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
  },
});

/**
 * The member's public id, `FC-` + the last four of their user id, uppercased.
 * The dashboard's membership block and the check-in QR derive it the same way,
 * so the three agree — a member reading it out to reception matches the record
 * staff have open.
 */
function memberIdOf(userId: string): string {
  return `FC-${userId.slice(-4).toUpperCase()}`;
}

/** Brand mark — the lime bolt tile + wordmark, linking home. */
function Logo({ label }: { label: string }) {
  return (
    <Link href="/member/home" {...stylex.props(styles.logo)}>
      <span {...stylex.props(styles.logoMark)}>
        <Icon name="bolt" sw={2.4} {...stylex.props(styles.logoIcon)} />
      </span>
      <span {...stylex.props(styles.logoWord)}>{label}</span>
    </Link>
  );
}

/**
 * Avatar button + account dropdown: the member's name over their plan, view
 * profile, an "Admin console" shortcut for staff (any role other than `MEMBER` —
 * the tenant proxy serves `/admin` on this same origin), and sign out. Sign-out
 * clears the session cookie and returns to the login page.
 */
function AccountMenu() {
  const t = useTranslations('member');
  const router = useRouter();
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const isStaff = Boolean(user && user.role !== 'MEMBER');

  const onLogout = (): void => {
    setOpen(false);
    void logout().finally(() => router.replace('/member/login'));
  };

  return (
    <div {...stylex.props(styles.avatarWrap)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('nav.profile')}
        aria-expanded={open}
        {...stylex.props(styles.avatar)}
      >
        <Icon name="user" sw={2.2} {...stylex.props(styles.avatarIcon)} />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            {...stylex.props(styles.scrim)}
          />
          <div {...stylex.props(styles.menu)}>
            {/* The artboards head this menu with WHO YOU ARE rather than with a
                link. They show a name over "Premium · Downtown Strength"; the
                client session carries only `userId` / `gymId` / `role` (it is
                decoded from the httpOnly access cookie by `/api/session`, which
                deliberately returns no profile), so this states the member id —
                the same `FC-XXXX` the dashboard and the check-in QR print, so a
                member reading it out to reception matches what staff see. The
                name would need a profile fetch on every page; it belongs here
                only once the session route carries it. */}
            {user ? (
              <>
                <div {...stylex.props(styles.menuIdentity)}>
                  <p {...stylex.props(styles.menuName)}>{memberIdOf(user.userId)}</p>
                </div>
                <div {...stylex.props(styles.menuRule)} />
              </>
            ) : null}
            <Link
              href="/member/account/profile"
              onClick={() => setOpen(false)}
              {...stylex.props(styles.menuItem)}
            >
              <Icon name="user" sw={2.1} {...stylex.props(styles.menuIcon)} />
              {t('shell.viewProfile')}
            </Link>
            {isStaff && (
              <a href="/admin" {...stylex.props(styles.menuItem)}>
                <Icon name="grid" sw={2.1} {...stylex.props(styles.menuIcon)} />
                {t('shell.adminConsole')}
              </a>
            )}
            <div {...stylex.props(styles.menuRule)} />
            <button
              type="button"
              onClick={onLogout}
              {...stylex.props(styles.menuItem, styles.menuDanger)}
            >
              <Icon name="logout" sw={2.1} {...stylex.props(styles.menuIcon)} />
              {t('shell.signOut')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Persistent member-portal header: logo, primary nav, theme/notifications/avatar. */
export function MemberHeader() {
  const t = useTranslations('member');

  return (
    <header {...stylex.props(styles.header)}>
      <div {...stylex.props(styles.bar)}>
        <Logo label={t('shell.brand')} />

        <div {...stylex.props(styles.actions)}>
          <ThemeToggle />
          <LocaleSwitcher />
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
