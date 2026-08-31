'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type { MemberKind, MemberPlanSlice } from '@fit/types';
import { Button, FilterBar, SelectField, TableSearch } from '@fit/ui-kit';
import { Icon } from '@/components/ui';
import { useActiveLocation } from '@/components/active-location';
import { LOCATION_PARAM } from '@/lib/active-location';

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
  select: {
    width: {
      default: '100%',
      '@media (min-width: 640px)': '12rem',
    },
  },
  btnGlyph: {
    height: '1rem',
    width: '1rem',
  },
});

/**
 * The roster's search + Filter row (T11.19). A debounced {@link TableSearch}
 * (name / email) and a "Filter" button that reveals the status select — the
 * segmented tabs are the primary status control, so this is the secondary path
 * that also drives the `status` URL param — plus, in "All locations" mode only, a
 * branch select. All write their state to the URL search params (the single source
 * of truth the server page reads), resetting to page 1 on any change so the pager
 * never lands past the end of a freshly-narrowed result set. Navigation runs in a
 * transition so the input stays responsive.
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
  const tCommon = useTranslations('admin.common');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [filtersOpen, setFiltersOpen] = useState(false);

  // The branch select is a SECOND way into the same param the top-bar switcher
  // owns (`?locationId=`), so the two are never on screen together: this one
  // renders only while the console is on "All locations", and picking a branch in
  // it hands the axis over to the switcher — which then shows the branch, and this
  // control disappears. Two live controls writing one param is how they end up
  // disagreeing, and the switcher is the one that also persists the choice in the
  // cookie, so it is the one that must win. Deselecting is therefore done in the
  // chrome, where the current branch is actually named.
  const { locationId: activeLocationId, locations } = useActiveLocation();
  const showBranchFilter = activeLocationId === undefined && locations.length > 0;

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
          label={t('filters.searchLabel')}
          debounceMs={SEARCH_DEBOUNCE_MS}
        />

        <Button
          variant={kind || planId || filtersOpen ? 'primary' : 'secondary'}
          size="card"
          icon={<Icon name="filter" {...stylex.props(styles.btnGlyph)} />}
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((open) => !open)}
          label={kind || planId ? t('filters.filterActive') : t('filters.filter')}
        />
      </FilterBar>

      {filtersOpen ? (
        <div {...stylex.props(styles.statusRow)}>
          {/* All are `chrome` height: this row is a filter strip beside a
              button, not a form, so a 52px control would outweigh the table it
              filters. */}
          <SelectField
            label={t('filters.statusLabel')}
            size="chrome"
            value={kind}
            onChange={(event) => commit('kind', event.target.value)}
            options={[
              { value: '', label: t('filters.allStatuses') },
              ...KIND_OPTIONS.map((option) => ({
                value: option.value,
                label: t(`kind.${option.value}`),
              })),
            ]}
            xstyle={styles.select}
          />

          <SelectField
            label={t('filters.planLabel')}
            size="chrome"
            value={planId}
            onChange={(event) => commit('planId', event.target.value)}
            options={[
              { value: '', label: t('filters.allPlans') },
              ...plans
                .filter((plan) => plan.planId !== null)
                .map((plan) => ({ value: plan.planId as string, label: plan.name })),
            ]}
            xstyle={styles.select}
          />

          {showBranchFilter ? (
            <SelectField
              label={tCommon('locationLabel')}
              size="chrome"
              // Always `''` while it renders: a chosen branch lands in the URL, the
              // switcher adopts it, and this control unmounts. See `showBranchFilter`.
              value=""
              onChange={(event) => commit(LOCATION_PARAM, event.target.value)}
              options={[
                { value: '', label: tCommon('allLocations') },
                ...locations.map((location) => ({ value: location.id, label: location.name })),
              ]}
              xstyle={styles.select}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
