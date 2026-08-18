'use client';

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import { Icon } from '@fit/ui-web';
import { Button } from './button';
import { Checkbox } from './checkbox';
import { focus, text } from './tokens';

/**
 * The console's list table and the controls around it.
 *
 * This is the most repeated object in the product — nine screens render it — and
 * it was the largest thing still painted by `@fit/ui-web`, the Tailwind package
 * the migration guardrail deliberately exempts. So every "migrated" list screen
 * was in fact a FormaCore page wrapped around a Tailwind table, and the seam ran
 * straight down the middle of the screen a member of staff looks at all day.
 *
 * Server-rendered rows in, presentation out: sorting, paging and filtering are
 * the caller's callbacks, exactly as before. The API is deliberately the same
 * shape (`columns` / `rows` / `rowKey` / `selection` / `onSort`) so the nine call
 * sites move across without rethinking their data flow.
 *
 * WHAT CHANGED WITH THE DIRECTION, beyond colour:
 *
 *   • The active filter chip was a 135° violet→pink GRADIENT with a coloured drop
 *     shadow. The direction bans gradients and glows outright; the chip is a flat
 *     lime fill with ink type, the same object as the kit's segmented control.
 *   • Sorting was indicated by ▲ / ▼ text glyphs, which render in whatever the
 *     font has and sit off the type baseline. They are chevron icons now.
 *   • Row selection tints the row in the accent rather than only ticking a box,
 *     so a selection of twenty across a long page is visible without reading
 *     every checkbox.
 *   • Strings are the CALLER's. The old table hard-coded English ("Previous",
 *     "Showing X–Y of N", "Select all rows on this page") — invisible in a
 *     console whose staff work in Georgian. The kit has no message catalogue, so
 *     it takes the words as props.
 */

/* -------------------------------------------------------------------------- */
/*  Sorting + paging maths                                                      */
/* -------------------------------------------------------------------------- */

export type SortDir = 'asc' | 'desc';

/**
 * The direction a header click should produce: a fresh column starts ascending,
 * the active one flips.
 */
export function nextSortDir(isActive: boolean, currentDir: SortDir): SortDir {
  return isActive && currentDir === 'asc' ? 'desc' : 'asc';
}

export interface PageBounds {
  /** 1-based index of the first row on this page (0 when there are none). */
  from: number;
  /** 1-based index of the last row on this page. */
  to: number;
  hasPrev: boolean;
  hasNext: boolean;
}

/** Resolve the "showing from–to of total" bounds for a 1-based page. */
export function pageBounds(page: number, limit: number, total: number): PageBounds {
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return { from, to, hasPrev: page > 1, hasNext: to < total };
}

export type CellAlign = 'left' | 'right' | 'center';

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
  /** Extra styles for this column's body cells — e.g. a mono numeral column. */
  xstyle?: StyleXStyles;
  /** Extra styles for the header cell — e.g. a fixed width. */
  headerXstyle?: StyleXStyles;
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
  selectAllLabel: string;
  /** Accessible label for one row's checkbox — receives the row id. */
  rowLabel: (id: string) => string;
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
  /** Shown when there are no rows and not loading. Usually the kit's `EmptyState`. */
  empty?: ReactNode;
  /** Optional selection column wiring. */
  selection?: TableSelection;
  /** Accessible caption for the table. */
  caption?: string;
  xstyle?: StyleXStyles;
}

const shimmer = stylex.keyframes({
  from: { opacity: 0.55 },
  to: { opacity: 1 },
});

const styles = stylex.create({
  card: {
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-background-card)',
    overflow: 'hidden',
  },
  emptyCard: {
    paddingBlock: '2rem',
  },
  // The table scrolls inside the card rather than widening the page: a console
  // list can carry twelve columns, and a body-level horizontal scrollbar would
  // drag the whole shell — sidebar included — sideways.
  scroll: {
    width: '100%',
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'start',
    fontSize: '0.875rem',
  },
  caption: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
  },
  headRow: {
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
  },
  // The head is the direction's micro-label, in mono: a column name is a machine
  // string, and this is the same face every id and count in the product uses.
  headCell: {
    paddingBlock: '0.75rem',
    paddingInlineEnd: '1rem',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  firstCell: {
    paddingInlineStart: '1.25rem',
  },
  sortButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    borderWidth: 0,
    borderRadius: 'var(--radius-inner)',
    backgroundColor: 'transparent',
    padding: 0,
    font: 'inherit',
    letterSpacing: 'inherit',
    textTransform: 'inherit',
    color: { default: 'inherit', ':hover': 'var(--color-text-primary)' },
    cursor: 'pointer',
    transitionProperty: 'color',
    transitionDuration: '150ms',
  },
  sortActive: {
    color: 'var(--color-text-primary)',
  },
  sortGlyph: {
    height: '0.75rem',
    width: '0.75rem',
  },
  row: {
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    transitionProperty: 'background-color',
    transitionDuration: '150ms',
  },
  rowHover: {
    backgroundColor: { default: null, ':hover': 'var(--color-overlay-hover)' },
  },
  rowClickable: {
    cursor: 'pointer',
  },
  // A selected row is tinted, not just ticked: twenty selections down a long page
  // are otherwise invisible unless you read every box.
  rowSelected: {
    backgroundColor: 'var(--color-accent-muted)',
  },
  cell: {
    paddingBlock: '0.75rem',
    paddingInlineEnd: '1rem',
    verticalAlign: 'middle',
    color: 'var(--color-text-primary)',
  },
  selectCell: {
    width: '1px',
    paddingInlineStart: '1.25rem',
    paddingInlineEnd: '1rem',
  },
  alignStart: { textAlign: 'start' },
  alignEnd: { textAlign: 'end' },
  alignCenter: { textAlign: 'center' },
  skeleton: {
    display: 'block',
    height: '0.875rem',
    width: '60%',
    borderRadius: 'var(--radius-inner)',
    backgroundColor: 'var(--color-skeleton)',
    animationName: shimmer,
    animationDuration: '1.1s',
    animationDirection: 'alternate',
    animationIterationCount: 'infinite',
    '@media (prefers-reduced-motion: reduce)': { animationName: 'none' },
  },
  skeletonBox: {
    display: 'block',
    height: '1.125rem',
    width: '1.125rem',
    borderRadius: '0.375rem',
    backgroundColor: 'var(--color-skeleton)',
  },
});

const ALIGN = {
  left: styles.alignStart,
  right: styles.alignEnd,
  center: styles.alignCenter,
} as const;

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
  xstyle,
}: DataTableProps<T>) {
  if (!loading && rows.length === 0) {
    return <div {...stylex.props(styles.card, styles.emptyCard, xstyle)}>{empty}</div>;
  }

  return (
    <div {...stylex.props(styles.card, xstyle)}>
      <div {...stylex.props(styles.scroll)}>
        <table {...stylex.props(styles.table)}>
          {caption ? <caption {...stylex.props(styles.caption)}>{caption}</caption> : null}
          <thead>
            <tr {...stylex.props(styles.headRow)}>
              {selection ? (
                <th scope="col" {...stylex.props(styles.headCell, styles.selectCell)}>
                  <Checkbox
                    label={selection.selectAllLabel}
                    labelHidden
                    checked={selection.allSelected}
                    // Partly selected reads as `mixed` rather than as off, which
                    // is the difference between "nothing is selected" and "some
                    // of this page is".
                    indeterminate={!selection.allSelected && selection.selectedIds.size > 0}
                    onChange={selection.onToggleAll}
                  />
                </th>
              ) : null}
              {columns.map((column, index) => {
                const sortKey = column.sortKey;
                const isActive = sortKey !== undefined && sort === sortKey;
                const label = column.header ?? column.key;
                const leading = index === 0 && !selection;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={isActive ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    {...stylex.props(
                      styles.headCell,
                      ALIGN[column.align ?? 'left'],
                      leading && styles.firstCell,
                      column.headerXstyle,
                    )}
                  >
                    {sortKey !== undefined && onSort ? (
                      <button
                        type="button"
                        onClick={() => onSort(sortKey)}
                        {...stylex.props(
                          styles.sortButton,
                          isActive && styles.sortActive,
                          focus.ring,
                        )}
                      >
                        {label}
                        {isActive ? (
                          <Icon
                            name={dir === 'asc' ? 'chevronUp' : 'chevronDown'}
                            sw={2.4}
                            aria-hidden
                            {...stylex.props(styles.sortGlyph)}
                          />
                        ) : null}
                      </button>
                    ) : (
                      label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: Math.max(1, skeletonRows) }).map((_, r) => (
                  <tr key={`skeleton-${r}`} {...stylex.props(styles.row)}>
                    {selection ? (
                      <td {...stylex.props(styles.cell, styles.selectCell)}>
                        <span {...stylex.props(styles.skeletonBox)} />
                      </td>
                    ) : null}
                    {columns.map((column, index) => (
                      <td
                        key={column.key}
                        {...stylex.props(
                          styles.cell,
                          index === 0 && !selection && styles.firstCell,
                        )}
                      >
                        <span {...stylex.props(styles.skeleton)} />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => {
                  const id = rowKey(row);
                  const isSelected = selection?.selectedIds.has(id) ?? false;
                  return (
                    <tr
                      key={id}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      {...stylex.props(
                        styles.row,
                        !isSelected && styles.rowHover,
                        isSelected && styles.rowSelected,
                        onRowClick && styles.rowClickable,
                      )}
                    >
                      {selection ? (
                        // The click must not bubble: the checkbox sits inside a
                        // row that navigates, so ticking one would also open it.
                        <td
                          onClick={(event) => event.stopPropagation()}
                          {...stylex.props(styles.cell, styles.selectCell)}
                        >
                          <Checkbox
                            label={selection.rowLabel(id)}
                            labelHidden
                            checked={isSelected}
                            onChange={() => selection.onToggle(id)}
                          />
                        </td>
                      ) : null}
                      {columns.map((column, index) => (
                        <td
                          key={column.key}
                          {...stylex.props(
                            styles.cell,
                            ALIGN[column.align ?? 'left'],
                            index === 0 && !selection && styles.firstCell,
                            column.xstyle,
                          )}
                        >
                          {column.cell(row)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  FilterChips — segmented tabs with counts                                    */
/* -------------------------------------------------------------------------- */

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
  /** Accessible name for the group. */
  label: string;
  xstyle?: StyleXStyles;
}

const chipStyles = stylex.create({
  group: {
    display: 'inline-flex',
    width: 'fit-content',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.125rem',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-muted)',
    padding: '0.25rem',
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    height: '2rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: 0,
    paddingInline: '0.875rem',
    fontFamily: 'inherit',
    fontSize: '0.8125rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    transitionProperty: 'background-color, color',
    transitionDuration: '150ms',
  },
  idle: {
    backgroundColor: { default: 'transparent', ':hover': 'var(--color-overlay-hover)' },
    color: { default: 'var(--color-text-secondary)', ':hover': 'var(--color-text-primary)' },
  },
  // Flat lime. It replaced a 135° violet→pink gradient with a coloured drop
  // shadow — the exact combination the direction removes.
  active: {
    backgroundColor: 'var(--color-accent)',
    backgroundImage: 'var(--brand-fill-image, none)',
    color: 'var(--color-on-accent)',
  },
  count: {
    fontSize: '0.75rem',
    opacity: 0.75,
  },
});

/**
 * The segmented filter tabs over a list, with optional counts.
 *
 * A `tablist` whose tabs control the rows below. Like the kit's segmented
 * control it is one tab stop with arrow-key movement, so a keyboard user does
 * not have to step through six filters to reach the table.
 */
export function FilterChips({ chips, active, onSelect, label, xstyle }: FilterChipsProps) {
  const groupRef = useRef<HTMLDivElement>(null);

  function move(delta: number): void {
    const index = chips.findIndex((chip) => chip.value === active);
    if (index < 0) return;
    const next = chips[(index + delta + chips.length) % chips.length]!;
    onSelect(next.value);
    groupRef.current
      ?.querySelector<HTMLButtonElement>(`[data-value="${CSS.escape(next.value || 'all')}"]`)
      ?.focus();
  }

  return (
    <div
      ref={groupRef}
      role="tablist"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          move(1);
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          move(-1);
        }
      }}
      {...stylex.props(chipStyles.group, xstyle)}
    >
      {chips.map((chip) => {
        const isActive = chip.value === active;
        return (
          <button
            key={chip.value || 'all'}
            type="button"
            role="tab"
            data-value={chip.value || 'all'}
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelect(chip.value)}
            {...stylex.props(
              chipStyles.chip,
              isActive ? chipStyles.active : chipStyles.idle,
              focus.ring,
            )}
          >
            {chip.label}
            {chip.count !== undefined ? (
              <span {...stylex.props(chipStyles.count, text.numeral)}>{chip.count}</span>
            ) : null}
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
  /** Accessible name for the box. */
  label: string;
  xstyle?: StyleXStyles;
}

const searchStyles = stylex.create({
  wrap: {
    position: 'relative',
    display: 'block',
    flex: 1,
    minWidth: 0,
  },
  glyph: {
    position: 'absolute',
    insetInlineStart: '0.875rem',
    top: '50%',
    transform: 'translateY(-50%)',
    pointerEvents: 'none',
    height: '1rem',
    width: '1rem',
    color: 'var(--color-text-secondary)',
  },
  input: {
    height: '2.5rem',
    width: '100%',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: { default: 'var(--color-border)', ':focus': 'var(--color-accent)' },
    backgroundColor: 'var(--fc-tile)',
    color: 'var(--color-text-primary)',
    paddingInlineStart: '2.5rem',
    paddingInlineEnd: '0.875rem',
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    outline: 'none',
    boxShadow: { default: null, ':focus': 'var(--fc-focus-ring)' },
    transitionProperty: 'border-color, box-shadow',
    transitionDuration: '150ms',
    '::placeholder': { color: 'var(--color-text-disabled)' },
  },
});

/** The debounced list search box, with a leading search glyph. */
export function TableSearch({
  value,
  onSearch,
  placeholder,
  debounceMs = 200,
  label,
  xstyle,
}: TableSearchProps) {
  const [query, setQuery] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // Re-sync if the source value changes elsewhere (back button, reset) — but
  // never into a box that is being typed in. A keystroke commits after the
  // debounce, and on every list screen that commit is a URL change, so the
  // committed query comes back as `value` a round trip later — by which point
  // the user has typed on. Writing that echo in rewrites the field mid-word: it
  // eats the space `onSearch` trimmed off, and drops whatever was typed while the
  // navigation was in flight. The box owns its text while focused; the source
  // owns it the rest of the time.
  useEffect(() => {
    if (input.current !== null && document.activeElement === input.current) return;
    setQuery(value);
  }, [value]);

  // Clear any pending debounce on unmount.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function onChange(event: ChangeEvent<HTMLInputElement>): void {
    const next = event.target.value;
    setQuery(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onSearch(next.trim()), debounceMs);
  }

  return (
    <div {...stylex.props(searchStyles.wrap, xstyle)}>
      <Icon name="search" aria-hidden {...stylex.props(searchStyles.glyph)} />
      <input
        ref={input}
        type="search"
        value={query}
        onChange={onChange}
        placeholder={placeholder}
        aria-label={label}
        {...stylex.props(searchStyles.input)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  FilterBar — layout wrapper                                                  */
/* -------------------------------------------------------------------------- */

const barStyles = stylex.create({
  bar: {
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
});

/** A responsive row wrapper for a {@link TableSearch} plus trailing actions. */
export function FilterBar({ children, xstyle }: { children: ReactNode; xstyle?: StyleXStyles }) {
  return <div {...stylex.props(barStyles.bar, xstyle)}>{children}</div>;
}

/* -------------------------------------------------------------------------- */
/*  TablePager — footer + prev/next                                             */
/* -------------------------------------------------------------------------- */

export interface TablePagerProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
  /**
   * The count line, e.g. "Showing 1–20 of 40 members". Built by the caller from
   * the `{ from, to, total }` this hands back, so the phrasing and word order
   * come from the app's own catalogue rather than from an English template here.
   */
  summary: (bounds: { from: number; to: number; total: number }) => string;
  previousLabel: string;
  nextLabel: string;
  xstyle?: StyleXStyles;
}

const pagerStyles = stylex.create({
  bar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  actions: {
    display: 'flex',
    gap: '0.5rem',
  },
  glyph: {
    height: '1rem',
    width: '1rem',
  },
});

/** The "showing X–Y of N" footer with previous / next controls. */
export function TablePager({
  page,
  limit,
  total,
  onPageChange,
  summary,
  previousLabel,
  nextLabel,
  xstyle,
}: TablePagerProps) {
  const { from, to, hasPrev, hasNext } = pageBounds(page, limit, total);
  return (
    <div {...stylex.props(pagerStyles.bar, xstyle)}>
      <span {...stylex.props(text.numeral)}>{summary({ from, to, total })}</span>
      <div {...stylex.props(pagerStyles.actions)}>
        <Button
          variant="secondary"
          size="inline"
          label={previousLabel}
          icon={<Icon name="chevronLeft" {...stylex.props(pagerStyles.glyph)} />}
          disabled={!hasPrev}
          onClick={() => onPageChange(page - 1)}
        />
        <Button
          variant="secondary"
          size="inline"
          label={nextLabel}
          endContent={<Icon name="chevronRight" {...stylex.props(pagerStyles.glyph)} />}
          disabled={!hasNext}
          onClick={() => onPageChange(page + 1)}
        />
      </div>
    </div>
  );
}
