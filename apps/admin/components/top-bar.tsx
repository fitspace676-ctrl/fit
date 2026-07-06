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
import { TextInput } from '@astryxdesign/core/TextInput';
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';
import { MobileNavToggle } from '@astryxdesign/core/MobileNav';
import { useSession } from '@/hooks/use-session';
import { Icon } from '@/components/ui';
import { useTheme } from '@/components/theme/theme-provider';
import { LocaleSwitcher } from './locale-switcher';

/** Base path (`/admin` behind the tenant proxy); applied to non-router fetch/redirect. */
const BASE_PATH = process.env.NEXT_PUBLIC_ADMIN_BASE_PATH ?? '';

const styles = stylex.create({
  gym: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  gymMuted: {
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  search: {
    width: '100%',
    maxWidth: '24rem',
    display: {
      default: 'none',
      '@media (min-width: 640px)': 'block',
    },
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

interface TopBarProps {
  /** The gym slug being managed, resolved server-side; `null` off a tenant host. */
  gymSlug: string | null;
}

export function TopBar({ gymSlug }: TopBarProps) {
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
      startContent={<MobileNavToggle label={t('openNav')} />}
      heading={
        gymSlug ? (
          <span {...stylex.props(styles.gym)}>{gymSlug}</span>
        ) : (
          <span {...stylex.props(styles.gymMuted)}>{t('consoleName')}</span>
        )
      }
      centerContent={
        <TextInput
          label={t('search')}
          isLabelHidden
          value={query}
          onChange={(value) => setQuery(value)}
          placeholder={t('search')}
          startIcon={<Icon name="search" {...stylex.props(styles.btnIcon)} />}
          xstyle={styles.search}
        />
      }
      endContent={
        <div {...stylex.props(styles.actions)}>
          <span {...stylex.props(styles.quickSale)}>
            <Button
              as={NextLink}
              href="/pos"
              variant="primary"
              size="sm"
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
              button={{ label: user.role, variant: 'ghost', size: 'sm' }}
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
