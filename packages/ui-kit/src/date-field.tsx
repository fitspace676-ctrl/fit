'use client';

import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import { Icon } from '@fit/ui-web';
import { FieldShell, fieldSkin } from './field';
import { focus, text } from './tokens';
import { useDismissable } from './use-dismissable';

/**
 * A date field with the kit's own calendar, replacing `<input type="date">`.
 *
 * WHY NOT THE NATIVE ONE. The browser's date control is the one input a design
 * system cannot reach: Chrome draws `08/19/2026` in the page's language rather
 * than the reader's, paints its own picker in its own colours, and sizes its
 * spin buttons to nothing we choose. On a Georgian screen that meant a
 * month-first American date under a Georgian label, and a calendar that looked
 * like it belonged to a different product. So the control is ours: a trigger
 * wearing the exact field skin, and a panel built from the kit's own surfaces.
 *
 * DAY FIRST, ALWAYS — `19.08.2026`. Written explicitly rather than left to
 * `Intl`, whose `en` ordering is month-first: the gym, its members and its
 * paperwork all read day-first, and which of the two locales the portal happens
 * to be in does not change what a date means on a form at the front desk. Only
 * the month and weekday NAMES come from `Intl`, where the locale is the point.
 *
 * The value crossing the boundary stays the ISO `YYYY-MM-DD` the native input
 * used, so every caller, schema and API contract is unchanged — this swaps the
 * control, not the contract.
 *
 * A YEAR VIEW, because the first field this replaced is a date of birth. Thirty
 * years of month-by-month arrows is not a date picker, it is a penalty; the
 * header's month label opens a decade grid instead.
 */

const WEEK_START_MONDAY = 1;

/** Cells in the month grid — six weeks, so the panel never changes height. */
const GRID_CELLS = 42;

/** Years shown at once in the year view. */
const YEAR_PAGE = 12;

const styles = stylex.create({
  trigger: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    textAlign: 'start',
    cursor: 'pointer',
  },
  triggerEmpty: {
    color: 'var(--color-text-disabled)',
  },
  value: {
    fontVariantNumeric: 'tabular-nums',
  },
  // The panel is placed against the field wrapper, which `FieldShell` already
  // makes `position: relative` — the same CSS-only anchoring `Popover` uses.
  panel: {
    display: 'block',
    position: 'absolute',
    zIndex: 50,
    top: '100%',
    insetInlineStart: 0,
    marginTop: '0.5rem',
    width: '19.5rem',
    maxWidth: 'calc(100vw - 2rem)',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-popover)',
    boxShadow: 'var(--shadow-high)',
    padding: '0.75rem',
    outline: 'none',
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.25rem',
    marginBottom: '0.5rem',
  },
  nav: {
    display: 'grid',
    placeItems: 'center',
    height: '2rem',
    width: '2rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
    borderWidth: 0,
    backgroundColor: { default: 'transparent', ':hover': 'var(--fc-ghost)' },
    color: { default: 'var(--color-text-secondary)', ':hover': 'var(--color-text-primary)' },
    cursor: 'pointer',
  },
  navGlyph: {
    height: '1rem',
    width: '1rem',
  },
  title: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    height: '2rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: 0,
    paddingInline: '0.625rem',
    backgroundColor: { default: 'transparent', ':hover': 'var(--fc-ghost)' },
    color: 'var(--color-text-primary)',
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    fontWeight: 700,
    cursor: 'pointer',
  },
  weekRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
    marginBottom: '0.25rem',
  },
  weekday: {
    display: 'grid',
    placeItems: 'center',
    height: '1.75rem',
    fontSize: '0.6875rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--color-text-secondary)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
    gap: '0.125rem',
  },
  day: {
    display: 'grid',
    placeItems: 'center',
    height: '2.25rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: 0,
    backgroundColor: { default: 'transparent', ':hover': 'var(--fc-ghost)' },
    color: 'var(--color-text-primary)',
    fontFamily: 'inherit',
    fontSize: '0.8125rem',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    cursor: 'pointer',
  },
  // A day from the neighbouring month still renders — dropping it would leave
  // holes in the grid — but it is plainly not part of the month on screen.
  outside: {
    color: 'var(--color-text-disabled)',
    fontWeight: 500,
  },
  // A day the caller's `min`/`max` puts out of reach. It has always been
  // unclickable; until now it looked exactly like a day that was not, so a
  // bounded calendar read as a broken one — the pointer changed and nothing
  // else did, which is a worse answer than saying no.
  //
  // Dimmed like `outside` but NOT identically: an out-of-range day is still a
  // day of the month being read, so it keeps its weight and loses only its ink.
  // `not-allowed` names the refusal at the pointer, and hover is flattened
  // because a cell that lights up under the cursor promises a click it will
  // not honour.
  unavailable: {
    color: 'var(--color-text-disabled)',
    backgroundColor: { default: 'transparent', ':hover': 'transparent' },
    cursor: 'not-allowed',
  },
  // Today is marked with a rule, the selection with the block fill: two states
  // that can be true at once have to be legible at once.
  today: {
    boxShadow: 'inset 0 0 0 1px var(--color-border-strong, var(--color-border))',
  },
  selected: {
    backgroundColor: { default: 'var(--color-accent)', ':hover': 'var(--color-accent)' },
    color: 'var(--color-on-accent)',
  },
  yearGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '0.25rem',
  },
  year: {
    display: 'grid',
    placeItems: 'center',
    height: '2.5rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: 0,
    backgroundColor: { default: 'transparent', ':hover': 'var(--fc-ghost)' },
    color: 'var(--color-text-primary)',
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    cursor: 'pointer',
  },
});

/** Accessible names the panel's controls need — the app owns the catalogue. */
export interface DateFieldLabels {
  /** Names the trigger's calendar glyph, e.g. "Choose a date". */
  open: string;
  previousMonth: string;
  nextMonth: string;
  /** The month title's action, e.g. "Choose a year". */
  chooseYear: string;
}

export interface DateFieldProps {
  label: string;
  /** ISO `YYYY-MM-DD`, or `''` when unset. */
  value: string;
  onChange: (value: string) => void;
  /** BCP-47 tag the month and weekday names are read in. @default 'en' */
  locale?: string;
  labels: DateFieldLabels;
  /** Shown on the trigger while no date is chosen. */
  placeholder?: string;
  hint?: string;
  invalid?: boolean;
  disabled?: boolean;
  /** Emits a hidden input, so the field still lands in a native form submit. */
  name?: string;
  /** Selectable bounds, ISO `YYYY-MM-DD`. */
  min?: string;
  max?: string;
  action?: ReactNode;
  xstyle?: StyleXStyles;
}

/** A calendar day, as the grid needs it. */
interface Cell {
  iso: string;
  day: number;
  outside: boolean;
  disabled: boolean;
}

const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `2026-08-19` → `{ y: 2026, m: 7, d: 19 }` (month 0-based), or `null`. */
function parseISO(value: string): { y: number; m: number; d: number } | null {
  const match = ISO_PATTERN.exec(value.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]) - 1;
  const d = Number(match[3]);
  if (m < 0 || m > 11 || d < 1 || d > 31) return null;
  return { y, m, d };
}

function toISO(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** `2026-08-19` → `19.08.2026`. Day first in every locale — see the docstring. */
function formatDayFirst(value: string): string {
  const parts = parseISO(value);
  if (!parts) return '';
  return `${String(parts.d).padStart(2, '0')}.${String(parts.m + 1).padStart(2, '0')}.${parts.y}`;
}

/** The seven weekday abbreviations, Monday first, in `locale`. */
function weekdayNames(locale: string): string[] {
  const format = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  // 2024-01-01 was a Monday, so seven consecutive days from it are a full week
  // in the order the grid draws them.
  return Array.from({ length: 7 }, (_, i) => format.format(new Date(2024, 0, 1 + i)));
}

export function DateField({
  label,
  value,
  onChange,
  locale = 'en',
  labels,
  placeholder,
  hint,
  invalid = false,
  disabled = false,
  name,
  min,
  max,
  action,
  xstyle,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const [yearView, setYearView] = useState(false);
  const id = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLSpanElement>(null);

  const selected = parseISO(value);
  const today = useMemo(() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
  }, []);

  // The month on screen. Seeded from the value, or from today when there is
  // none, and thereafter moved by the panel's own arrows.
  const [view, setView] = useState(() => ({
    y: selected?.y ?? today.y,
    m: selected?.m ?? today.m,
  }));

  const weekdays = useMemo(() => weekdayNames(locale), [locale]);
  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
        new Date(view.y, view.m, 1),
      ),
    [locale, view.y, view.m],
  );

  const cells = useMemo<Cell[]>(() => {
    const first = new Date(view.y, view.m, 1);
    // `getDay()` is Sunday-first; shift it so Monday leads the grid.
    const lead = (first.getDay() - WEEK_START_MONDAY + 7) % 7;
    return Array.from({ length: GRID_CELLS }, (_, i) => {
      const date = new Date(view.y, view.m, i - lead + 1);
      const iso = toISO(date.getFullYear(), date.getMonth(), date.getDate());
      return {
        iso,
        day: date.getDate(),
        outside: date.getMonth() !== view.m,
        disabled: Boolean((min && iso < min) || (max && iso > max)),
      };
    });
  }, [view.y, view.m, min, max]);

  // The decade page the year view shows, anchored so the viewed year is on it.
  const yearPageStart = view.y - (((view.y % YEAR_PAGE) + YEAR_PAGE) % YEAR_PAGE);

  const close = () => {
    setOpen(false);
    setYearView(false);
  };

  useDismissable({ open, onClose: close, ref: wrapRef, focusRef: panelRef });

  const shiftMonth = (delta: number) => {
    setView((current) => {
      const next = new Date(current.y, current.m + delta, 1);
      return { y: next.getFullYear(), m: next.getMonth() };
    });
  };

  const display = formatDayFirst(value);

  return (
    <div ref={wrapRef}>
      <FieldShell
        id={id}
        label={label}
        action={action}
        hint={hint}
        invalid={invalid}
        xstyle={xstyle}
      >
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => {
            setYearView(false);
            setOpen((previous) => !previous);
          }}
          {...stylex.props(
            fieldSkin.base,
            fieldSkin.input,
            fieldSkin.withTrailing,
            styles.trigger,
            !display && styles.triggerEmpty,
            invalid && fieldSkin.invalid,
            disabled && fieldSkin.disabled,
          )}
        >
          <span {...stylex.props(styles.value)}>{display || placeholder || ''}</span>
        </button>

        {/* Decoration only — the whole trigger opens the panel, so a second
            focusable control here would be one more Tab stop doing the same job. */}
        <span aria-hidden {...stylex.props(fieldSkin.trailing)}>
          <Icon name="calendar" sw={1.9} {...stylex.props(fieldSkin.glyph)} />
        </span>

        {name ? <input type="hidden" name={name} value={value} /> : null}

        {open ? (
          <span
            ref={panelRef}
            role="dialog"
            aria-label={labels.open}
            tabIndex={-1}
            {...stylex.props(styles.panel)}
          >
            <span {...stylex.props(styles.head)}>
              <button
                type="button"
                aria-label={labels.previousMonth}
                onClick={() =>
                  yearView ? setView((c) => ({ ...c, y: c.y - YEAR_PAGE })) : shiftMonth(-1)
                }
                {...stylex.props(styles.nav, focus.ring)}
              >
                <Icon name="chevronLeft" sw={2.2} {...stylex.props(styles.navGlyph)} />
              </button>

              <button
                type="button"
                aria-label={labels.chooseYear}
                onClick={() => setYearView((previous) => !previous)}
                {...stylex.props(styles.title, focus.ring)}
              >
                {yearView ? `${yearPageStart}–${yearPageStart + YEAR_PAGE - 1}` : monthLabel}
                <Icon name="chevronDown" sw={2.2} {...stylex.props(styles.navGlyph)} />
              </button>

              <button
                type="button"
                aria-label={labels.nextMonth}
                onClick={() =>
                  yearView ? setView((c) => ({ ...c, y: c.y + YEAR_PAGE })) : shiftMonth(1)
                }
                {...stylex.props(styles.nav, focus.ring)}
              >
                <Icon name="chevronRight" sw={2.2} {...stylex.props(styles.navGlyph)} />
              </button>
            </span>

            {yearView ? (
              <span {...stylex.props(styles.yearGrid)}>
                {Array.from({ length: YEAR_PAGE }, (_, i) => yearPageStart + i).map((year) => (
                  <button
                    key={year}
                    type="button"
                    aria-pressed={year === view.y}
                    onClick={() => {
                      setView((current) => ({ ...current, y: year }));
                      setYearView(false);
                    }}
                    {...stylex.props(
                      styles.year,
                      focus.ring,
                      year === selected?.y && styles.selected,
                    )}
                  >
                    {year}
                  </button>
                ))}
              </span>
            ) : (
              <>
                <span {...stylex.props(styles.weekRow)}>
                  {weekdays.map((day, i) => (
                    <span key={`${day}-${i}`} {...stylex.props(text.micro, styles.weekday)}>
                      {day}
                    </span>
                  ))}
                </span>

                <span {...stylex.props(styles.grid)}>
                  {cells.map((cell) => {
                    const isSelected = cell.iso === value;
                    const isToday = cell.iso === toISO(today.y, today.m, today.d);
                    return (
                      <button
                        key={cell.iso}
                        type="button"
                        disabled={cell.disabled}
                        aria-pressed={isSelected}
                        onClick={() => {
                          onChange(cell.iso);
                          close();
                        }}
                        {...stylex.props(
                          styles.day,
                          focus.ring,
                          cell.outside && styles.outside,
                          // After `outside`, so a neighbouring-month day that is
                          // ALSO out of range picks up the refusal cursor rather
                          // than keeping a pointer it cannot act on.
                          cell.disabled && styles.unavailable,
                          isToday && !isSelected && styles.today,
                          isSelected && styles.selected,
                        )}
                      >
                        {cell.day}
                      </button>
                    );
                  })}
                </span>
              </>
            )}
          </span>
        ) : null}
      </FieldShell>
    </div>
  );
}
