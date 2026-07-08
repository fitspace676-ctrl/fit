'use client';

import { useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';

/** The Automation shell's tab keys — labels come from `shellTabs.<key>`. */
export type AutomationTab = 'rules' | 'templates';

const TABS: readonly AutomationTab[] = ['rules', 'templates'];

const styles = stylex.create({
  tablist: {
    display: 'flex',
    gap: '0.25rem',
    overflowX: 'auto',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
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
    borderBottomColor: 'var(--color-accent)',
    color: 'var(--color-text-accent)',
  },
});

/**
 * The Rules | Templates shell tabs. Selection writes the `tab` URL param
 * (clearing the rules filters, which belong to the rules tab only) so the
 * server page re-renders the chosen surface.
 */
export function AutomationTabs({ active }: { active: AutomationTab }) {
  const t = useTranslations('admin.automation');
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  function select(tab: AutomationTab): void {
    const href = tab === 'rules' ? pathname : `${pathname}?tab=${tab}`;
    startTransition(() => router.replace(href));
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
            {...stylex.props(styles.tab, isActive && styles.tabActive)}
          >
            {t(`shellTabs.${tab}`)}
          </button>
        );
      })}
    </div>
  );
}
