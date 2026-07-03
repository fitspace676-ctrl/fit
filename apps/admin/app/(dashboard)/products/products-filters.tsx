'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ProductSort, ProductStatus, SortDir } from '@fit/types';
import { Icon } from '@/components/ui';
import { ShopGlyph } from './icons';

/** The sort dropdown's options, each mapping to a real `sort` + `dir` pair. */
const SORT_OPTIONS: ReadonlyArray<{ label: string; sort: ProductSort; dir: SortDir }> = [
  { label: 'Name · A–Z', sort: 'name', dir: 'asc' },
  { label: 'Name · Z–A', sort: 'name', dir: 'desc' },
  { label: 'Price · high', sort: 'price', dir: 'desc' },
  { label: 'Price · low', sort: 'price', dir: 'asc' },
  { label: 'Newest', sort: 'createdAt', dir: 'desc' },
];

/** The status chip row — "All" plus each real product lifecycle state. */
const STATUS_CHIPS: ReadonlyArray<{ label: string; value: '' | ProductStatus }> = [
  { label: 'All', value: '' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Inactive', value: 'INACTIVE' },
];

/** Selected-chip classes per status (static strings so Tailwind sees them). */
const CHIP_ON: Record<ProductStatus, string> = {
  ACTIVE:
    'bg-success-500/15 text-success-700 ring-1 ring-inset ring-success-500/40 dark:text-success-200',
  INACTIVE: 'bg-ink-500/15 text-ink-700 ring-1 ring-inset ring-ink-500/40 dark:text-ink-200',
};

/** The chips' square colour dot per status. */
const CHIP_DOT: Record<ProductStatus, string> = {
  ACTIVE: 'bg-success-500',
  INACTIVE: 'bg-ink-400',
};

/** Debounce (ms) before a keystroke in the search box updates the URL. */
const SEARCH_DEBOUNCE_MS = 200;

/**
 * The shop catalog toolbar (Planflow "formacore" shop reference): a debounced
 * search box, the sort dropdown, and the status chip row. All of it writes to the
 * URL search params (the single source of truth the server page reads), resetting
 * to page 1 on any change. Navigation runs in a transition so the input stays
 * responsive.
 */
export function ProductsFilters({
  search,
  status,
  sort,
  dir,
}: {
  search: string;
  status: string;
  sort: ProductSort;
  dir: SortDir;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(search);
  const [sortOpen, setSortOpen] = useState(false);

  useEffect(() => setSearchValue(search), [search]);

  const currentSort =
    SORT_OPTIONS.find((option) => option.sort === sort && option.dir === dir) ?? SORT_OPTIONS[0]!;

  /** Write one set of params to the URL, always resetting to page 1. */
  function commit(overrides: Record<string, string>): void {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(overrides)) {
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
    <div className="flex flex-col gap-4">
      {/* Search + sort toolbar. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <label htmlFor="product-search" className="sr-only">
            Search products by name or description
          </label>
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 dark:text-ink-500">
            <Icon name="search" className="h-[18px] w-[18px]" sw={2} />
          </span>
          <input
            id="product-search"
            type="search"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search products…"
            className="h-11 w-full rounded-field border border-ink-200 bg-white pl-11 pr-4 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-ink-500"
          />
        </div>

        <div className="relative">
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={sortOpen}
            onClick={() => setSortOpen((open) => !open)}
            className="inline-flex h-11 items-center gap-2 rounded-btn border border-ink-200 bg-white px-3.5 text-sm font-semibold text-ink-700 transition hover:bg-ink-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-ink-200 dark:hover:bg-white/[0.07]"
          >
            <ShopGlyph name="sort" className="h-4 w-4 text-ink-500 dark:text-ink-400" sw={2} />
            <span className="hidden sm:inline">{currentSort.label}</span>
            <Icon
              name="chevronDown"
              className={`h-4 w-4 text-ink-500 transition-transform dark:text-ink-400 ${
                sortOpen ? 'rotate-180' : ''
              }`}
              sw={2}
            />
          </button>
          {sortOpen ? (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setSortOpen(false)} />
              <div className="absolute right-0 z-40 mt-2 w-48 rounded-card border border-ink-200 bg-white p-1.5 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.5)] dark:border-white/10 dark:bg-ink-900/95 dark:backdrop-blur-xl">
                {SORT_OPTIONS.map((option) => {
                  const active = option === currentSort;
                  return (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => {
                        setSortOpen(false);
                        commit({ sort: option.sort, dir: option.dir });
                      }}
                      className={`flex h-9 w-full items-center justify-between rounded-btn px-3 text-sm font-semibold transition ${
                        active
                          ? 'bg-brand-500/15 text-brand-700 dark:text-brand-200'
                          : 'text-ink-500 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-white/5 dark:hover:text-white'
                      }`}
                    >
                      {option.label}
                      {active ? (
                        <Icon name="check" className="h-4 w-4 text-brand-400" sw={2.4} />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Status chips. */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
        {STATUS_CHIPS.map((chip) => {
          const active = chip.value === status || (chip.value === '' && status === '');
          const base =
            'inline-flex h-9 items-center gap-2 rounded-pill px-3.5 text-sm font-semibold transition';
          const off =
            'ring-1 ring-inset bg-white ring-ink-200 text-ink-600 hover:bg-ink-50 dark:bg-white/[0.04] dark:ring-white/10 dark:text-ink-300 dark:hover:text-white';
          const on =
            chip.value === ''
              ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-950'
              : CHIP_ON[chip.value];
          return (
            <button
              key={chip.label}
              type="button"
              aria-pressed={active}
              onClick={() => commit({ status: chip.value })}
              className={`${base} ${active ? on : off}`}
            >
              {chip.value !== '' ? (
                <span aria-hidden className={`h-2 w-2 rounded-sm ${CHIP_DOT[chip.value]}`} />
              ) : null}
              {chip.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
