'use client';

// @fit/admin — console top bar (Astryx, T11.17).
//
// Rebuilt on the Astryx `TopNav` over the Fit brand tokens. Sits above the page
// content: the mobile drawer toggle, the gym being managed, a search field, a
// quick-sale shortcut, the language switcher, a theme toggle, notifications, and
// a session menu (role + sign out). Sign-out clears the shared session cookie
// via `DELETE /api/session`.

import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import { TopNav } from '@astryxdesign/core/TopNav';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Avatar } from '@astryxdesign/core/Avatar';
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';
import { MobileNavToggle } from '@astryxdesign/core/MobileNav';
import { useSession } from '@/hooks/use-session';
import { Icon } from '@/components/ui';
import { useTheme } from '@/components/theme/theme-provider';
import { LocaleSwitcher } from './locale-switcher';

/** Base path (`/admin` behind the tenant proxy); applied to non-router fetch/redirect. */
const BASE_PATH = process.env.NEXT_PUBLIC_ADMIN_BASE_PATH ?? '';

const styles = stylex.create({
  search: {
    width: '32rem',
    maxWidth: '40vw',
    height: '2.5rem',
    alignItems: 'center',
    gap: '0.5rem',
    paddingInline: '0.75rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border-emphasized)',
      ':focus-within': 'var(--color-accent)',
    },
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-surface)',
    boxSizing: 'border-box',
    display: {
      default: 'none',
      '@media (min-width: 640px)': 'flex',
    },
  },
  searchInput: {
    width: '100%',
    minWidth: 0,
    height: '100%',
    padding: 0,
    borderWidth: 0,
    outline: 'none',
    backgroundColor: 'transparent',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family-body)',
    fontSize: '0.875rem',
    lineHeight: 1,
    '::placeholder': {
      color: 'var(--color-text-secondary)',
    },
  },
  topNav: {
    minHeight: '5.5rem',
    paddingInline: '1.5rem',
    borderBlockEndWidth: '1px',
    borderBlockEndStyle: 'solid',
    borderBlockEndColor: 'var(--color-border)',
  },
  startContent: {
    display: 'flex',
    alignItems: 'center',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  quickSale: {
    display: {
      default: 'none',
      '@media (min-width: 640px)': 'inline-flex',
    },
  },
  bellWrap: {
    position: 'relative',
    display: 'inline-flex',
  },
  bellDot: {
    position: 'absolute',
    top: '0.375rem',
    right: '0.375rem',
    height: '0.5rem',
    width: '0.5rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent)',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: 'var(--color-background-body)',
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

export function TopBar() {
  const { user, isLoading } = useSession();
  const { theme, toggle } = useTheme();
  const t = useTranslations('admin.common');
  const [query, setQuery] = useState('');
  const isDark = theme === 'dark';

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
          <label {...stylex.props(styles.search)}>
            <Icon name="search" {...stylex.props(styles.btnIcon)} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('search')}
              aria-label={t('search')}
              {...stylex.props(styles.searchInput)}
            />
          </label>
        </div>
      }
      endContent={
        <div {...stylex.props(styles.actions)}>
          <span {...stylex.props(styles.quickSale)}>
            <Button
              as={NextLink}
              href="/pos"
              variant="primary"
              size="md"
              icon={<Icon name="plus" sw={2.4} {...stylex.props(styles.btnIcon)} />}
              label={t('quickSale')}
            />
          </span>

          <LocaleSwitcher />

          <IconButton
            variant="ghost"
            size="md"
            label={isDark ? t('switchToLight') : t('switchToDark')}
            onClick={toggle}
            icon={<Icon name={isDark ? 'sun' : 'moon'} {...stylex.props(styles.icon)} />}
          />

          <span {...stylex.props(styles.bellWrap)}>
            <IconButton
              variant="ghost"
              size="md"
              label={t('notifications')}
              icon={<Icon name="bell" {...stylex.props(styles.icon)} />}
            />
            <span aria-hidden {...stylex.props(styles.bellDot)} />
          </span>

          {!isLoading && user && (
            <DropdownMenu
              button={{
                label: user.role,
                variant: 'ghost',
                size: 'md',
                icon: <Avatar name={user.role} size={32} />,
              }}
              hasChevron
              items={[
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
