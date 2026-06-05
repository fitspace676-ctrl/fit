'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { MemberStatus } from '@fit/types';

/** The status options offered by the filter, in roster-priority order. */
const STATUS_OPTIONS: ReadonlyArray<{ value: MemberStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INVITED', label: 'Invited' },
  { value: 'SUSPENDED', label: 'Suspended' },
];

/** Debounce (ms) before a keystroke in the search box updates the URL. */
const SEARCH_DEBOUNCE_MS = 200;

/**
 * The roster filter bar: a debounced search box (name / email) and a status
 * select. Both write their state to the URL search params (the single source of
 * truth the server page reads), resetting to page 1 on any change so the pager
 * never lands past the end of a freshly-narrowed result set. Navigation runs in a
 * transition so the input stays responsive while the server re-renders.
 */
export function MembersFilters({ search, status }: { search: string; status: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(search);

  // Keep the input in sync if the URL changes from elsewhere (e.g. back button).
  useEffect(() => setSearchValue(search), [search]);

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

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <label htmlFor="member-search" className="sr-only">
          Search members by name or email
        </label>
        <input
          id="member-search"
          type="search"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by name or email…"
          className="w-full rounded-card border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
      </div>

      <div className="sm:w-48">
        <label htmlFor="member-status" className="sr-only">
          Filter by status
        </label>
        <select
          id="member-status"
          value={status}
          onChange={(event) => commit('status', event.target.value)}
          className="w-full rounded-card border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
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
