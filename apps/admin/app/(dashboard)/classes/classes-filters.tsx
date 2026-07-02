'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ClassTemplateStatus } from '@fit/types';
import { Icon } from '@/components/ui';

/** The status options offered by the filter, in roster-priority order. */
const STATUS_OPTIONS: ReadonlyArray<{ value: ClassTemplateStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PAUSED', label: 'Paused' },
];

/** Debounce (ms) before a keystroke in the search box updates the URL. */
const SEARCH_DEBOUNCE_MS = 200;

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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <label htmlFor="class-search" className="sr-only">
          Search class templates by title or category
        </label>
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-400">
          <Icon name="search" className="h-4 w-4" />
        </span>
        <input
          id="class-search"
          type="search"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by title or category…"
          className="h-11 w-full rounded-field border border-ink-200 bg-white pl-9 pr-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
        />
      </div>

      <div className="sm:w-48">
        <label htmlFor="class-status" className="sr-only">
          Filter by status
        </label>
        <select
          id="class-status"
          value={status}
          onChange={(event) => commit('status', event.target.value)}
          className="h-11 w-full rounded-field border border-ink-200 bg-white px-3.5 text-sm text-ink-900 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
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
