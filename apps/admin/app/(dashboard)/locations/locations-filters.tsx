'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { LocationStatus } from '@fit/types';
import { Icon } from '@/components/ui';

/** The engine gradient shared by the active segment (Planflow "formacore"). */
const ENGINE_GRADIENT = 'bg-[linear-gradient(135deg,#7C3AED,#EC4899)]';

/** Gym-wide roster counts shown on the segmented tabs. */
export interface LocationCounts {
  all: number;
  active: number;
  inactive: number;
}

/**
 * The segmented status tabs, mapped to the `status` URL param. "All" clears the
 * filter; the others pin a `LocationStatus`. Counts are gym-wide so each tab
 * shows its total.
 */
const TABS: ReadonlyArray<{
  label: string;
  value: LocationStatus | '';
  countKey: keyof LocationCounts;
}> = [
  { label: 'All', value: '', countKey: 'all' },
  { label: 'Active', value: 'ACTIVE', countKey: 'active' },
  { label: 'Inactive', value: 'INACTIVE', countKey: 'inactive' },
];

/** Debounce (ms) before a keystroke in the search box updates the URL. */
const SEARCH_DEBOUNCE_MS = 200;

/**
 * The location roster filter row: a segmented status control (with gym-wide
 * counts) and a debounced search box (name / address). Both write their state to
 * the URL search params (the single source of truth the server page reads),
 * resetting to page 1 on any change. Navigation runs in a transition so the
 * input stays responsive.
 */
export function LocationsFilters({
  search,
  status,
  counts,
}: {
  search: string;
  status: string;
  counts: LocationCounts;
}) {
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
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div
        role="tablist"
        aria-label="Filter by status"
        className="inline-flex w-fit flex-wrap gap-1 rounded-btn border border-ink-200 bg-white p-1 dark:border-white/10 dark:bg-white/[0.04]"
      >
        {TABS.map((tab) => {
          const active = status === tab.value;
          return (
            <button
              key={tab.label}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => commit('status', tab.value)}
              className={`inline-flex items-center gap-1.5 rounded-btn px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                active
                  ? `${ENGINE_GRADIENT} text-white shadow-[0_4px_14px_-4px_rgba(98,87,227,0.8)]`
                  : 'text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white'
              }`}
            >
              {tab.label}
              <span
                className={`font-mono text-xs tabular-nums ${active ? 'text-white/80' : 'text-ink-400'}`}
              >
                {counts[tab.countKey]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="relative lg:w-72">
        <label htmlFor="location-search" className="sr-only">
          Search locations by name or address
        </label>
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-400">
          <Icon name="search" className="h-4 w-4" />
        </span>
        <input
          id="location-search"
          type="search"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by name or address…"
          className="h-11 w-full rounded-field border border-ink-200 bg-white pl-9 pr-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
        />
      </div>
    </div>
  );
}
