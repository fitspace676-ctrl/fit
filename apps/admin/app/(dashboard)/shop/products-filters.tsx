'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import {
  UNCATEGORISED_FILTER,
  type AdminProductCategory,
  type ProductSort,
  type SortDir,
} from '@fit/types';

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
  sortWrap: {
    width: {
      default: '100%',
      '@media (min-width: 640px)': '14rem',
    },
  },
  categoryWrap: {
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
 * The product catalog filter bar: a debounced search box (name / description) and a
 * sort select, rebuilt on brand-tokened StyleX (T11.22). Both write their state to
 * the URL search params (the single source of truth the server page reads),
 * resetting to page 1 on any change. Navigation runs in a transition so the input
 * stays responsive. Status filtering lives in the sibling `ProductsStatusTabs`.
 */
export function ProductsFilters({
  search,
  sort,
  dir,
  categoryId,
  categories,
}: {
  search: string;
  sort: ProductSort;
  dir: SortDir;
  /** The active category filter — a category id, {@link UNCATEGORISED_FILTER}, or ''. */
  categoryId: string;
  categories: AdminProductCategory[];
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
    <div {...stylex.props(styles.row)}>
      <div {...stylex.props(styles.searchWrap)}>
        <label htmlFor="product-search" {...stylex.props(styles.srOnly)}>
          Search products by name or description
        </label>
        <input
          id="product-search"
          type="search"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by name or description…"
          {...stylex.props(styles.control)}
        />
      </div>

      {/* Hidden entirely until the gym has shelves — an empty picker is just noise. */}
      {categories.length > 0 ? (
        <div {...stylex.props(styles.categoryWrap)}>
          <label htmlFor="product-category-filter" {...stylex.props(styles.srOnly)}>
            Filter products by category
          </label>
          <select
            id="product-category-filter"
            value={categoryId}
            onChange={(event) => commit({ categoryId: event.target.value })}
            {...stylex.props(styles.control)}
          >
            <option value="">All categories</option>
            <option value={UNCATEGORISED_FILTER}>Uncategorised</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div {...stylex.props(styles.sortWrap)}>
        <label htmlFor="product-sort" {...stylex.props(styles.srOnly)}>
          Sort products
        </label>
        <select
          id="product-sort"
          value={`${sort}:${dir}`}
          onChange={(event) => {
            const [nextSort = 'name', nextDir = 'asc'] = event.target.value.split(':');
            commit({ sort: nextSort, dir: nextDir });
          }}
          {...stylex.props(styles.control)}
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
