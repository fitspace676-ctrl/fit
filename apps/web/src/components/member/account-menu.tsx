'use client';

import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { focus, Popover } from '@/src/components/ui/kit';
import { Link, useRouter } from '@/src/i18n/navigation';
import { Icon } from '@/src/components/ui';
import { navCapsule } from './nav-capsule';
import { useSession } from '@/hooks/use-session';
import { logout } from '@/lib/auth';

// The member's own control, moved out of the header and down INTO the floating
// nav capsule.
//
// It sat top-right for as long as the header carried the navigation. Once the
// nav became the floating capsule and the bell followed it down, the header was
// left holding one personal control at the far end of a bar the member's thumb
// never reaches, while everything else they could press lived at the foot of the
// screen.
//
// The trigger is drawn from `navCapsule`, the same styles the six links use, and
// so it is: the artboards' lime squircle would have been the only object in the
// capsule with corners, and — being lime — indistinguishable from the item
// marking the page you are on. In the capsule the account is a quiet pill that
// lights up on hover like its neighbours, and it takes their label rule too:
// icon-only below `sm`, "Profile" beside it above.
//
// The panel opens UPWARD, on the kit `Popover`. The old menu was a hand-rolled
// absolute panel with its own scrim and its own click-outside handling, hung
// BELOW the trigger — pinned to the foot of the screen that put it off the
// viewport entirely. The kit popover already places above, already closes on
// Escape / outside click / Tab-away, and is the same panel the bell opens.

const styles = stylex.create({
  /* --------------------------------- panel -------------------------------- */
  // The popover paints the surface, border, radius and shadow; this is only the
  // list's own inset.
  menu: {
    paddingBlock: '0.5rem',
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

/**
 * The account control + its panel: the member's id, view profile, an "Admin
 * console" shortcut for staff (any role other than `MEMBER` — the tenant proxy
 * serves `/admin` on this same origin), and sign out. Sign-out clears the
 * session cookie and returns to the login page.
 */
export function AccountMenu() {
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
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      placement="above"
      align="end"
      label={t('nav.profile')}
      width={240}
      trigger={
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={t('nav.profile')}
          {...stylex.props(navCapsule.item, navCapsule.idle, focus.ring)}
        >
          <Icon name="user" sw={2.1} {...stylex.props(navCapsule.icon)} />
          <span {...stylex.props(navCapsule.label)}>{t('nav.profile')}</span>
        </button>
      }
    >
      <div {...stylex.props(styles.menu)}>
        {/* The artboards head this menu with WHO YOU ARE rather than with a
            link. They show a name over "Premium · Downtown Strength"; the client
            session carries only `userId` / `gymId` / `role` (it is decoded from
            the httpOnly access cookie by `/api/session`, which deliberately
            returns no profile), so this states the member id — the same
            `FC-XXXX` the dashboard and the check-in QR print, so a member
            reading it out to reception matches what staff see. The name would
            need a profile fetch on every page; it belongs here only once the
            session route carries it. */}
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
    </Popover>
  );
}
