'use client';

// @fit/admin — the inventory table's filter bar.
//
// The page has parsed `search`, `status` and `tracked` off the URL since T4.7 and
// rendered no control for any of them: the params worked, but only for someone
// willing to type them. Stage 4 of multi-branch made that gap worse rather than
// merely untidy — `locationId` is a fourth param on the same page, and shipping a
// branch control beside three invisible ones would have made the omission look
// deliberate. So the bar is filled in here.
//
// The branch select follows the members roster's rule exactly
// (`members-filters.tsx`): it is a SECOND way into the param the top-bar switcher
// owns, so the two are never on screen together. It renders only while the console
// is on "All locations", and choosing a branch in it hands the axis to the
// switcher — which persists the choice in the cookie, and is therefore the control
// that has to win. Deselecting happens in the chrome, where the branch is named.

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import type { ProductStatus } from '@fit/types';
import { SelectField } from '@fit/ui-kit';
import { useActiveLocation } from '@/components/active-location';
import { LOCATION_PARAM } from '@/lib/active-location';

/** Debounce (ms) before a keystroke in the search box updates the URL. */
const SEARCH_DEBOUNCE_MS = 200;

/**
 * The lifecycle options. `''` is not "every status" here: an omitted `status`
 * means active products only, because a deactivated line's stock is not being
 * sold and counting it would overstate what is on the shelf. The label says so
 * rather than leaving the reader to infer it from a blank.
 */
const STATUS_OPTIONS: ReadonlyArray<{ value: ProductStatus | ''; label: string }> = [
  { value: '', label: 'Selling now' },
  { value: 'ACTIVE', label: 'Active only' },
  { value: 'INACTIVE', label: 'Deactivated' },
];

const styles = stylex.create({
  row: {
    display: 'flex',
    flexDirection: {
      default: 'column',
      '@media (min-width: 640px)': 'row',
    },
    alignItems: {
      default: 'stretch',
      '@media (min-width: 640px)': 'flex-end',
    },
    gap: '0.75rem',
  },
  searchWrap: {
    position: 'relative',
    flexGrow: 1,
    flexBasis: 0,
  },
  select: {
    width: {
      default: '100%',
      '@media (min-width: 640px)': '12rem',
    },
  },
  srOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
  control: {
    height: '2.25rem',
    width: '100%',
    boxSizing: 'border-box',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.875rem',
    fontSize: '0.875rem',
    fontFamily: 'inherit',
    color: 'var(--color-text-primary)',
    outline: 'none',
    '::placeholder': {
      color: 'var(--color-text-secondary)',
    },
  },
  toggle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    height: '2.25rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
    whiteSpace: 'nowrap',
  },
});

/**
 * The inventory table's filters: a debounced name search, the lifecycle select,
 * a "counted positions only" toggle, and — in "All locations" mode only — a branch
 * select. Every one writes the URL search params the server page reads, resetting
 * `page` so a freshly narrowed set never opens past its own end.
 */
export function InventoryFilters({
  search,
  status,
  tracked,
}: {
  search: string;
  /** The lifecycle filter from the URL; `''` is the API's active-only default. */
  status: string;
  tracked: boolean;
}) {
  const tCommon = useTranslations('admin.common');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(search);

  useEffect(() => setSearchValue(search), [search]);

  const { locationId: activeLocationId, locations } = useActiveLocation();
  const showBranchFilter = activeLocationId === undefined && locations.length > 0;

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

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onSearchChange(value: string): void {
    setSearchValue(value);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => commit('search', value.trim()), SEARCH_DEBOUNCE_MS);
  }

  return (
    <div {...stylex.props(styles.row)}>
      <div {...stylex.props(styles.searchWrap)}>
        <label htmlFor="inventory-search" {...stylex.props(styles.srOnly)}>
          Search inventory by product name
        </label>
        <input
          id="inventory-search"
          type="search"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by product name…"
          {...stylex.props(styles.control)}
        />
      </div>

      <SelectField
        label="Status"
        size="chrome"
        value={status}
        onChange={(event) => commit('status', event.target.value)}
        options={[...STATUS_OPTIONS]}
        xstyle={styles.select}
      />

      {showBranchFilter ? (
        <SelectField
          label={tCommon('locationLabel')}
          size="chrome"
          // Always `''` while it renders: a chosen branch lands in the URL, the
          // header switcher adopts it, and this control unmounts.
          value=""
          onChange={(event) => commit(LOCATION_PARAM, event.target.value)}
          options={[
            { value: '', label: tCommon('allLocations') },
            ...locations.map((location) => ({ value: location.id, label: location.name })),
          ]}
          xstyle={styles.select}
        />
      ) : null}

      <label {...stylex.props(styles.toggle)}>
        <input
          type="checkbox"
          checked={tracked}
          onChange={(event) => commit('tracked', event.target.checked ? 'true' : '')}
        />
        Counted only
      </label>
    </div>
  );
}
