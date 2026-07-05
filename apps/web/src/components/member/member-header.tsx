'use client';

import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { TopNav, TopNavItem } from '@astryxdesign/core/TopNav';
import { IconButton } from '@astryxdesign/core/IconButton';
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';
import type { DropdownMenuOption } from '@astryxdesign/core/DropdownMenu';
import { Link, usePathname, useRouter } from '@/src/i18n/navigation';
import { Icon } from '@/src/components/ui';
import { useSession } from '@/hooks/use-session';
import { logout } from '@/lib/auth';
import { ThemeToggle } from './theme-toggle';
import { NotificationBell } from './notification-bell';
import { NAV_ITEMS, isActive } from './nav-items';

// Astryx migration (T11.10): the member-portal app bar is the Astryx `TopNav`
// (heading / startContent / endContent slots) instead of the old formacore
// header. It is made sticky + given the translucent brand surface through
// `xstyle` on the theme tokens; the desktop nav collapses below `md`, where the
// bottom `MobileTabBar` takes over. All chrome authored in compiled StyleX —
// no Tailwind utilities.
const styles = stylex.create({
  bar: {
    position: 'sticky',
    top: 0,
    zIndex: 30,
    minHeight: '4rem',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
    backgroundColor: 'color-mix(in srgb, var(--color-background-surface) 82%, transparent)',
    backdropFilter: 'saturate(1.4) blur(16px)',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.625rem',
    textDecoration: 'none',
  },
  logoBadge: {
    display: 'grid',
    placeItems: 'center',
    height: '2.5rem',
    width: '2.5rem',
    borderRadius: 'var(--radius-element)',
    color: 'var(--color-on-accent)',
    backgroundImage:
      'linear-gradient(135deg, var(--color-accent), color-mix(in srgb, var(--color-accent) 55%, #ec4899))',
    boxShadow: '0 8px 24px -8px color-mix(in srgb, var(--color-accent) 80%, transparent)',
  },
  logoWord: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.25rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  // The desktop primary nav — hidden below `md`, where the bottom tab bar leads.
  desktopNav: {
    display: {
      default: 'none',
      '@media (min-width: 768px)': 'flex',
    },
    alignItems: 'center',
    gap: '0.25rem',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
  },
});

/** Brand mark — the gradient bolt badge + wordmark, linking home. */
function Logo({ label }: { label: string }) {
  return (
    <Link href="/home" {...stylex.props(styles.logo)}>
      <span {...stylex.props(styles.logoBadge)}>
        <Icon name="bolt" sw={2.4} />
      </span>
      <span {...stylex.props(styles.logoWord)}>{label}</span>
    </Link>
  );
}

/**
 * Avatar dropdown: view profile, an "Admin console" shortcut for staff (any role
 * other than `MEMBER` — the tenant proxy serves `/admin` on this same origin),
 * and sign out. Built on the Astryx `DropdownMenu`; sign-out clears the session
 * cookie and returns to the login page. Cross-app `/admin` is a full navigation
 * (it leaves the Next locale router), so it uses `window.location`.
 */
function AccountMenu() {
  const t = useTranslations('member');
  const router = useRouter();
  const { user } = useSession();
  const isStaff = Boolean(user && user.role !== 'MEMBER');

  const items: DropdownMenuOption[] = [
    {
      label: t('shell.viewProfile'),
      icon: <Icon name="user" />,
      onClick: () => router.push('/account/profile'),
    },
    ...(isStaff
      ? [
          {
            label: t('shell.adminConsole'),
            icon: <Icon name="grid" />,
            onClick: () => {
              window.location.href = '/admin';
            },
          },
        ]
      : []),
    { type: 'divider' as const },
    {
      label: t('shell.signOut'),
      icon: <Icon name="logout" />,
      onClick: () => {
        void logout().finally(() => router.replace('/login'));
      },
    },
  ];

  return (
    <DropdownMenu
      hasChevron={false}
      placement="below"
      button={{
        variant: 'ghost',
        isIconOnly: true,
        label: t('nav.profile'),
        icon: <Icon name="user" />,
      }}
      items={items}
    />
  );
}

/** Persistent member-portal header: logo, primary nav, theme/notifications/avatar. */
export function MemberHeader() {
  const t = useTranslations('member');
  const pathname = usePathname();

  return (
    <TopNav
      label={t('shell.primaryNav')}
      xstyle={styles.bar}
      heading={<Logo label={t('shell.brand')} />}
      startContent={
        <div {...stylex.props(styles.desktopNav)}>
          {NAV_ITEMS.map((item) => (
            <TopNavItem
              key={item.key}
              as={Link}
              href={item.href}
              label={t(`nav.${item.key}`)}
              icon={<Icon name={item.icon} />}
              isSelected={isActive(pathname, item.href)}
            />
          ))}
        </div>
      }
      endContent={
        <div {...stylex.props(styles.actions)}>
          <ThemeToggle />
          <IconButton
            as={Link}
            href="/cart"
            variant="ghost"
            label={t('nav.cart')}
            icon={<Icon name="bag" />}
          />
          <NotificationBell />
          <AccountMenu />
        </div>
      }
    />
  );
}
