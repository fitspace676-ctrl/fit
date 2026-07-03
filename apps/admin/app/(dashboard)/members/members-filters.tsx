'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { MemberStatus } from '@fit/types';
import { Btn, Icon } from '@/components/ui';

/** The status options offered by the Filter panel, in roster-priority order. */
const STATUS_OPTIONS: ReadonlyArray<{ value: MemberStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INVITED', label: 'Trial' },
  { value: 'SUSPENDED', label: 'Expired' },
];

/** Debounce (ms) before a keystroke in the search box updates the URL. */
const SEARCH_DEBOUNCE_MS = 200;

/**
 * The roster's search + Filter controls (Planflow "formacore" toolbar): a
 * debounced search field (name / email — that's what the API matches) with an
 * inline clear button, and a "Filter" button that opens the reference's popover
 * panel. The popover carries the real `status` filter (the segmented tabs are the
 * primary status control; this is the secondary path) — the reference's mock
 * plan-checkbox / signed-up filters have no API backing, so they aren't rendered.
 * Both controls write to the URL search params (the single source of truth the
 * server page reads), resetting to page 1 on any change so the pager never lands
 * past the end of a freshly-narrowed result set.
 */
export function MembersFilters({ search, status }: { search: string; status: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(search);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Keep the input in sync if the URL changes from elsewhere (e.g. back button).
  useEffect(() => setSearchValue(search), [search]);

  // Escape closes the filter popover, mirroring the reference.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFiltersOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  // Debounce the search box so typing doesn't fire a request per keystroke.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onSearchChange(value: string): void {
    setSearchValue(value);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => commit('search', value.trim()), SEARCH_DEBOUNCE_MS);
  }

  function clearSearch(): void {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    setSearchValue('');
    commit('search', '');
  }

  return (
    <div className="ml-auto flex w-full items-center gap-2.5 sm:w-auto">
      {/* Search field. */}
      <div className="flex h-10 flex-1 items-center gap-2.5 rounded-field bg-ink-50 px-3.5 ring-1 ring-inset ring-ink-200 dark:bg-white/[0.04] dark:ring-white/10 sm:w-64 sm:flex-none">
        <label htmlFor="member-search" className="sr-only">
          Search members by name or email
        </label>
        <Icon
          name="search"
          className="h-[18px] w-[18px] shrink-0 text-ink-500 dark:text-ink-400"
          sw={2}
        />
        <input
          id="member-search"
          type="search"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search name, email…"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400 [&::-webkit-search-cancel-button]:hidden dark:text-white dark:placeholder:text-ink-500"
        />
        {searchValue ? (
          <button
            type="button"
            onClick={clearSearch}
            aria-label="Clear search"
            className="text-ink-400 hover:text-ink-900 dark:text-ink-500 dark:hover:text-white"
          >
            <Icon name="x" className="h-4 w-4" sw={2.2} />
          </button>
        ) : null}
      </div>

      {/* Filter button + popover. */}
      <div className="relative">
        <button
          type="button"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((open) => !open)}
          className="inline-flex h-10 items-center gap-2 rounded-btn bg-white px-3.5 text-sm font-semibold text-ink-700 ring-1 ring-inset ring-ink-200 transition hover:bg-ink-50 dark:bg-white/[0.04] dark:text-ink-300 dark:ring-white/10 dark:hover:text-white dark:hover:ring-white/20"
        >
          <Icon name="filter" className="h-4 w-4" sw={2} />
          Filter
          {status ? <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand-500" /> : null}
        </button>
        {filtersOpen ? (
          <>
            <div aria-hidden className="fixed inset-0 z-30" onClick={() => setFiltersOpen(false)} />
            <div className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-card bg-white ring-1 ring-inset ring-ink-200 shadow-[0_30px_70px_-16px_rgba(0,0,0,0.6)] dark:bg-ink-900/95 dark:ring-white/10">
              <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-white/10">
                <span className="text-sm font-bold text-ink-900 dark:text-white">Filters</span>
                <button
                  type="button"
                  onClick={() => commit('status', '')}
                  className="text-xs font-semibold text-brand-600 dark:text-brand-300"
                >
                  Reset
                </button>
              </div>
              <div className="space-y-3 p-3">
                <div>
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500 dark:text-ink-400">
                    Status
                  </p>
                  <label htmlFor="member-status" className="sr-only">
                    Status
                  </label>
                  <select
                    id="member-status"
                    value={status}
                    onChange={(event) => commit('status', event.target.value)}
                    className="h-9 w-full rounded-field bg-ink-50 px-2.5 text-sm text-ink-900 ring-1 ring-inset ring-ink-200 outline-none [color-scheme:light] dark:bg-white/[0.04] dark:text-white dark:ring-white/10 dark:[color-scheme:dark]"
                  >
                    <option value="">All statuses</option>
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Btn v="primary" size="sm" className="w-full" onClick={() => setFiltersOpen(false)}>
                  Apply filters
                </Btn>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
