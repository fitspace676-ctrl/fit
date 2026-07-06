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
// The Check-in item carries today's live arrival count as a badge. The rail is
// collapsible to an icon-only toolbar; the collapse toggle lives at the top —
// beside the brand heading when expanded, and just under the brand icon when
// collapsed — so it never drops to the foot of the rail.

import { useEffect, useId, useState, type ReactNode } from 'react';
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

const NAV_GROUPS = [
  { labelKey: 'navGroups.overview', hrefs: ['/'] },
  { labelKey: 'navGroups.people', hrefs: ['/members', '/trainers', '/staff'] },
  { labelKey: 'navGroups.operations', hrefs: ['/schedule', '/check-in', '/locations'] },
  { labelKey: 'navGroups.commerce', hrefs: ['/pos', '/products', '/orders', '/subscriptions'] },
  { labelKey: 'navGroups.insights', hrefs: ['/analytics', '/reports', '/activity'] },
  { labelKey: 'navGroups.system', hrefs: ['/settings'] },
] as const;

const skeletonPulse = stylex.keyframes({
  '0%, 100%': { opacity: 0.45 },
  '50%': { opacity: 0.8 },
});

const styles = stylex.create({
  panel: {
    height: 'calc(100% - 1rem)',
    margin: '0.5rem',
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-background-surface)',
  },
  brandHeading: {
    minHeight: '3.5rem',
    paddingInline: '0.5rem',
    borderRadius: 'var(--radius-element)',
  },
  brandTile: {
    display: 'grid',
    placeItems: 'center',
    width: '2rem',
    height: '2rem',
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
  collapseIcon: {
    width: '1rem',
    height: '1rem',
  },
  collapsedToggleRow: {
    display: 'flex',
    justifyContent: 'center',
    paddingBlockStart: '0.25rem',
  },
  accordion: {
    display: 'flex',
    flexDirection: 'column',
    marginBlock: '0.125rem',
    padding: '0.25rem',
    borderRadius: 'var(--radius-element)',
    transition:
      'background-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard)',
  },
  accordionOpen: {
    backgroundColor: 'transparent',
  },
  accordionButton: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    minHeight: '2.25rem',
    gap: '0.5rem',
    paddingInline: '0.625rem',
    paddingBlock: '0.375rem',
    borderWidth: 0,
    borderRadius: 'var(--radius-element)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-overlay-hover)',
    },
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    fontFamily: 'var(--font-family-body)',
  },
  accordionButtonOpen: {
    color: 'var(--color-text-primary)',
  },
  accordionMarker: {
    width: '0.25rem',
    height: '0.25rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent)',
    boxShadow: '0 0 0 3px var(--color-accent-muted)',
  },
  accordionTitle: {
    flex: 1,
    textAlign: 'start',
    fontSize: '0.75rem',
    fontWeight: 650,
    letterSpacing: '0.035em',
  },
  accordionChevronWrap: {
    display: 'grid',
    placeItems: 'center',
    width: '1.5rem',
    height: '1.5rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-overlay-hover)',
  },
  accordionChevronWrapOpen: {
    color: 'var(--color-text-accent)',
    backgroundColor: 'var(--color-accent-muted)',
  },
  accordionChevron: {
    width: '0.875rem',
    height: '0.875rem',
    transition: 'transform var(--duration-fast) var(--ease-standard)',
  },
  accordionChevronOpen: {
    transform: 'rotate(180deg)',
  },
  accordionPanel: {
    display: 'grid',
    gridTemplateRows: '0fr',
    transition: 'grid-template-rows var(--duration-medium) var(--ease-standard)',
  },
  accordionPanelOpen: {
    gridTemplateRows: '1fr',
  },
  accordionItems: {
    minHeight: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.125rem',
  },
  navItemHover: {
    '--color-overlay-hover': 'transparent',
    borderRadius: 'var(--radius-element)',
    transition: 'background-color var(--duration-fast) var(--ease-standard)',
    ':hover': {
      backgroundColor: 'var(--color-neutral)',
    },
  },
  skeleton: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.875rem',
    padding: '0.5rem 0.25rem',
    animationName: skeletonPulse,
    animationDuration: '1.6s',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'ease-in-out',
  },
  skelGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  },
  skelHeading: {
    width: '4.5rem',
    height: '0.5rem',
    marginInline: '0.625rem',
    marginBlockEnd: '0.125rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-skeleton)',
  },
  skelRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    height: '2.5rem',
    paddingInline: '0.625rem',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-overlay-hover)',
  },
  skelIcon: {
    width: '1rem',
    height: '1rem',
    flexShrink: 0,
    borderRadius: '0.25rem',
    backgroundColor: 'var(--color-skeleton)',
  },
  skelLine: {
    width: '62%',
    height: '0.625rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-skeleton)',
  },
  skelLineShort: {
    width: '46%',
  },
  skelLineWide: {
    width: '74%',
  },
});

export interface SidebarProps {
  /** The gym slug being managed, or `null` off a tenant host. */
  gymSlug: string | null;
  /** Live system signal — the SYSTEM widget + Check-in badge source. */
  system: ShellSystemState;
}

export function Sidebar({ system }: SidebarProps) {
  const { user, isLoading } = useSession();
  const pathname = usePathname();
  const t = useTranslations('admin');
  const current = appPath(pathname);
  const items = visibleNavItems(user?.role ?? null);

  return (
    <SideNav
      collapsible={{ hasButton: false }}
      xstyle={styles.panel}
      header={
        <SideNavHeading
          as={NextLink}
          heading={t('common.brand')}
          headingHref="/"
          xstyle={styles.brandHeading}
          icon={
            <span {...stylex.props(styles.brandTile)}>
              <Icon name="bolt" sw={2.4} {...stylex.props(styles.brandIcon)} />
            </span>
          }
          headerEndContent={<HeaderCollapseButton />}
        />
      }
      topContent={<CollapsedExpandButton />}
    >
      {isLoading ? (
        <SideNavSection title={t('navGroups.overview')} isHeaderHidden>
          <SidebarSkeleton />
        </SideNavSection>
      ) : (
        NAV_GROUPS.map((group) => {
          const groupItems = items.filter((item) =>
            (group.hrefs as readonly string[]).includes(item.href),
          );
          if (groupItems.length === 0) return null;

          return (
            <AccordionNavGroup
              key={group.labelKey}
              title={t(group.labelKey)}
              isActive={groupItems.some((item) => isNavItemActive(item.href, current))}
            >
              {groupItems.map((item) => {
                const active = isNavItemActive(item.href, current);
                const badge =
                  item.icon === 'checkin' && system.checkInCount && system.checkInCount > 0
                    ? system.checkInCount
                    : null;
                return (
                  <div key={item.href} {...stylex.props(styles.navItemHover)}>
                    <SideNavItem
                      as={NextLink}
                      href={item.href}
                      label={t(item.labelKey)}
                      icon={<NavIcon name={item.icon} />}
                      size="lg"
                      isSelected={active}
                      endContent={
                        badge !== null ? <Badge variant="purple" label={badge} /> : undefined
                      }
                    />
                  </div>
                );
              })}
            </AccordionNavGroup>
          );
        })
      )}
    </SideNav>
  );
}

function AccordionNavGroup({
  title,
  isActive,
  children,
}: {
  title: string;
  isActive: boolean;
  children: ReactNode;
}) {
  const { isCollapsed } = useSideNavCollapse();
  const [isOpen, setIsOpen] = useState(true);
  const panelId = useId();
  const expanded = isCollapsed || isOpen;

  useEffect(() => {
    if (isActive) setIsOpen(true);
  }, [isActive]);

  return (
    <div {...stylex.props(styles.accordion, isOpen && styles.accordionOpen)}>
      {!isCollapsed && (
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => setIsOpen((open) => !open)}
          {...stylex.props(styles.accordionButton, isOpen && styles.accordionButtonOpen)}
        >
          {isOpen && <span aria-hidden {...stylex.props(styles.accordionMarker)} />}
          <span {...stylex.props(styles.accordionTitle)}>{title}</span>
          <span
            {...stylex.props(
              styles.accordionChevronWrap,
              isOpen && styles.accordionChevronWrapOpen,
            )}
          >
            <Icon
              name="chevronDown"
              {...stylex.props(styles.accordionChevron, isOpen && styles.accordionChevronOpen)}
            />
          </span>
        </button>
      )}
      <div
        id={panelId}
        {...stylex.props(styles.accordionPanel, expanded && styles.accordionPanelOpen)}
      >
        <div {...stylex.props(styles.accordionItems)}>{children}</div>
      </div>
    </div>
  );
}

/**
 * Collapse ("chevronLeft") toggle rendered at the trailing edge of the brand
 * header while the rail is expanded. When collapsed, {@link SideNavHeading}
 * renders icon-only and drops `headerEndContent`, so this returns nothing there
 * — the expand toggle moves to {@link CollapsedExpandButton}.
 */
function HeaderCollapseButton() {
  const t = useTranslations('admin');
  const { isCollapsed } = useSideNavCollapse();
  if (isCollapsed) {
    return null;
  }
  return (
    <SideNavCollapseButton label={t('common.closeNav')}>
      <Icon name="chevronLeft" {...stylex.props(styles.collapseIcon)} />
    </SideNavCollapseButton>
  );
}

/**
 * Expand ("chevronRight") toggle pinned just below the brand icon while the rail
 * is collapsed, so the control stays at the top in both states rather than
 * dropping to the foot of the rail. Lives in the SideNav `topContent` zone (which
 * renders in both modes); returns nothing while expanded.
 */
function CollapsedExpandButton() {
  const t = useTranslations('admin');
  const { isCollapsed } = useSideNavCollapse();
  if (!isCollapsed) {
    return null;
  }
  return (
    <div {...stylex.props(styles.collapsedToggleRow)}>
      <SideNavCollapseButton label={t('common.openNav')}>
        <Icon name="chevronRight" {...stylex.props(styles.collapseIcon)} />
      </SideNavCollapseButton>
    </div>
  );
}

/** Placeholder rows shown while the session is still resolving. */
function SidebarSkeleton() {
  return (
    <div {...stylex.props(styles.skeleton)} aria-hidden="true">
      {[3, 2, 3].map((rowCount, groupIndex) => (
        <div key={groupIndex} {...stylex.props(styles.skelGroup)}>
          <div {...stylex.props(styles.skelHeading)} />
          {Array.from({ length: rowCount }).map((_, rowIndex) => (
            <div key={rowIndex} {...stylex.props(styles.skelRow)}>
              <span {...stylex.props(styles.skelIcon)} />
              <span
                {...stylex.props(
                  styles.skelLine,
                  rowIndex % 3 === 1 && styles.skelLineShort,
                  rowIndex % 3 === 2 && styles.skelLineWide,
                )}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
