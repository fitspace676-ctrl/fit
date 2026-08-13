'use client';

// @fit/ui-web — data-table kit (T1.4).
//
// One reusable, framework-agnostic table for the formacore list screens
// (members, orders, staff, shop). It owns the *presentation* — the glass Card
// shell, sortable column headers, row hover, optional selection column, and the
// empty / loading (skeleton) states — while leaving *data & navigation* to the
// caller: pagination, sorting and filtering are driven by callbacks so each
// screen keeps the URL search params as its single source of truth (the pattern
// the redesigned members roster established).
//
// Building blocks:
//   • {@link DataTable}   — the table itself (columns + rows + sort + states).
//   • {@link FilterChips} — the segmented, gradient-active filter tabs w/ counts.
//   • {@link TableSearch} — the debounced search box.
//   • {@link TablePager}  — the "showing X–Y of N" footer + prev/next.
//   • {@link FilterBar}   — a thin flex layout wrapper for search + actions.
//
// Pure layout/formatting helpers live at the top so they can be unit tested
// without a DOM render (see data-table.spec.ts).

import { useEffect, useRef, useState, type ReactNode, type ChangeEvent } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@astryxdesign/core/Table';
import { EmptyState as AstryxEmptyState } from '@astryxdesign/core/EmptyState';
import { Btn } from './button';
import { Card } from './primitives';
import { Icon, type IconName } from './icon';

/* -------------------------------------------------------------------------- */
/*  Pure helpers (unit tested)                                                  */
/* -------------------------------------------------------------------------- */

export type SortDir = 'asc' | 'desc';

/**
 * The next sort direction when a column header is clicked: the active column
 * flips its direction, a newly-selected column starts ascending.
 */
export function nextSortDir(isActive: boolean, currentDir: SortDir): SortDir {
  return isActive && currentDir === 'asc' ? 'desc' : 'asc';
}

/** The arrow glyph shown next to the active sort column ('' when inactive). */
export function sortIndicator(isActive: boolean, dir: SortDir): '' | '▲' | '▼' {
  if (!isActive) return '';
  return dir === 'asc' ? '▲' : '▼';
}

export interface PageBounds {
  /** 1-based index of the first row on this page (0 when empty). */
  from: number;
  /** 1-based index of the last row on this page. */
  to: number;
  /** Total number of pages (at least 1). */
  pageCount: number;
  hasPrev: boolean;
  hasNext: boolean;
}

/** Compute the "showing from–to of total" bounds and prev/next availability. */
export function pageBounds(page: number, limit: number, total: number): PageBounds {
  const safeLimit = Math.max(1, limit);
  const pageCount = Math.max(1, Math.ceil(total / safeLimit));
  const clamped = Math.min(Math.max(1, page), pageCount);
  const from = total === 0 ? 0 : (clamped - 1) * safeLimit + 1;
  const to = Math.min(clamped * safeLimit, total);
  return {
    from,
    to,
    pageCount,
    hasPrev: clamped > 1,
    hasNext: clamped * safeLimit < total,
  };
}

export type CellAlign = 'left' | 'right' | 'center';

/** Map a cell alignment to its text-alignment utility class. */
export function alignClass(align: CellAlign = 'left'): string {
  return align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
}

/* -------------------------------------------------------------------------- */
/*  Shared class recipes                                                        */
/* -------------------------------------------------------------------------- */

// Only the brand *typography* / spacing rides in through these class recipes —
// the row hover, row dividers and horizontal scroll now come from the Astryx
// <Table> (hasHover + dividers) the DataTable renders underneath (T11.4).
const HEAD_CELL =
  'py-3 pr-4 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400';
const BODY_CELL = 'py-3 pr-4 align-middle';

/* -------------------------------------------------------------------------- */
/*  Column model                                                                */
/* -------------------------------------------------------------------------- */

export interface Column<T> {
  /** Stable id for the column (React key + default header text). */
  key: string;
  /** Header content. Defaults to `key` when omitted. */
  header?: ReactNode;
  /**
   * The sort key passed to `onSort` when this header is clicked. Omit to make
   * the column non-sortable. Sorting only renders when the table also gets an
   * `onSort` handler.
   */
  sortKey?: string;
  align?: CellAlign;
  /** Extra classes for the body cell (e.g. `font-mono tabular-nums`). */
  className?: string;
  /** Extra classes for the header cell (e.g. a width like `w-10`). */
  headerClassName?: string;
  /** Render the cell for one row. */
  cell: (row: T) => ReactNode;
}

/** Optional row-selection wiring (adds a leading checkbox column). */
export interface TableSelection {
  /** ids currently selected (across pages — the caller owns the set). */
  selectedIds: ReadonlySet<string>;
  /** Whether every row on the current page is selected. */
  allSelected: boolean;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  /** Accessible label for the header "select all" checkbox. */
  selectAllLabel?: string;
}

export interface DataTableProps<T> {
  columns: ReadonlyArray<Column<T>>;
  rows: ReadonlyArray<T>;
  /** Stable id for a row — used as React key and for selection. */
  rowKey: (row: T) => string;
  /** When set, each row becomes clickable and calls this with its row datum. */
  onRowClick?: (row: T) => void;
  /** Active sort key, matched against each column's `sortKey`. */
  sort?: string;
  dir?: SortDir;
  /** Called with a column's `sortKey` when its header is activated. */
  onSort?: (sortKey: string) => void;
  /** Render the loading skeleton instead of rows. */
  loading?: boolean;
  /** How many skeleton rows to draw while loading. */
  skeletonRows?: number;
  /** Empty-state content shown when there are no rows and not loading. */
  empty?: ReactNode;
  /** Optional selection column wiring. */
  selection?: TableSelection;
  /** Accessible caption for the table. */
  caption?: string;
  className?: string;
}

const SELECT_CHECKBOX = 'h-4 w-4 rounded border-ink-300 dark:border-white/20';

/**
 * The shared list table. Server-rendered rows in, presentation out — sorting,
 * paging and filtering are the caller's callbacks. Renders a glass {@link Card}
 * with a horizontally-scrollable table, and swaps in a skeleton while `loading`
 * or the `empty` state when there are no rows.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  sort,
  dir = 'asc',
  onSort,
  loading = false,
  skeletonRows = 5,
  empty,
  selection,
  caption,
  className = '',
}: DataTableProps<T>) {
  // Empty state (only when we have finished loading and there is nothing).
  if (!loading && rows.length === 0) {
    return <Card className={`px-4 py-14 ${className}`.trim()}>{empty ?? <EmptyState />}</Card>;
  }

  return (
    <Card className={`overflow-hidden ${className}`.trim()}>
      <Table<Record<string, unknown>>
        hasHover
        dividers="rows"
        density="balanced"
        tableProps={{ className: 'w-full text-left text-sm' }}
      >
        {caption && <caption className="sr-only">{caption}</caption>}
        <TableHeader>
          <TableRow isHeaderRow>
            {selection && (
              <TableHeaderCell scope="col" className="w-10 pl-5 pr-4">
                <input
                  type="checkbox"
                  aria-label={selection.selectAllLabel ?? 'Select all rows on this page'}
                  checked={selection.allSelected}
                  onChange={selection.onToggleAll}
                  className={SELECT_CHECKBOX}
                />
              </TableHeaderCell>
            )}
            {columns.map((column, index) => {
              const sortKey = column.sortKey;
              const isActive = sortKey !== undefined && sort === sortKey;
              const label = column.header ?? column.key;
              const padStart = index === 0 && !selection ? 'pl-5' : '';
              return (
                <TableHeaderCell
                  key={column.key}
                  scope="col"
                  aria-sort={isActive ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={`${HEAD_CELL} ${alignClass(column.align)} ${padStart} ${column.headerClassName ?? ''}`.trim()}
                >
                  {sortKey !== undefined && onSort ? (
                    <button
                      type="button"
                      onClick={() => onSort(sortKey)}
                      className="inline-flex items-center gap-1 uppercase tracking-[0.15em] hover:text-ink-600 dark:hover:text-ink-200"
                    >
                      {label}
                      <span aria-hidden className="text-[9px]">
                        {sortIndicator(isActive, dir)}
                      </span>
                    </button>
                  ) : (
                    label
                  )}
                </TableHeaderCell>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading
            ? Array.from({ length: Math.max(1, skeletonRows) }).map((_, r) => (
                <TableRow key={`skeleton-${r}`}>
                  {selection && (
                    <TableCell className="pl-5 pr-4">
                      <span className="block h-4 w-4 rounded bg-ink-100 dark:bg-white/10" />
                    </TableCell>
                  )}
                  {columns.map((column, index) => (
                    <TableCell
                      key={column.key}
                      className={`${BODY_CELL} ${index === 0 && !selection ? 'pl-5' : ''}`.trim()}
                    >
                      <span className="block h-4 w-[60%] animate-pulse rounded bg-ink-100 dark:bg-white/10" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : rows.map((row) => {
                const id = rowKey(row);
                return (
                  <TableRow
                    key={id}
                    {...(onRowClick
                      ? { onClick: () => onRowClick(row), style: { cursor: 'pointer' } }
                      : {})}
                  >
                    {selection && (
                      <TableCell className="pl-5 pr-4">
                        <input
                          type="checkbox"
                          aria-label={`Select row ${id}`}
                          checked={selection.selectedIds.has(id)}
                          onChange={() => selection.onToggle(id)}
                          className={SELECT_CHECKBOX}
                        />
                      </TableCell>
                    )}
                    {columns.map((column, index) => (
                      <TableCell
                        key={column.key}
                        className={`${BODY_CELL} ${alignClass(column.align)} ${index === 0 && !selection ? 'pl-5' : ''} ${column.className ?? ''}`.trim()}
                      >
                        {column.cell(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
        </TableBody>
      </Table>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Empty state                                                                 */
/* -------------------------------------------------------------------------- */

export interface EmptyStateProps {
  icon?: IconName;
  title?: string;
  message?: string;
  /** Optional action (e.g. a "New" button). */
  action?: ReactNode;
}

/**
 * The centred empty-state block used inside the table Card. Renders the Astryx
 * `<EmptyState>` (T11.4) with the brand icon chip preserved as its `icon` slot,
 * keeping the formacore prop shape (`icon` / `title` / `message` / `action`).
 */
export function EmptyState({
  icon = 'search',
  title = 'Nothing here yet',
  message = 'No records match your filters.',
  action,
}: EmptyStateProps) {
  return (
    <AstryxEmptyState
      title={title}
      description={message}
      icon={
        <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          <Icon name={icon} className="h-6 w-6" />
        </span>
      }
      actions={action}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  FilterChips — segmented tabs with counts                                    */
/* -------------------------------------------------------------------------- */

const CHIP_GRADIENT = 'bg-[linear-gradient(135deg,#7C3AED,#EC4899)]';

export interface FilterChip {
  label: string;
  /** The value written to state when selected ('' is the "all" chip). */
  value: string;
  count?: number;
}

export interface FilterChipsProps {
  chips: ReadonlyArray<FilterChip>;
  /** The currently-active chip value. */
  active: string;
  onSelect: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}

/** The segmented, gradient-active filter tabs (with optional counts). */
export function FilterChips({
  chips,
  active,
  onSelect,
  ariaLabel = 'Filter',
  className = '',
}: FilterChipsProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex w-fit flex-wrap gap-1 rounded-btn border border-ink-200 bg-white p-1 dark:border-white/10 dark:bg-white/[0.04] ${className}`.trim()}
    >
      {chips.map((chip) => {
        const isActive = chip.value === active;
        return (
          <button
            key={chip.value || 'all'}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(chip.value)}
            className={`inline-flex items-center gap-1.5 rounded-btn px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              isActive
                ? `${CHIP_GRADIENT} text-white shadow-[0_4px_14px_-4px_rgba(98,87,227,0.8)]`
                : 'text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white'
            }`}
          >
            {chip.label}
            {chip.count !== undefined && (
              <span
                className={`font-mono text-xs tabular-nums ${isActive ? 'text-white/80' : 'text-ink-400'}`}
              >
                {chip.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  TableSearch — debounced search box                                          */
/* -------------------------------------------------------------------------- */

export interface TableSearchProps {
  /** Controlled initial value (kept in sync with the URL). */
  value: string;
  /** Fired after the debounce with the trimmed query. */
  onSearch: (query: string) => void;
  placeholder?: string;
  /** Debounce in ms before `onSearch` fires. */
  debounceMs?: number;
  ariaLabel?: string;
  className?: string;
}

/** The debounced list search box, with a leading search glyph. */
export function TableSearch({
  value,
  onSearch,
  placeholder = 'Search…',
  debounceMs = 200,
  ariaLabel = 'Search',
  className = '',
}: TableSearchProps) {
  const [text, setText] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // Re-sync if the source value changes elsewhere (back button, reset) — but
  // never into a box that is being typed in. A keystroke commits after the
  // debounce, and on every list screen that commit is a URL change, so the
  // committed query comes back as `value` a round trip later — by which point
  // the user has typed on. Writing that echo in rewrites the field mid-word:
  // it eats the space `onSearch` trimmed off, and drops whatever was typed
  // while the navigation was in flight. The box owns its text while focused;
  // the source owns it the rest of the time.
  useEffect(() => {
    if (input.current !== null && document.activeElement === input.current) return;
    setText(value);
  }, [value]);

  // Clear any pending debounce on unmount.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function onChange(event: ChangeEvent<HTMLInputElement>): void {
    const next = event.target.value;
    setText(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onSearch(next.trim()), debounceMs);
  }

  return (
    <div className={`relative flex-1 ${className}`.trim()}>
      <label className="sr-only">{ariaLabel}</label>
      <Icon
        name="search"
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
      />
      <input
        ref={input}
        type="search"
        value={text}
        onChange={onChange}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-11 w-full rounded-field border border-ink-200 bg-white pl-10 pr-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  FilterBar — layout wrapper                                                  */
/* -------------------------------------------------------------------------- */

/** A responsive row wrapper for a {@link TableSearch} plus trailing actions. */
export function FilterBar({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-center ${className}`.trim()}>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  TablePager — footer + prev/next                                             */
/* -------------------------------------------------------------------------- */

export interface TablePagerProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Noun for the count label, e.g. "members" → "Showing 1–20 of 40 members". */
  noun?: string;
  className?: string;
}

/** The "showing X–Y of N" footer with Previous / Next controls. */
export function TablePager({
  page,
  limit,
  total,
  onPageChange,
  noun = 'results',
  className = '',
}: TablePagerProps) {
  const { from, to, hasPrev, hasNext } = pageBounds(page, limit, total);
  return (
    <div
      className={`flex items-center justify-between text-sm text-ink-500 dark:text-ink-400 ${className}`.trim()}
    >
      <span className="font-mono tabular-nums">
        Showing {from}–{to} of {total} {noun}
      </span>
      <div className="flex gap-2">
        <Btn
          v="outline"
          size="sm"
          icon="chevronLeft"
          disabled={!hasPrev}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Btn>
        <Btn
          v="outline"
          size="sm"
          iconRight="chevronRight"
          disabled={!hasNext}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Btn>
      </div>
    </div>
  );
}
