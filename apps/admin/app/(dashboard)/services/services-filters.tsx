'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';

/** Debounce (ms) before a keystroke in the search box updates the URL. */
const SEARCH_DEBOUNCE_MS = 200;

const TYPE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: 'All types' },
  { value: 'PERSONAL_TRAINING', label: 'Personal training' },
  { value: 'CUSTOM', label: 'Custom' },
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
      '@media (min-width: 640px)': 'center',
    },
    gap: '0.75rem',
  },
  searchWrap: {
    position: 'relative',
    flexGrow: 1,
    flexBasis: 0,
  },
  typeWrap: {
    width: {
      default: '100%',
      '@media (min-width: 640px)': '14rem',
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
    height: '2.75rem',
    width: '100%',
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
    color: 'var(--color-text-primary)',
    outline: 'none',
    '::placeholder': {
      color: 'var(--color-text-secondary)',
    },
  },
});

/**
 * The services catalogue filter bar: a debounced search box (name / description)
 * and a type select, following the shop catalog's filter bar. Both write their
 * state to the URL search params (the single source of truth the server page
 * reads), resetting to page 1 on any change. Navigation runs in a transition so
 * the input stays responsive. Status filtering lives in the sibling
 * `ServicesStatusTabs`.
 */
export function ServicesFilters({ search, type }: { search: string; type: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(search);

  useEffect(() => setSearchValue(search), [search]);

  function commit(entries: Record<string, string>): void {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(entries)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
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
    debounceRef.current = setTimeout(() => commit({ search: value.trim() }), SEARCH_DEBOUNCE_MS);
  }

  return (
    <div {...stylex.props(styles.row)}>
      <div {...stylex.props(styles.searchWrap)}>
        <label htmlFor="service-search" {...stylex.props(styles.srOnly)}>
          Search services by name or description
        </label>
        <input
          id="service-search"
          type="search"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by name or description…"
          {...stylex.props(styles.control)}
        />
      </div>

      <div {...stylex.props(styles.typeWrap)}>
        <label htmlFor="service-type-filter" {...stylex.props(styles.srOnly)}>
          Filter services by type
        </label>
        <select
          id="service-type-filter"
          value={type}
          onChange={(event) => commit({ type: event.target.value })}
          {...stylex.props(styles.control)}
        >
          {TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
