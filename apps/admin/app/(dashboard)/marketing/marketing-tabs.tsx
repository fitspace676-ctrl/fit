'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { useTheme } from '@/components/theme/theme-provider';

/** The Marketing shell's tab keys — labels come from `shellTabs.<key>`. */
export type MarketingTab = 'campaigns' | 'promo' | 'audience' | 'templates' | 'banners';

const TABS: readonly MarketingTab[] = ['campaigns', 'promo', 'audience', 'templates', 'banners'];

/** The workspace's own path — the four `?tab=` surfaces live on it. */
const MARKETING_PATH = '/marketing';

/**
 * Where each tab goes.
 *
 * Four of them are the one workspace page switching content, so they are search
 * params on it. Banners (T1.16) is a route of its own — a different job with its
 * own writes — so it is a path. Hard-coded rather than read off `usePathname`,
 * which used to be the base here: on `/marketing/banners` the current path is no
 * longer the workspace, and appending `?tab=promo` to it would build a link back
 * to the page you are already on.
 */
function hrefFor(tab: MarketingTab): string {
  if (tab === 'banners') {
    return `${MARKETING_PATH}/banners`;
  }
  return tab === 'campaigns' ? MARKETING_PATH : `${MARKETING_PATH}?tab=${tab}`;
}

const styles = stylex.create({
  tablist: {
    display: 'flex',
    gap: '0.25rem',
    overflowX: 'auto',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    // No rule under the bar in light mode — the active pill alone carries the
    // state; dark keeps the hairline under its underline tabs.
    borderBottomColor: 'light-dark(transparent, var(--color-border))',
  },
  tab: {
    flexShrink: 0,
    marginBottom: '-1px',
    borderWidth: 0,
    borderBottomWidth: '2px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'transparent',
    background: 'none',
    cursor: 'pointer',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    color: 'var(--color-text-secondary)',
  },
  tabActive: {
    borderBottomColor: 'var(--color-text-accent)',
    color: 'var(--color-text-accent)',
  },
  // The active tab, light mode: a brand pill — the raw lime with the theme's
  // on-accent ink, the member portal's pairing (mirrors the dashboard's
  // segment tabs). A separate per-theme style, not `light-dark()`: the pill's
  // radius is a length, which `light-dark()` cannot carry — and dark must keep
  // its straight underline.
  tabActiveLight: {
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
    borderBottomColor: 'transparent',
    borderRadius: '9999px',
  },
});

/**
 * The Campaigns | Promo Codes | Audience | Templates | Banners shell tabs.
 * Selecting one of the first four writes the `tab` URL param (clearing the
 * campaign filters, which belong to the Campaigns tab only) so the server page
 * re-renders the chosen surface; Banners navigates to its own route.
 */
export function MarketingTabs({ active }: { active: MarketingTab }) {
  const t = useTranslations('admin.marketing');
  const { theme } = useTheme();
  const router = useRouter();
  const [, startTransition] = useTransition();

  function select(tab: MarketingTab): void {
    startTransition(() => router.replace(hrefFor(tab)));
  }

  return (
    <div role="tablist" aria-label={t('shell.tablistLabel')} {...stylex.props(styles.tablist)}>
      {TABS.map((tab) => {
        const isActive = tab === active;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => select(tab)}
            {...stylex.props(
              styles.tab,
              isActive && styles.tabActive,
              isActive && theme === 'light' && styles.tabActiveLight,
            )}
          >
            {t(`shellTabs.${tab}`)}
          </button>
        );
      })}
    </div>
  );
}
