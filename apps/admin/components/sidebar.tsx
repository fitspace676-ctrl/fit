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
// The Check-in item carries today's live arrival count as a badge. The rail can
// be collapsed to an icon-only strip from the button in its footer — the choice
// is persisted in a cookie and seeded back on the server so the first paint
// already has the right width. Scroll-affordance buttons fade in at the
// top/bottom edges when the nav overflows.

import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  SideNav,
  SideNavSection,
  SideNavItem,
  useSideNavCollapse,
  useSideNavRenderMode,
} from '@astryxdesign/core/SideNav';
import { Badge } from '@astryxdesign/core/Badge';
import { Icon } from '@/components/ui';
import { useSession } from '@/hooks/use-session';
import { isNavItemActive, NAV_GROUPS, visibleNavItems } from '@/lib/nav';
import { SIDEBAR_COLLAPSED_COOKIE, SIDEBAR_COLLAPSED_VALUE } from '@/lib/sidebar-collapse';
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
    transition: 'width var(--duration-medium) var(--ease-standard)',
  },
  brandLink: {
    display: 'flex',
    alignItems: 'center',
    minHeight: '2.5rem',
    paddingInline: '0.5rem',
    paddingBlock: '0.25rem',
    borderRadius: 'var(--radius-element)',
  },
  // Zero-height sticky rails pinned to the top / bottom of the scroll viewport;
  // they host the scroll-affordance buttons without taking any layout space.
  scrollEdge: {
    position: 'sticky',
    zIndex: 4,
    height: 0,
    pointerEvents: 'none',
  },
  scrollEdgeTop: {
    top: 0,
  },
  scrollEdgeBottom: {
    bottom: 0,
  },
  scrollButton: {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'grid',
    placeItems: 'center',
    width: '2rem',
    height: '2rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border-emphasized)',
      ':hover': 'var(--color-accent)',
    },
    // Semi-transparent fill + backdrop blur → the nav items behind read as a
    // frosted-glass smear rather than being fully occluded.
    backgroundColor: 'color-mix(in srgb, var(--color-background-body) 55%, transparent)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-text-primary)',
    },
    boxShadow: 'var(--shadow-high)',
    cursor: 'pointer',
    opacity: 0,
    pointerEvents: 'none',
    transition:
      'opacity var(--duration-medium) var(--ease-standard), color var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard)',
  },
  scrollButtonVisible: {
    opacity: 1,
    pointerEvents: 'auto',
  },
  scrollButtonTop: {
    top: '0.5rem',
  },
  scrollButtonBottom: {
    bottom: '0.5rem',
  },
  scrollButtonIcon: {
    width: '1rem',
    height: '1rem',
  },
  scrollButtonIconUp: {
    transform: 'rotate(180deg)',
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
  // Collapsed rail: no group chrome, just the icon buttons in a centred column.
  collapsedGroup: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.125rem',
    paddingBlock: '0.25rem',
  },
  collapseButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: '100%',
    minHeight: '2rem',
    gap: '0.5rem',
    paddingInline: '0.5rem',
    borderWidth: 0,
    borderRadius: 'var(--radius-element)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-overlay-hover)',
    },
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-text-primary)',
    },
    cursor: 'pointer',
    fontFamily: 'var(--font-family-body)',
    fontSize: '0.75rem',
    fontWeight: 600,
  },
  collapseButtonCollapsed: {
    justifyContent: 'center',
    width: '2rem',
    paddingInline: 0,
  },
  collapseIcon: {
    width: '1rem',
    height: '1rem',
    flexShrink: 0,
    transition: 'transform var(--duration-fast) var(--ease-standard)',
  },
  collapseIconFlipped: {
    transform: 'rotate(180deg)',
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
  /** Collapsed state seeded from the cookie on the server (no first-paint jump). */
  defaultCollapsed?: boolean;
}

export function Sidebar({ system, defaultCollapsed = false }: SidebarProps) {
  const { user, isLoading } = useSession();
  const pathname = usePathname();
  const t = useTranslations('admin');
  const current = appPath(pathname);
  const items = visibleNavItems(user?.role ?? null);

  // Collapse is controlled here (rather than left to SideNav's own state) so the
  // choice can be written back to the cookie and the accordions can drop their
  // group chrome while the rail is narrow.
  const [collapseChoice, setIsCollapsed] = useState(defaultCollapsed);

  // Below `md` the same Sidebar is re-rendered inside AppShell's overlay drawer,
  // where the rail width means nothing — the drawer always shows the full nav.
  const renderMode = useSideNavRenderMode();
  const isDrawer = renderMode === 'drawer' || renderMode === 'drawer-content';
  const isCollapsed = collapseChoice && !isDrawer;

  const onCollapsedChange = useCallback((next: boolean) => {
    setIsCollapsed(next);
    // Year-long cookie so the next server render paints the same width.
    const value = next ? SIDEBAR_COLLAPSED_VALUE : '0';
    document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  // Scroll-affordance state. `scrollEl` is the SideNav's internal scroll viewport,
  // captured from the top rail's parent (its direct parent is the scrollable div).
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const [edges, setEdges] = useState({ up: false, down: false });

  const captureScrollEl = useCallback((node: HTMLDivElement | null) => {
    setScrollEl(node ? node.parentElement : null);
  }, []);

  useEffect(() => {
    if (!scrollEl) return;
    const update = (): void => {
      const { scrollTop, clientHeight, scrollHeight } = scrollEl;
      const up = scrollTop > 8;
      const down = scrollTop + clientHeight < scrollHeight - 8;
      // Keep the previous object when nothing moved. The observers below fire on
      // DOM writes the nav itself makes (collapsed items mount tooltips that
      // stamp inline anchor styles), so a fresh object here would re-render, the
      // re-render would write again, and the two would feed each other forever.
      setEdges((prev) => (prev.up === up && prev.down === down ? prev : { up, down }));
    };
    update();
    scrollEl.addEventListener('scroll', update, { passive: true });
    // Viewport resizes and content changes (accordions opening) both move the edges.
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(scrollEl);
    const mutationObserver = new MutationObserver(update);
    mutationObserver.observe(scrollEl, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
    return () => {
      scrollEl.removeEventListener('scroll', update);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [scrollEl]);

  const scrollToEnd = useCallback(
    (dir: 'up' | 'down') => {
      if (!scrollEl) return;
      scrollEl.scrollTo({ top: dir === 'up' ? 0 : scrollEl.scrollHeight, behavior: 'smooth' });
    },
    [scrollEl],
  );

  return (
    <SideNav
      xstyle={styles.panel}
      collapsible={{ isCollapsed, onCollapsedChange, hasButton: false }}
      // The wordmark is illegible at rail width, so the header is dropped
      // entirely while collapsed — the toggle in the footer stays reachable.
      header={
        isCollapsed ? undefined : (
          <NextLink href="/" aria-label={t('common.brand')} {...stylex.props(styles.brandLink)}>
            {/* Plain <img> (not next/image): with the app's basePath the image
                optimizer drops the `/admin` prefix and 404s, so reference the
                public asset directly under BASE_PATH. */}
            <img
              src={`${BASE_PATH}/logodark.png`}
              alt={t('common.brand')}
              className="admin-logo admin-logo-dark"
            />
            <img
              src={`${BASE_PATH}/logolight.png`}
              alt={t('common.brand')}
              className="admin-logo admin-logo-light"
            />
          </NextLink>
        )
      }
      footerIcons={
        isDrawer ? undefined : (
          <CollapseToggle
            collapseLabel={t('common.collapseNav')}
            expandLabel={t('common.expandNav')}
          />
        )
      }
    >
      {isLoading ? (
        <SideNavSection title={t('navGroups.overview')} isHeaderHidden>
          <SidebarSkeleton />
        </SideNavSection>
      ) : (
        <>
          <ScrollEdgeButton
            dir="up"
            visible={edges.up}
            onClick={() => scrollToEnd('up')}
            label={t('common.scrollUp')}
            containerRef={captureScrollEl}
          />
          {NAV_GROUPS.map((group) => {
            const groupItems = items.filter((item) => group.hrefs.includes(item.href));
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
          })}
          <ScrollEdgeButton
            dir="down"
            visible={edges.down}
            onClick={() => scrollToEnd('down')}
            label={t('common.scrollDown')}
          />
        </>
      )}
    </SideNav>
  );
}

/**
 * A scroll-affordance button pinned to the top or bottom edge of the nav scroll
 * viewport. It lives in a zero-height sticky rail (so it never shifts the list),
 * fades in only when there is more to scroll in its direction, and smooth-scrolls
 * to that end on click. The `up` variant reuses the down chevron, rotated.
 */
function ScrollEdgeButton({
  dir,
  visible,
  onClick,
  label,
  containerRef,
}: {
  dir: 'up' | 'down';
  visible: boolean;
  onClick: () => void;
  label: string;
  containerRef?: (node: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={containerRef}
      aria-hidden={!visible}
      {...stylex.props(
        styles.scrollEdge,
        dir === 'up' ? styles.scrollEdgeTop : styles.scrollEdgeBottom,
      )}
    >
      <button
        type="button"
        aria-label={label}
        tabIndex={visible ? 0 : -1}
        onClick={onClick}
        {...stylex.props(
          styles.scrollButton,
          dir === 'up' ? styles.scrollButtonTop : styles.scrollButtonBottom,
          visible && styles.scrollButtonVisible,
        )}
      >
        <Icon
          name="chevronDown"
          {...stylex.props(styles.scrollButtonIcon, dir === 'up' && styles.scrollButtonIconUp)}
        />
      </button>
    </div>
  );
}

/**
 * Footer toggle that collapses the rail to icons and back. Rendered inside the
 * SideNav so it reads the collapse state from Astryx's context rather than
 * taking it as a prop; the chevron points the way the rail will move.
 */
function CollapseToggle({
  collapseLabel,
  expandLabel,
}: {
  collapseLabel: string;
  expandLabel: string;
}) {
  const { isCollapsed, toggle } = useSideNavCollapse();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={!isCollapsed}
      aria-label={isCollapsed ? expandLabel : collapseLabel}
      title={isCollapsed ? expandLabel : collapseLabel}
      {...stylex.props(styles.collapseButton, isCollapsed && styles.collapseButtonCollapsed)}
    >
      <Icon
        name="chevronLeft"
        {...stylex.props(styles.collapseIcon, isCollapsed && styles.collapseIconFlipped)}
      />
      {!isCollapsed && <span>{collapseLabel}</span>}
    </button>
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

  useEffect(() => {
    if (isActive) setIsOpen(true);
  }, [isActive]);

  // Collapsed: the group heading has nowhere to go at rail width, so the items
  // are shown bare (each SideNavItem falls back to its own hover tooltip).
  if (isCollapsed) {
    return <div {...stylex.props(styles.collapsedGroup)}>{children}</div>;
  }

  return (
    <div {...stylex.props(styles.accordion, isOpen && styles.accordionOpen)}>
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
          {...stylex.props(styles.accordionChevronWrap, isOpen && styles.accordionChevronWrapOpen)}
        >
          <Icon
            name="chevronDown"
            {...stylex.props(styles.accordionChevron, isOpen && styles.accordionChevronOpen)}
          />
        </span>
      </button>
      <div
        id={panelId}
        {...stylex.props(styles.accordionPanel, isOpen && styles.accordionPanelOpen)}
      >
        <div {...stylex.props(styles.accordionItems)}>{children}</div>
      </div>
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
