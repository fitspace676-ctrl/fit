'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ProductSort, SortDir } from '@fit/types';

/** Debounce (ms) before a keystroke in the search box updates the URL. */
const SEARCH_DEBOUNCE_MS = 200;

/**
 * The sort presets, each pinning a `sort` column + `dir` the roster reads. The
 * `value` is the `sort:dir` pair the `<select>` round-trips; the grid no longer has
 * sortable column headers, so this is the catalog's one sort control.
 */
const SORT_OPTIONS: ReadonlyArray<{ sort: ProductSort; dir: SortDir; label: string }> = [
  { sort: 'name', dir: 'asc', label: 'Name (A–Z)' },
  { sort: 'name', dir: 'desc', label: 'Name (Z–A)' },
  { sort: 'price', dir: 'asc', label: 'Price (low → high)' },
  { sort: 'price', dir: 'desc', label: 'Price (high → low)' },
  { sort: 'createdAt', dir: 'desc', label: 'Newest first' },
  { sort: 'createdAt', dir: 'asc', label: 'Oldest first' },
];

/**
 * The product catalog filter bar: a debounced search box (name / description) and a
 * sort select. Both write their state to the URL search params (the single source of
 * truth the server page reads), resetting to page 1 on any change. Navigation runs
 * in a transition so the input stays responsive. Status filtering lives in the
 * sibling `ProductsStatusTabs`.
 */
export function ProductsFilters({
  search,
  sort,
  dir,
}: {
  search: string;
  sort: ProductSort;
  dir: SortDir;
}) {
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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <label htmlFor="product-search" className="sr-only">
          Search products by name or description
        </label>
        <input
          id="product-search"
          type="search"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by name or description…"
          className="h-11 w-full rounded-field border border-ink-200 bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
        />
      </div>

      <div className="sm:w-56">
        <label htmlFor="product-sort" className="sr-only">
          Sort products
        </label>
        <select
          id="product-sort"
          value={`${sort}:${dir}`}
          onChange={(event) => {
            const [nextSort = 'name', nextDir = 'asc'] = event.target.value.split(':');
            commit({ sort: nextSort, dir: nextDir });
          }}
          className="h-11 w-full rounded-field border border-ink-200 bg-white px-3.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={`${option.sort}:${option.dir}`} value={`${option.sort}:${option.dir}`}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
