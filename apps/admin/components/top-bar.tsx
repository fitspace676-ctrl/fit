'use client';

// @fit/admin — console top bar.
//
// Sits above the page content: the mobile drawer toggle, a branch switcher (the
// gym's active locations), the language switcher, a theme toggle, and a session
// menu (avatar → profile / settings / sign out). Sign-out clears the shared
// session cookie via `DELETE /api/session`.
//
// The branch switcher is the console's global data filter, not a local
// preference — its value is owned by `ActiveLocationProvider` and read by the
// server on every page. See `lib/active-location.ts` for why it is a cookie.
//
// The FRAME is still Astryx's `TopNav` + `MobileNavToggle`: those are part of
// the `AppShell` system and the toggle talks to the shell's own drawer state, so
// swapping them means rebuilding the responsive shell rather than re-skinning
// it. The CONTROLS inside are the portal's — `@fit/ui-kit`'s button, select,
// avatar and popover — so the console's chrome is the same hardware a member
// meets, at the same sizes, with the same one focus ring.
//
// The session menu was Astryx's `DropdownMenu`. The kit has no drop-in for it on
// purpose: a menu is a popover plus rows, and the portal's account menu is
// already exactly that. This is that pattern, so both apps dismiss, trap and
// restore focus through one implementation (`useDismissable`).

import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TopNav } from '@astryxdesign/core/TopNav';
import { MobileNavToggle } from '@astryxdesign/core/MobileNav';
import { Avatar, Button, Popover, SelectField, focus } from '@fit/ui-kit';
import { useSession } from '@/hooks/use-session';
import { Icon } from '@/components/ui';
import { useTheme } from '@/components/theme/theme-provider';
import { ALL_LOCATIONS } from '@/lib/active-location';
import { useActiveLocation } from './active-location';
import type { ShellLocation } from './admin-shell';
import { LocaleSwitcher } from './locale-switcher';
import { NavIcon } from './nav-icon';

/** Base path (`/admin` behind the tenant proxy); applied to non-router fetch/redirect. */
const BASE_PATH = process.env.NEXT_PUBLIC_ADMIN_BASE_PATH ?? '';

const styles = stylex.create({
  topNav: {
    minHeight: '4rem',
    paddingInline: '1.5rem',
    paddingBlock: '0.375rem',
    borderBlockEndWidth: '1px',
    borderBlockEndStyle: 'solid',
    borderBlockEndColor: 'var(--color-border)',
  },
  startContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    minWidth: 0,
  },
  // The switcher is chrome, so it takes the `card` height (40px) rather than the
  // field's own 52px — a form control in a 64px bar would fill it.
  locationSelect: {
    minWidth: 0,
    width: '15rem',
    maxWidth: '38vw',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  icon: {
    width: '1.25rem',
    height: '1.25rem',
  },
  glyph: {
    width: '1rem',
    height: '1rem',
  },

  /* ------------------------------ session menu ----------------------------- */
  // A squircle ringed in lime is how the artboards mark "this is you" — the same
  // mark the member header carries, so a staff member who is also a member meets
  // one identity glyph across both apps.
  avatarButton: {
    display: 'grid',
    placeItems: 'center',
    borderWidth: 0,
    borderRadius: 'var(--radius-inner)',
    backgroundColor: 'transparent',
    padding: 0,
    cursor: 'pointer',
  },
  menu: {
    paddingBlock: '0.5rem',
    minWidth: '13rem',
  },
  identity: {
    paddingInline: '1rem',
    paddingTop: '0.25rem',
    paddingBottom: '0.75rem',
  },
  identityRole: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.8125rem',
    fontWeight: 700,
    letterSpacing: '0.02em',
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
    fontFamily: 'inherit',
    fontSize: '0.8125rem',
    fontWeight: 600,
    cursor: 'pointer',
    color: { default: 'var(--color-text-secondary)', ':hover': 'var(--color-text-primary)' },
    transitionProperty: 'background-color, color',
    transitionDuration: '150ms',
  },
  menuDanger: {
    color: 'var(--color-text-red)',
  },
  menuRule: {
    marginBlock: '0.25rem',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
  },
});

export function TopBar({ locations }: { locations: ShellLocation[] }) {
  const { user, isLoading } = useSession();
  const { theme, toggle } = useTheme();
  const router = useRouter();
  const t = useTranslations('admin.common');
  const isDark = theme === 'dark';
  const [menuOpen, setMenuOpen] = useState(false);

  // The selection is not this component's state. It is the console's: a cookie
  // the server resolves before anything paints, an optional `?locationId=`
  // override, and a `router.refresh()` on change so every Server Component below
  // refetches for the new branch. All of that lives in `ActiveLocationProvider`
  // — the bar just draws the control. (It was `useState` + `localStorage` here,
  // which no server fetch could ever see.)
  const { active, canSelectAll, setActive } = useActiveLocation();

  // "All locations" is offered only to an operator whose role works gym-wide. A
  // role scoped to its assigned branches has no "every branch" to select — that
  // is the absence of its restriction, not one of its choices — so the option is
  // ABSENT rather than disabled. A disabled row would still tell them the view
  // exists and that they are being kept out of it; the honest control is one that
  // lists the branches they hold and nothing else.
  const locationOptions = [
    ...(canSelectAll ? [{ value: ALL_LOCATIONS, label: t('allLocations') }] : []),
    ...locations.map((location) => ({ value: location.id, label: location.name })),
  ];

  const signOut = async (): Promise<void> => {
    try {
      await fetch(`${BASE_PATH}/api/session`, { method: 'DELETE', credentials: 'same-origin' });
    } catch {
      // Ignore — redirect to /login regardless; middleware re-gates the session.
    }
    window.location.href = `${BASE_PATH}/login`;
  };

  /** Close the menu, then run the action — so focus returns before navigating. */
  function fromMenu(action: () => void): () => void {
    return () => {
      setMenuOpen(false);
      action();
    };
  }

  return (
    <TopNav
      label={t('consoleName')}
      xstyle={styles.topNav}
      startContent={
        <div {...stylex.props(styles.startContent)}>
          <MobileNavToggle label={t('openNav')} />
          {locations.length > 0 && (
            <SelectField
              label={t('locationLabel')}
              labelHidden
              size="chrome"
              // The location pin wears the brand treatment the nav glyphs do:
              // the gradient in light mode, the flat phosphor lime in dark.
              startIcon={<NavIcon name="locations" size={16} />}
              options={locationOptions}
              value={active}
              onChange={(event) => setActive(event.target.value)}
              xstyle={styles.locationSelect}
            />
          )}
        </div>
      }
      endContent={
        <div {...stylex.props(styles.actions)}>
          <LocaleSwitcher />

          <Button
            variant="ghost"
            size="card"
            iconOnly
            label={isDark ? t('switchToLight') : t('switchToDark')}
            onClick={toggle}
            icon={<Icon name={isDark ? 'sun' : 'moon'} {...stylex.props(styles.icon)} />}
          />

          {!isLoading && user && (
            <Popover
              open={menuOpen}
              onClose={() => setMenuOpen(false)}
              label={t('profile')}
              align="end"
              xstyle={styles.menu}
              trigger={
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-expanded={menuOpen}
                  aria-haspopup="dialog"
                  aria-label={t('profile')}
                  {...stylex.props(styles.avatarButton, focus.ring)}
                >
                  <Avatar name={user.role} size={36} shape="member" ring />
                </button>
              }
            >
              {/* The menu heads with WHO YOU ARE, like the portal's. The session
                  carries a role but no profile — `/api/session` decodes the
                  httpOnly cookie and deliberately returns none — so the role is
                  what there is to state, set in mono like every other
                  machine-derived string in the product. */}
              <div {...stylex.props(styles.identity)}>
                <p {...stylex.props(styles.identityRole)}>{user.role}</p>
              </div>
              <div {...stylex.props(styles.menuRule)} />

              <button
                type="button"
                onClick={fromMenu(() => router.push('/profile'))}
                {...stylex.props(styles.menuItem, focus.ring)}
              >
                <Icon name="user" {...stylex.props(styles.glyph)} />
                {t('profile')}
              </button>
              <button
                type="button"
                onClick={fromMenu(() => router.push('/settings'))}
                {...stylex.props(styles.menuItem, focus.ring)}
              >
                <Icon name="settings" {...stylex.props(styles.glyph)} />
                {t('settings')}
              </button>

              <div {...stylex.props(styles.menuRule)} />
              <button
                type="button"
                onClick={fromMenu(() => void signOut())}
                {...stylex.props(styles.menuItem, styles.menuDanger, focus.ring)}
              >
                <Icon name="logout" {...stylex.props(styles.glyph)} />
                {t('signOut')}
              </button>
            </Popover>
          )}
        </div>
      }
    />
  );
}
