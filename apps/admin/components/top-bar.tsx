'use client';

// @fit/admin — console top bar (Astryx, T11.17).
//
// Rebuilt on the Astryx `TopNav` over the Fit brand tokens. Sits above the page
// content: the mobile drawer toggle, a location switcher (the gym's active
// locations), the language switcher, a theme toggle, and a session menu (avatar →
// profile / settings / sign out). Sign-out clears the shared session cookie via
// `DELETE /api/session`.

import { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TopNav } from '@astryxdesign/core/TopNav';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Avatar } from '@astryxdesign/core/Avatar';
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';
import { Selector } from '@astryxdesign/core/Selector';
import { MobileNavToggle } from '@astryxdesign/core/MobileNav';
import { useSession } from '@/hooks/use-session';
import { Icon } from '@/components/ui';
import { useTheme } from '@/components/theme/theme-provider';
import type { ShellLocation } from './admin-shell';
import { LocaleSwitcher } from './locale-switcher';

/** localStorage key persisting the selected location across reloads. */
const LOCATION_STORAGE_KEY = 'fit-admin-active-location';
/** Sentinel value for the "all locations" option. */
const ALL_LOCATIONS = 'all';

/** Base path (`/admin` behind the tenant proxy); applied to non-router fetch/redirect. */
const BASE_PATH = process.env.NEXT_PUBLIC_ADMIN_BASE_PATH ?? '';

const styles = stylex.create({
  topNav: {
    minHeight: '3.5rem',
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
  btnIcon: {
    width: '1rem',
    height: '1rem',
  },
});

export function TopBar({ locations }: { locations: ShellLocation[] }) {
  const { user, isLoading } = useSession();
  const { theme, toggle } = useTheme();
  const router = useRouter();
  const t = useTranslations('admin.common');
  const isDark = theme === 'dark';
  const [locationId, setLocationId] = useState(ALL_LOCATIONS);

  // Restore the persisted selection after mount (kept out of the initial render
  // so server and client markup match), ignoring a stale id no longer present.
  useEffect(() => {
    const stored = window.localStorage.getItem(LOCATION_STORAGE_KEY);
    if (stored && (stored === ALL_LOCATIONS || locations.some((l) => l.id === stored))) {
      setLocationId(stored);
    }
  }, [locations]);

  function onLocationChange(value: string): void {
    setLocationId(value);
    try {
      window.localStorage.setItem(LOCATION_STORAGE_KEY, value);
    } catch {
      // Private mode / storage disabled — selection still lives in component state.
    }
  }

  const locationOptions = [
    { value: ALL_LOCATIONS, label: t('allLocations') },
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

  return (
    <TopNav
      label={t('consoleName')}
      xstyle={styles.topNav}
      startContent={
        <div {...stylex.props(styles.startContent)}>
          <MobileNavToggle label={t('openNav')} />
          {locations.length > 0 && (
            <Selector
              label={t('locationLabel')}
              isLabelHidden
              startIcon={<Icon name="pin" {...stylex.props(styles.btnIcon)} />}
              options={locationOptions}
              value={locationId}
              onChange={onLocationChange}
              size="md"
              xstyle={styles.locationSelect}
            />
          )}
        </div>
      }
      endContent={
        <div {...stylex.props(styles.actions)}>
          <LocaleSwitcher />

          <IconButton
            variant="ghost"
            size="md"
            label={isDark ? t('switchToLight') : t('switchToDark')}
            onClick={toggle}
            icon={<Icon name={isDark ? 'sun' : 'moon'} {...stylex.props(styles.icon)} />}
          />

          {!isLoading && user && (
            <DropdownMenu
              button={{
                label: user.role,
                variant: 'ghost',
                size: 'md',
                isIconOnly: true,
                icon: <Avatar name={user.role} size={32} />,
              }}
              items={[
                {
                  label: t('profile'),
                  icon: <Icon name="user" {...stylex.props(styles.btnIcon)} />,
                  onClick: () => router.push('/profile'),
                },
                {
                  label: t('settings'),
                  icon: <Icon name="settings" {...stylex.props(styles.btnIcon)} />,
                  onClick: () => router.push('/settings'),
                },
                { type: 'divider' },
                {
                  label: t('signOut'),
                  icon: <Icon name="logout" {...stylex.props(styles.btnIcon)} />,
                  onClick: () => void signOut(),
                },
              ]}
            />
          )}
        </div>
      }
    />
  );
}
