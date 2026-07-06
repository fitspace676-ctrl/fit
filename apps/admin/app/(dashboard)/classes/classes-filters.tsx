'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import type { ClassTemplateStatus } from '@fit/types';

/** The status options offered by the filter, in roster-priority order. */
const STATUS_OPTIONS: ReadonlyArray<{ value: ClassTemplateStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PAUSED', label: 'Paused' },
];

/** Debounce (ms) before a keystroke in the search box updates the URL. */
const SEARCH_DEBOUNCE_MS = 200;

const styles = stylex.create({
  wrap: {
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
    flex: 1,
  },
  selectWrap: {
    width: {
      default: '100%',
      '@media (min-width: 640px)': '12rem',
    },
  },
  control: {
    height: '2.75rem',
    width: '100%',
    paddingInline: '0.875rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: 'var(--color-background-surface)',
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
    outline: 'none',
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
});

/**
 * The class-template roster filter bar: a debounced search box (title / category)
 * and a status select. Both write their state to the URL search params (the single
 * source of truth the server page reads), resetting to page 1 on any change.
 * Navigation runs in a transition so the input stays responsive.
 */
export function ClassTemplatesFilters({ search, status }: { search: string; status: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(search);

  useEffect(() => setSearchValue(search), [search]);

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
    <div {...stylex.props(styles.wrap)}>
      <div {...stylex.props(styles.searchWrap)}>
        <label htmlFor="class-search" {...stylex.props(styles.srOnly)}>
          Search class templates by title or category
        </label>
        <input
          id="class-search"
          type="search"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by title or category…"
          {...stylex.props(styles.control)}
        />
      </div>

      <div {...stylex.props(styles.selectWrap)}>
        <label htmlFor="class-status" {...stylex.props(styles.srOnly)}>
          Filter by status
        </label>
        <select
          id="class-status"
          value={status}
          onChange={(event) => commit('status', event.target.value)}
          {...stylex.props(styles.control)}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
