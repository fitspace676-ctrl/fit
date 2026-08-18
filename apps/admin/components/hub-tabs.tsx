'use client';

// @fit/admin — route-based sub-navigation for a consolidated hub screen.
//
// Renders an underline tab bar (styling mirrors the `@fit/ui-web` `Tabs`
// primitive) whose tabs are `next/link` destinations rather than local state, so
// each tab is its own route and the browser URL/back-button work as expected.
// Used by the Payments hub (Plans · Invoices) and the
// Classes hub (Class Types · Schedule · PT Calendar · Bookings) to match the
// reference admin's consolidated information architecture while keeping our
// design system. The active tab is resolved from the current pathname: the tab
// with the longest matching `href` wins so nested detail routes keep their
// parent tab highlighted.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from '@/components/ui';

/** Base path (`/admin` behind the tenant proxy), stripped before matching. */
const BASE_PATH = process.env.NEXT_PUBLIC_ADMIN_BASE_PATH ?? '';

export interface HubTab {
  /** App-relative destination (basePath is applied by `next/link`). */
  href: string;
  /** Visible label. */
  label: string;
  /** Optional leading icon. */
  icon?: IconName;
  /**
   * When set, the tab is active only on an exact path match (used for the hub
   * index tab so it doesn't stay lit on sibling tab routes that share its
   * prefix — e.g. `/payments` vs `/payments/invoices`).
   */
  exact?: boolean;
}

function appPath(pathname: string): string {
  if (BASE_PATH && pathname.startsWith(BASE_PATH)) {
    return pathname.slice(BASE_PATH.length) || '/';
  }
  return pathname;
}

function isActive(tab: HubTab, path: string): boolean {
  if (tab.exact) {
    return path === tab.href;
  }
  return path === tab.href || path.startsWith(`${tab.href}/`);
}

export function HubTabs({ items, ariaLabel }: { items: HubTab[]; ariaLabel: string }) {
  const path = appPath(usePathname());

  // Longest matching href wins, so `/payments/invoices` beats the `/payments`
  // index tab when both would otherwise match.
  let activeHref = '';
  for (const tab of items) {
    if (isActive(tab, path) && tab.href.length >= activeHref.length) {
      activeHref = tab.href;
    }
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex gap-1 overflow-x-auto border-b border-ink-200 dark:border-white/10"
    >
      {items.map((tab) => {
        const active = tab.href === activeHref;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={active}
            aria-current={active ? 'page' : undefined}
            className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
              active
                ? 'border-brand-800 text-brand-800 dark:border-brand-300 dark:text-brand-300'
                : 'border-transparent text-ink-500 hover:text-ink-700 dark:text-ink-400 dark:hover:text-ink-200'
            }`}
          >
            {tab.icon ? <Icon name={tab.icon} className="h-4 w-4" sw={2} /> : null}
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
