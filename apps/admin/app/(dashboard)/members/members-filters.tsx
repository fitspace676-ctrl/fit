'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { MemberStatus } from '@fit/types';
import { Btn, Icon } from '@/components/ui';

/** The status options offered by the Filter panel, in roster-priority order; labels come from `status.<value>`. */
const STATUS_OPTIONS: ReadonlyArray<{ value: MemberStatus }> = [
  { value: 'ACTIVE' },
  { value: 'INVITED' },
  { value: 'SUSPENDED' },
];

/** Debounce (ms) before a keystroke in the search box updates the URL. */
const SEARCH_DEBOUNCE_MS = 200;

/**
 * The roster's search + Filter row (Planflow "formacore"). A debounced search box
 * (name / email) and a "Filter" button that reveals the status select — the
 * segmented tabs are the primary status control, so this is the secondary path
 * that also drives the `status` URL param. Both write their state to the URL
 * search params (the single source of truth the server page reads), resetting to
 * page 1 on any change so the pager never lands past the end of a freshly-narrowed
 * result set. Navigation runs in a transition so the input stays responsive.
 */
export function MembersFilters({ search, status }: { search: string; status: string }) {
  const t = useTranslations('admin.members');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(search);
  const [filtersOpen, setFiltersOpen] = useState(false);

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
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <label htmlFor="member-search" className="sr-only">
            {t('filters.searchLabel')}
          </label>
          <Icon
            name="search"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
          />
          <input
            id="member-search"
            type="search"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t('filters.searchPlaceholder')}
            className="h-11 w-full rounded-field border border-ink-200 bg-white pl-10 pr-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
          />
        </div>

        <Btn
          v={status || filtersOpen ? 'primary' : 'outline'}
          size="md"
          icon="filter"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          {status ? t('filters.filterActive') : t('filters.filter')}
        </Btn>
      </div>

      {filtersOpen ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label
            htmlFor="member-status"
            className="text-sm font-medium text-ink-600 dark:text-ink-300"
          >
            {t('filters.statusLabel')}
          </label>
          <select
            id="member-status"
            value={status}
            onChange={(event) => commit('status', event.target.value)}
            className="h-11 w-full rounded-field border border-ink-200 bg-white px-3.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white sm:w-48"
          >
            <option value="">{t('filters.allStatuses')}</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(`status.${option.value}`)}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}
