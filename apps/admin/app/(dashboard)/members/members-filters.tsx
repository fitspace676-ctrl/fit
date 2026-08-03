'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type { MemberKind, MemberPlanSlice } from '@fit/types';
import { Btn, FilterBar, TableSearch } from '@/components/ui';

/**
 * The standings offered by the Filter panel, matching the segmented tabs above
 * it. The panel is the secondary control for the *same* axis, so it has to write
 * the same URL param — a select that filtered the account status instead would
 * set a filter no tab could reflect, and the two would disagree on screen.
 */
const KIND_OPTIONS: ReadonlyArray<{ value: MemberKind }> = [
  { value: 'MEMBER' },
  { value: 'GUEST' },
  { value: 'INACTIVE' },
];

/** Debounce (ms) before a keystroke in the search box updates the URL. */
const SEARCH_DEBOUNCE_MS = 200;

const styles = stylex.create({
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  statusRow: {
    display: 'flex',
    flexDirection: {
      default: 'column',
      '@media (min-width: 640px)': 'row',
    },
    alignItems: {
      default: 'stretch',
      '@media (min-width: 640px)': 'center',
    },
    gap: '0.5rem',
  },
  label: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  select: {
    height: '2.75rem',
    width: {
      default: '100%',
      '@media (min-width: 640px)': '12rem',
    },
    paddingInline: '0.875rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
  },
});

/**
 * The roster's search + Filter row (T11.19). A debounced {@link TableSearch}
 * (name / email) and a "Filter" button that reveals the status select — the
 * segmented tabs are the primary status control, so this is the secondary path
 * that also drives the `status` URL param. Both write their state to the URL
 * search params (the single source of truth the server page reads), resetting to
 * page 1 on any change so the pager never lands past the end of a freshly-narrowed
 * result set. Navigation runs in a transition so the input stays responsive.
 */
export function MembersFilters({
  search,
  kind,
  planId,
  plans,
}: {
  search: string;
  /** The active standing segment from the URL (`''` for all). */
  kind: string;
  planId: string;
  plans: MemberPlanSlice[];
}) {
  const t = useTranslations('admin.members');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [filtersOpen, setFiltersOpen] = useState(false);

  /** Push a single param change to the URL, always resetting to page 1. */
  function commit(key: string, value: string): void {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page');
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname));
  }

  return (
    <div {...stylex.props(styles.wrap)}>
      <FilterBar>
        <TableSearch
          value={search}
          onSearch={(value) => commit('search', value)}
          placeholder={t('filters.searchPlaceholder')}
          ariaLabel={t('filters.searchLabel')}
          debounceMs={SEARCH_DEBOUNCE_MS}
        />

        <Btn
          v={kind || planId || filtersOpen ? 'primary' : 'outline'}
          size="md"
          icon="filter"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          {kind || planId ? t('filters.filterActive') : t('filters.filter')}
        </Btn>
      </FilterBar>

      {filtersOpen ? (
        <div {...stylex.props(styles.statusRow)}>
          <label htmlFor="member-status" {...stylex.props(styles.label)}>
            {t('filters.statusLabel')}
          </label>
          <select
            id="member-status"
            value={kind}
            onChange={(event) => commit('kind', event.target.value)}
            {...stylex.props(styles.select)}
          >
            <option value="">{t('filters.allStatuses')}</option>
            {KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(`kind.${option.value}`)}
              </option>
            ))}
          </select>

          <label htmlFor="member-plan" {...stylex.props(styles.label)}>
            {t('filters.planLabel')}
          </label>
          <select
            id="member-plan"
            value={planId}
            onChange={(event) => commit('planId', event.target.value)}
            {...stylex.props(styles.select)}
          >
            <option value="">{t('filters.allPlans')}</option>
            {plans
              .filter((plan) => plan.planId !== null)
              .map((plan) => (
                <option key={plan.planId} value={plan.planId as string}>
                  {plan.name}
                </option>
              ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}
