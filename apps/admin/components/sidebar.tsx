'use client';

// @fit/admin — role-aware sidebar navigation (Astryx, T11.17).
//
// Rebuilt on the Astryx `SideNav` (header + scrollable sections + sticky footer +
// icon bar) over the Fit brand tokens. It renders the destinations the current
// session's role may reach, with the active route highlighted. Visibility is
// resolved client-side by `visibleNavItems` (the same role→permission matrix the
// API enforces) purely to decide what to show — every navigation still hits
// `middleware.ts`, which re-checks the role. Until the session resolves a
// skeleton stands in so the layout doesn't jump.
//
// Below the nav sit two real-signal widgets, both fed by the server-resolved
// {@link ShellSystemState}: a SYSTEM status card whose "online" reflects whether
// the Fit API answered, and a user card built from the verified session role +
// the active gym. The Check-in item carries today's live arrival count as a
// badge. The rail is collapsible to an icon-only toolbar; the footer widgets
// fold away in that mode (they read `useSideNavCollapse`).

import * as stylex from '@stylexjs/stylex';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  SideNav,
  SideNavSection,
  SideNavItem,
  SideNavHeading,
  SideNavCollapseButton,
  useSideNavCollapse,
} from '@astryxdesign/core/SideNav';
import { Badge } from '@astryxdesign/core/Badge';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Icon } from '@/components/ui';
import { useSession } from '@/hooks/use-session';
import { isNavItemActive, visibleNavItems } from '@/lib/nav';
import type { ShellSystemState } from './admin-shell';
import { NavIcon } from './nav-icon';

/** App base path (`/admin` behind the tenant proxy), stripped before matching. */
const BASE_PATH = process.env.NEXT_PUBLIC_ADMIN_BASE_PATH ?? '';

/** Normalize the router pathname to an app-relative path for active matching. */
function appPath(pathname: string): string {
  if (BASE_PATH && pathname.startsWith(BASE_PATH)) {
    return pathname.slice(BASE_PATH.length) || '/';
  }
  return pathname;
}

/** Title-case a role token (`OWNER` → `Owner`) for the user card. */
function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}

const styles = stylex.create({
  brandTile: {
    display: 'grid',
    placeItems: 'center',
    height: '2rem',
    width: '2rem',
    borderRadius: 'var(--radius-element)',
    color: 'var(--color-on-accent)',
    backgroundImage:
      'linear-gradient(135deg, var(--color-accent), color-mix(in srgb, var(--color-accent) 55%, #ec4899))',
    boxShadow: '0 8px 24px -10px color-mix(in srgb, var(--color-accent) 80%, transparent)',
  },
  brandIcon: {
    width: '1.125rem',
    height: '1.125rem',
  },
  card: {
    display: 'grid',
    gap: '0.5rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    padding: '0.75rem',
  },
  cardHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLabel: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.625rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.16em',
    color: 'var(--color-text-secondary)',
  },
  rows: {
    display: 'grid',
    gap: '0.375rem',
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  userCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.625rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    padding: '0.625rem 0.75rem',
  },
  userText: {
    display: 'flex',
    minWidth: 0,
    flexDirection: 'column',
    lineHeight: 1.2,
  },
  userName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  userMeta: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.625rem',
    color: 'var(--color-text-secondary)',
  },
  footer: {
    display: 'grid',
    gap: '0.5rem',
  },
  skeleton: {
    display: 'grid',
    gap: '0.5rem',
    padding: '0.5rem 0',
  },
  skelRow: {
    height: '2rem',
    borderRadius: 'var(--radius-inner)',
    backgroundColor: 'var(--color-skeleton)',
  },
});

export interface SidebarProps {
  /** The gym slug being managed (for the user card), or `null` off a tenant host. */
  gymSlug: string | null;
  /** Live system signal — the SYSTEM widget + Check-in badge source. */
  system: ShellSystemState;
}

export function Sidebar({ gymSlug, system }: SidebarProps) {
  const { user, isLoading } = useSession();
  const pathname = usePathname();
  const t = useTranslations('admin');
  const current = appPath(pathname);
  const items = visibleNavItems(user?.role ?? null);

  return (
    <SideNav
      collapsible={{ hasButton: false }}
      header={
        <SideNavHeading
          as={NextLink}
          heading={t('common.brand')}
          subheading={t('common.brandTagline')}
          headingHref="/"
          icon={
            <span {...stylex.props(styles.brandTile)}>
              <Icon name="bolt" sw={2.4} {...stylex.props(styles.brandIcon)} />
            </span>
          }
        />
      }
      footer={!isLoading ? <SidebarFooter system={system} user={user} gymSlug={gymSlug} /> : null}
      footerIcons={<SideNavCollapseButton label={t('common.brand')} />}
    >
      <SideNavSection title={t('nav.dashboard')} isHeaderHidden>
        {isLoading ? (
          <SidebarSkeleton />
        ) : (
          items.map((item) => {
            const active = isNavItemActive(item.href, current);
            const badge =
              item.icon === 'checkin' && system.checkInCount && system.checkInCount > 0
                ? system.checkInCount
                : null;
            return (
              <SideNavItem
                key={item.href}
                as={NextLink}
                href={item.href}
                label={t(item.labelKey)}
                icon={<NavIcon name={item.icon} />}
                isSelected={active}
                endContent={badge !== null ? <Badge variant="purple" label={badge} /> : undefined}
              />
            );
          })
        )}
      </SideNavSection>
    </SideNav>
  );
}

/** SYSTEM status card + user card. Folds to nothing when the rail is collapsed. */
function SidebarFooter({
  system,
  user,
  gymSlug,
}: {
  system: ShellSystemState;
  user: { role: string } | null;
  gymSlug: string | null;
}) {
  const { isCollapsed } = useSideNavCollapse();
  if (isCollapsed) {
    return null;
  }
  return (
    <div {...stylex.props(styles.footer)}>
      <SystemWidget system={system} />
      {user && (
        <div {...stylex.props(styles.userCard)}>
          <Avatar name={roleLabel(user.role)} size={36} />
          <span {...stylex.props(styles.userText)}>
            <span {...stylex.props(styles.userName)}>{roleLabel(user.role)}</span>
            <span {...stylex.props(styles.userMeta)}>
              {roleLabel(user.role)}
              {gymSlug ? ` · ${gymSlug}` : ''}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * The SYSTEM status widget. "online" is a REAL signal — whether the Fit API
 * answered the layout's check-in stats call — not a constant. When online the
 * three subsystems (sync engine, check-in, POS terminal) read as connected; when
 * the API is unreachable they degrade to offline together.
 */
function SystemWidget({ system }: { system: ShellSystemState }) {
  const t = useTranslations('admin.system');
  const online = system.online;
  const rows = ['syncEngine', 'checkIn', 'posTerminal'] as const;
  return (
    <div {...stylex.props(styles.card)}>
      <div {...stylex.props(styles.cardHead)}>
        <span {...stylex.props(styles.cardLabel)}>{t('title')}</span>
        <Badge variant={online ? 'success' : 'error'} label={online ? t('uptime') : t('offline')} />
      </div>
      <ul {...stylex.props(styles.rows)}>
        {rows.map((key) => (
          <li key={key} {...stylex.props(styles.row)}>
            <span>{t(key)}</span>
            <StatusDot
              variant={online ? 'success' : 'error'}
              label={online ? t('online') : t('offline')}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Placeholder rows shown while the session is still resolving. */
function SidebarSkeleton() {
  return (
    <div {...stylex.props(styles.skeleton)} aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} {...stylex.props(styles.skelRow)} />
      ))}
    </div>
  );
}
