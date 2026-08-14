'use client';

import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/src/i18n/navigation';
import { Icon } from '@/src/components/ui';
import { useSession } from '@/hooks/use-session';
import { logout } from '@/lib/auth';
import { ThemeToggle } from './theme-toggle';
import { NotificationBell } from './notification-bell';
import { NAV_ITEMS, isActive } from './nav-items';

// FormaCore redesign (T11.10) — the member shell, off Tailwind and onto compiled
// StyleX over the FormaCore theme, and matched to the `web-member-*` artboards
// measurement for measurement rather than approximately:
//
//   bar        80px tall, content capped at 1180px, 24px gutter (40px from lg)
//   logo       40px lime tile at the `inner` radius, 19px extrabold wordmark
//   nav        CENTERED in the remaining space, 40px pills, 14px semibold,
//              17px icons, active = solid lime with ink-950 type
//   actions    40px controls on the `--fc-control` surface; the avatar is a
//              SQUIRCLE (not a circle) ringed in lime, which is how the artboards
//              mark "this is you"
//   menu       240px, 14px bold name over the plan · gym line
//
// The nav collapses to the drawer at `lg`, matching the artboards' own
// `hidden lg:flex` — six Georgian labels do not fit a tablet.

const styles = stylex.create({
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 30,
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
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

  /* ---------------------------------- nav --------------------------------- */
  nav: {
    display: {
      default: 'none',
      '@media (min-width: 1024px)': 'flex',
    },
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.25rem',
  },
  navItem: {
    display: 'flex',
    height: '2.5rem',
    alignItems: 'center',
    gap: '0.5rem',
    borderRadius: 'var(--radius-inner)',
    paddingInline: '1rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    textDecoration: 'none',
    transitionProperty: 'background-color, color',
    transitionDuration: '150ms',
  },
  navIdle: {
    color: 'var(--color-text-secondary)',
    backgroundColor: { default: 'transparent', ':hover': 'var(--color-tint-hover)' },
  },
  navActive: {
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
  },
  navIcon: {
    height: '1.0625rem',
    width: '1.0625rem',
  },

  /* -------------------------------- actions ------------------------------- */
  actions: {
    marginInlineStart: {
      default: 'auto',
      '@media (min-width: 1024px)': 0,
    },
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: '0.5rem',
  },
  // Header controls sit on the header surface, so they take the opposite step:
  // white in light, the panel colour in dark — the artboards' `t.iconBtn`.
  iconBtn: {
    position: 'relative',
    display: 'grid',
    placeItems: 'center',
    height: '2.5rem',
    width: '2.5rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--fc-tile-border)',
    backgroundColor: 'var(--fc-control)',
    color: { default: 'var(--color-icon-secondary)', ':hover': 'var(--color-icon-primary)' },
    cursor: 'pointer',
    textDecoration: 'none',
    transitionProperty: 'color',
    transitionDuration: '150ms',
  },
  actionIcon: {
    height: '1.125rem',
    width: '1.125rem',
  },
  menuToggle: {
    display: {
      default: 'grid',
      '@media (min-width: 1024px)': 'none',
    },
  },

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
    backgroundColor: { default: 'transparent', ':hover': 'var(--color-tint-hover)' },
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

  /* ------------------------------ mobile drawer --------------------------- */
  drawer: {
    display: {
      default: 'block',
      '@media (min-width: 1024px)': 'none',
    },
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-body)',
    paddingInline: '1.5rem',
    paddingTop: '0.5rem',
    paddingBottom: '1rem',
  },
  drawerNav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  drawerItem: {
    display: 'flex',
    height: '2.75rem',
    width: '100%',
    alignItems: 'center',
    gap: '0.75rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: 0,
    backgroundColor: 'transparent',
    paddingInline: '1rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    textAlign: 'start',
    textDecoration: 'none',
    cursor: 'pointer',
  },
  drawerIcon: {
    height: '1.25rem',
    width: '1.25rem',
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
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useSession();
  const [navOpen, setNavOpen] = useState(false);
  const isStaff = Boolean(user && user.role !== 'MEMBER');

  const onLogout = (): void => {
    setNavOpen(false);
    void logout().finally(() => router.replace('/member/login'));
  };

  return (
    <header {...stylex.props(styles.header)}>
      <div {...stylex.props(styles.bar)}>
        <Logo label={t('shell.brand')} />

        <nav {...stylex.props(styles.nav)}>
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                {...stylex.props(styles.navItem, active ? styles.navActive : styles.navIdle)}
              >
                <Icon name={item.icon} sw={2.2} {...stylex.props(styles.navIcon)} />
                {t(`nav.${item.key}`)}
              </Link>
            );
          })}
        </nav>

        <div {...stylex.props(styles.actions)}>
          <ThemeToggle />
          <Link href="/member/cart" aria-label={t('nav.cart')} {...stylex.props(styles.iconBtn)}>
            <Icon name="bag" {...stylex.props(styles.actionIcon)} />
          </Link>
          <NotificationBell />
          <AccountMenu />

          <button
            type="button"
            onClick={() => setNavOpen((v) => !v)}
            aria-label={navOpen ? t('shell.closeMenu') : t('shell.openMenu')}
            aria-expanded={navOpen}
            {...stylex.props(styles.iconBtn, styles.menuToggle)}
          >
            <Icon name={navOpen ? 'x' : 'filter'} {...stylex.props(styles.actionIcon)} />
          </button>
        </div>
      </div>

      {navOpen && (
        <div {...stylex.props(styles.drawer)}>
          <nav {...stylex.props(styles.drawerNav)}>
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={() => setNavOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  {...stylex.props(styles.drawerItem, active ? styles.navActive : styles.navIdle)}
                >
                  <Icon name={item.icon} sw={2.1} {...stylex.props(styles.drawerIcon)} />
                  {t(`nav.${item.key}`)}
                </Link>
              );
            })}

            <div {...stylex.props(styles.menuRule)} />
            {isStaff && (
              <a href="/admin" {...stylex.props(styles.drawerItem, styles.navIdle)}>
                <Icon name="grid" sw={2.1} {...stylex.props(styles.drawerIcon)} />
                {t('shell.adminConsole')}
              </a>
            )}
            <button
              type="button"
              onClick={onLogout}
              {...stylex.props(styles.drawerItem, styles.menuDanger)}
            >
              <Icon name="logout" sw={2.1} {...stylex.props(styles.drawerIcon)} />
              {t('shell.signOut')}
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}
