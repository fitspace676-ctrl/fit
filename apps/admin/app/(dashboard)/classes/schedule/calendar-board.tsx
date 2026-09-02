'use client';

// The calendar every scheduling screen in the console draws with. The class
// Schedule and the PT Calendar are the same surface - a toolbar (prev / next,
// the range, Today · Week · Month, Calendar · List, an add button), a filter
// row, and one of four views (day agenda, week slot grid, month grid, week
// list) - drawn over one generic {@link CalendarEvent} shape. Each screen maps
// its own records into that shape, supplies its own filters, its own add
// drawer and its own detail drawer, and passes its own translator: the keys
// are the same, the words differ ("classes" here, "sessions" there).
//
// Every view lives here rather than beside its screen so the two calendars
// cannot drift: a change to the week grid's card is a change to both.

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, type useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type { ClassInstanceStatus } from '@fit/types';
import { Badge, Card, type BadgeTone } from '@fit/ui-kit';
import { Icon } from '@/components/ui';
import {
  addDays,
  addMonths,
  addWeeks,
  monthGridDays,
  toIsoDate,
  weekDays,
  zonedClock,
  zonedIsoDate,
  zonedMinutesOfDay,
} from './week';
import { WeekGrid } from './week-grid';
import { createDateTimeFormat } from '@fit/i18n';

/**
 * What every calendar draws: one thing at one time, with the few facts a card
 * has room for. A class occurrence satisfies it as it is; a PT session or a
 * service slot is mapped into it. `capacity` / `bookedCount` are null for an
 * event that has no seats to fill (a one-to-one session), and the occupancy
 * meter, the "booked" stat and the "x/y booked" footer all step aside for it.
 */
export interface CalendarEvent {
  id: string;
  title: string;
  /** The accent colour the card and the month chip wear. Any CSS colour. */
  color: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  trainerName: string | null;
  locationName: string | null;
  room: string | null;
  capacity: number | null;
  bookedCount: number | null;
  status: ClassInstanceStatus;
  /**
   * One more line under the title - who the session is for, or that the slot is
   * open. Classes have none.
   */
  subtitle?: string | null;
}

/** The occupancy figures a card draws, or null when the event has no seats. */
function occupancyOf(event: CalendarEvent): {
  booked: number;
  capacity: number;
  remaining: number;
  pct: number;
  barColor: string;
} | null {
  if (event.capacity === null || event.bookedCount === null) return null;
  const remaining = Math.max(0, event.capacity - event.bookedCount);
  const raw = event.capacity > 0 ? (event.bookedCount / event.capacity) * 100 : 0;
  const barColor =
    raw > 85 ? 'var(--color-error)' : raw > 60 ? 'var(--color-warning)' : 'var(--color-success)';
  return {
    booked: event.bookedCount,
    capacity: event.capacity,
    remaining,
    pct: Math.min(100, raw),
    barColor,
  };
}

type T = ReturnType<typeof useTranslations>;

/**
 * Which calendar surface is showing — the day agenda, the two calendar
 * granularities, and the week list.
 */
export type ScheduleView = 'day' | 'week' | 'month' | 'list';

/** The day agenda's timeline gutter: the clock column, then the rail. */
const AGENDA_COLUMNS = '3.75rem 1rem minmax(0, 1fr)';

const pulse = stylex.keyframes({
  '0%': { opacity: 1 },
  '50%': { opacity: 0.4 },
  '100%': { opacity: 1 },
});

const styles = stylex.create({
  /** Icon size inside a kit `Button`. */
  kitGlyph: { height: '1rem', width: '1rem' },
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  toolbar: {
    display: 'flex',
    flexDirection: {
      default: 'column',
      '@media (min-width: 1024px)': 'row',
    },
    alignItems: {
      default: 'stretch',
      '@media (min-width: 1024px)': 'center',
    },
    justifyContent: {
      default: 'flex-start',
      '@media (min-width: 1024px)': 'space-between',
    },
    gap: '1rem',
  },
  navGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  navBox: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0.125rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
  },
  navBtn: {
    display: 'grid',
    height: '2rem',
    width: '2rem',
    placeItems: 'center',
    borderWidth: 0,
    borderRadius: 'var(--radius-element)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-background-muted)',
    },
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-text-primary)',
    },
    cursor: 'pointer',
    transitionProperty: 'background-color, color',
    transitionDuration: '150ms',
  },
  navBtnIcon: {
    width: '1rem',
    height: '1rem',
  },
  rangeLabel: {
    margin: 0,
    marginLeft: '0.25rem',
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.125rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  rightGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem',
  },
  // Segmented control (Today · Week · Month  /  Calendar · List).
  seg: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0.1875rem',
    gap: '0.1875rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
  },
  segBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    height: '2.25rem',
    paddingInline: '0.875rem',
    borderWidth: 0,
    borderRadius: 'calc(var(--radius-element) - 0.1875rem)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-background-muted)',
    },
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-text-primary)',
    },
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
    transitionProperty: 'background-color, color',
    transitionDuration: '150ms',
    whiteSpace: 'nowrap',
  },
  segBtnActive: {
    backgroundColor: {
      default: 'var(--color-accent)',
      ':hover': 'var(--color-accent)',
    },
    color: {
      default: 'var(--color-on-accent)',
      ':hover': 'var(--color-on-accent)',
    },
  },
  segIcon: {
    width: '1rem',
    height: '1rem',
  },
  filterGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem',
  },
  weekdayLabel: {
    fontSize: '0.6875rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
  },
  dayNum: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.25rem',
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1,
    color: 'var(--color-text-primary)',
  },
  dayNumToday: {
    color: 'var(--color-text-accent)',
  },
  // ── Month grid ─────────────────────────────────────────────────────────────
  monthWrap: {
    overflowX: 'auto',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-body)',
  },
  monthWeekdays: {
    minWidth: '44rem',
    display: 'grid',
    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
  },
  monthWeekday: {
    paddingBlock: '0.625rem',
    textAlign: 'center',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--color-text-secondary)',
  },
  monthGrid: {
    minWidth: '44rem',
    display: 'grid',
    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
  },
  monthCell: {
    display: 'flex',
    minHeight: '6.5rem',
    flexDirection: 'column',
    gap: '0.25rem',
    padding: '0.375rem',
    borderTopWidth: '1px',
    borderLeftWidth: '1px',
    borderTopStyle: 'solid',
    borderLeftStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    borderLeftColor: 'var(--color-border)',
  },
  monthCellOutside: {
    backgroundColor: 'var(--color-background-muted)',
  },
  monthCellToday: {
    backgroundColor: 'var(--color-accent-muted)',
  },
  monthDateNum: {
    fontSize: '0.75rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  monthDateNumOutside: {
    color: 'var(--color-text-secondary)',
  },
  monthDateNumToday: {
    color: 'var(--color-text-accent)',
  },
  monthChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    width: '100%',
    overflow: 'hidden',
    borderWidth: 0,
    borderRadius: 'var(--radius-element)',
    paddingBlock: '0.125rem',
    paddingInline: '0.25rem',
    backgroundColor: {
      default: 'var(--color-background-surface)',
      ':hover': 'var(--color-background-muted)',
    },
    textAlign: 'left',
    cursor: 'pointer',
  },
  monthChipDot: {
    width: '0.5rem',
    height: '0.5rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
  },
  monthChipText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.6875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  monthMore: {
    marginTop: '0.125rem',
    fontSize: '0.625rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
  },
  // ── List view (day columns of stacked cards) ──────────────────────────────
  gridScroll: {
    overflowX: 'auto',
    paddingBottom: '0.25rem',
  },
  grid: {
    display: 'grid',
    minWidth: '52rem',
    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
    gap: '0.75rem',
  },
  column: {
    display: 'flex',
    minWidth: 0,
    flexDirection: 'column',
    gap: '0.5rem',
  },
  listDayHeader: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    paddingBlock: '0.5rem',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-muted)',
  },
  listDayHeaderToday: {
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent-muted)',
  },
  cardStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  emptyDay: {
    margin: 0,
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'dashed',
    borderColor: 'var(--color-border)',
    paddingBlock: '1.5rem',
    textAlign: 'center',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  card: {
    position: 'relative',
    display: 'flex',
    width: '100%',
    flexDirection: 'column',
    gap: '0.5rem',
    overflow: 'hidden',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':hover': 'var(--color-border-emphasized)',
    },
    backgroundColor: 'var(--color-background-surface)',
    padding: '0.625rem',
    paddingLeft: '0.75rem',
    textAlign: 'left',
    cursor: 'pointer',
    boxShadow: {
      default: 'var(--shadow-low)',
      ':hover': 'var(--shadow-high)',
    },
    transform: {
      default: 'translateY(0)',
      ':hover': 'translateY(-0.125rem)',
    },
    transitionProperty: 'transform, box-shadow, border-color',
    transitionDuration: '150ms',
    outlineStyle: 'none',
  },
  cardCanceled: {
    opacity: 0.7,
  },
  accentRail: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '0.25rem',
  },
  timeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.6875rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
  },
  smallIcon: {
    width: '0.875rem',
    height: '0.875rem',
    flexShrink: 0,
  },
  mono: {
    fontVariantNumeric: 'tabular-nums',
  },
  cardTitle: {
    margin: 0,
    fontSize: '0.875rem',
    fontWeight: 700,
    lineHeight: 1.25,
    color: 'var(--color-text-primary)',
  },
  cardTitleCanceled: {
    textDecorationLine: 'line-through',
  },
  metaCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    fontSize: '0.6875rem',
    color: 'var(--color-text-secondary)',
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    minWidth: 0,
  },
  truncate: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  occWrap: {
    marginTop: '0.125rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  occLabels: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '0.6875rem',
    fontWeight: 600,
  },
  occBooked: {
    color: 'var(--color-text-primary)',
  },
  occRemaining: {
    color: 'var(--color-text-secondary)',
  },
  barTrack: {
    height: '0.375rem',
    overflow: 'hidden',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
  },
  barFill: {
    height: '100%',
    borderRadius: 'var(--radius-full)',
  },
  badgeWrap: {
    alignSelf: 'flex-start',
  },
  selectLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
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
  selectWrap: {
    position: 'relative',
  },
  select: {
    height: '2.25rem',
    appearance: 'none',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: 'var(--color-background-surface)',
    paddingLeft: '0.75rem',
    paddingRight: '2.25rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
    outlineStyle: 'none',
  },
  selectChevron: {
    pointerEvents: 'none',
    position: 'absolute',
    right: '0.75rem',
    top: '50%',
    width: '1rem',
    height: '1rem',
    transform: 'translateY(-50%)',
    color: 'var(--color-text-secondary)',
  },
  emptyCard: {
    display: 'grid',
    placeItems: 'center',
    paddingBlock: '4rem',
    textAlign: 'center',
  },
  emptyInner: {
    display: 'flex',
    maxWidth: '24rem',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
  },
  emptyIcon: {
    display: 'grid',
    height: '3rem',
    width: '3rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    color: 'var(--color-text-secondary)',
  },
  emptyIconSvg: {
    width: '1.5rem',
    height: '1.5rem',
  },
  emptyText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },

  // ── Day agenda ─────────────────────────────────────────────────────────────
  // One day, read top to bottom: a summary hero, then a timeline of rows —
  // clock gutter, rail, card — grouped into morning / afternoon / evening.
  agenda: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  hero: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: '1rem',
    overflow: 'hidden',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    padding: '1.25rem',
  },
  /** Today reads as the live day, not just another date. */
  heroToday: {
    borderColor: 'var(--color-accent)',
    backgroundImage: 'linear-gradient(120deg, var(--color-accent-muted), transparent 60%)',
  },
  heroDates: {
    display: 'flex',
    minWidth: 0,
    flexDirection: 'column',
    gap: '0.375rem',
  },
  heroWeekday: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.75rem',
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--color-text-secondary)',
  },
  heroDate: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.375rem, 3vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    lineHeight: 1.1,
    color: 'var(--color-text-primary)',
  },
  heroStats: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  stat: {
    display: 'flex',
    minWidth: '5rem',
    flexDirection: 'column',
    gap: '0.125rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-body)',
    paddingBlock: '0.5rem',
    paddingInline: '0.75rem',
  },
  statValue: {
    fontSize: '1.125rem',
    fontWeight: 800,
    lineHeight: 1.1,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  statLabel: {
    fontSize: '0.625rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--color-text-secondary)',
  },
  period: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.625rem',
  },
  periodHead: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  periodLabel: {
    fontSize: '0.6875rem',
    fontWeight: 800,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--color-text-secondary)',
  },
  periodRule: {
    height: '1px',
    flex: 1,
    backgroundColor: 'var(--color-border)',
  },
  periodCount: {
    fontSize: '0.6875rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  rows: {
    listStyleType: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: AGENDA_COLUMNS,
    gap: '0.75rem',
    paddingBottom: '0.625rem',
  },
  /** A class that has already finished steps back without disappearing. */
  rowPast: {
    opacity: 0.55,
  },
  rowTime: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '0.125rem',
    paddingTop: '0.6875rem',
  },
  rowStart: {
    fontSize: '0.9375rem',
    fontWeight: 800,
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  rowEnd: {
    fontSize: '0.6875rem',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  rail: {
    position: 'relative',
  },
  /** The thread the dots hang from; the last row of a group doesn't need one. */
  railLine: {
    position: 'absolute',
    top: '1.5rem',
    bottom: '-0.625rem',
    left: '50%',
    width: '1px',
    marginLeft: '-0.5px',
    backgroundColor: 'var(--color-border)',
  },
  railLineLast: {
    display: 'none',
  },
  railDot: {
    position: 'absolute',
    top: '0.8125rem',
    left: '50%',
    width: '0.625rem',
    height: '0.625rem',
    marginLeft: '-0.3125rem',
    borderRadius: 'var(--radius-full)',
    boxShadow: '0 0 0 3px var(--color-background-body)',
  },
  railDotLive: {
    boxShadow: '0 0 0 3px var(--color-background-body), 0 0 0 6px var(--color-accent-muted)',
  },
  agendaCard: {
    position: 'relative',
    display: 'flex',
    width: '100%',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.75rem',
    overflow: 'hidden',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':hover': 'var(--color-border-emphasized)',
    },
    backgroundColor: 'var(--color-background-surface)',
    paddingBlock: '0.75rem',
    paddingLeft: '1rem',
    paddingRight: '0.875rem',
    textAlign: 'left',
    cursor: 'pointer',
    boxShadow: {
      default: 'var(--shadow-low)',
      ':hover': 'var(--shadow-high)',
    },
    transform: {
      default: 'translateX(0)',
      ':hover': 'translateX(0.1875rem)',
    },
    transitionProperty: 'transform, box-shadow, border-color',
    transitionDuration: '150ms',
    outlineStyle: 'none',
  },
  /** The class running right now, ringed so the eye lands on it first. */
  agendaCardLive: {
    borderColor: 'var(--color-accent)',
    boxShadow: {
      default: '0 0 0 1px var(--color-accent), var(--shadow-low)',
      ':hover': '0 0 0 1px var(--color-accent), var(--shadow-high)',
    },
  },
  agendaCardCanceled: {
    opacity: 0.65,
  },
  agendaAccent: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '0.25rem',
  },
  agendaMain: {
    display: 'flex',
    minWidth: 0,
    flex: '1 1 12rem',
    flexDirection: 'column',
    gap: '0.3125rem',
  },
  agendaTitleRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem',
  },
  agendaTitle: {
    margin: 0,
    fontSize: '0.9375rem',
    fontWeight: 700,
    lineHeight: 1.2,
    color: 'var(--color-text-primary)',
  },
  agendaMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.75rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  agendaOcc: {
    display: 'flex',
    width: '7.5rem',
    flex: '0 0 auto',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '0.3125rem',
  },
  agendaOccTop: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.375rem',
  },
  agendaOccCount: {
    fontSize: '0.875rem',
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  agendaOccLabel: {
    fontSize: '0.6875rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
  },
  agendaBar: {
    width: '100%',
    height: '0.3125rem',
    overflow: 'hidden',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
  },
  agendaChevron: {
    width: '1rem',
    height: '1rem',
    flexShrink: 0,
    color: 'var(--color-text-secondary)',
  },
  livePill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3125rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent)',
    backgroundImage: 'var(--brand-fill-image, none)',
    color: 'var(--color-on-accent)',
    paddingBlock: '0.1875rem',
    paddingInline: '0.4375rem',
    fontSize: '0.625rem',
    fontWeight: 800,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  liveDot: {
    width: '0.375rem',
    height: '0.375rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'currentColor',
    animationName: pulse,
    animationDuration: '1.6s',
    animationIterationCount: 'infinite',
  },
  todayPill: {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent)',
    backgroundImage: 'var(--brand-fill-image, none)',
    color: 'var(--color-on-accent)',
    paddingBlock: '0.125rem',
    paddingInline: '0.5rem',
    fontSize: '0.625rem',
    fontWeight: 800,
    letterSpacing: '0.08em',
  },
  /** Where "now" falls between two classes, drawn like the week grid's line. */
  nowRow: {
    display: 'grid',
    gridTemplateColumns: AGENDA_COLUMNS,
    gap: '0.75rem',
    alignItems: 'center',
    paddingBottom: '0.625rem',
  },
  nowLabel: {
    fontSize: '0.6875rem',
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
    color: 'var(--color-text-accent)',
  },
  nowMark: {
    position: 'relative',
    height: '0.5rem',
  },
  nowMarkDot: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: '0.5rem',
    height: '0.5rem',
    marginTop: '-0.25rem',
    marginLeft: '-0.25rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent)',
    backgroundImage: 'var(--brand-fill-image, none)',
  },
  nowBar: {
    height: '2px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent)',
    backgroundImage: 'var(--brand-fill-image, none)',
    opacity: 0.65,
  },
  addRow: {
    display: 'grid',
    width: '100%',
    gridTemplateColumns: AGENDA_COLUMNS,
    gap: '0.75rem',
    alignItems: 'center',
    borderWidth: 0,
    backgroundColor: 'transparent',
    padding: 0,
    textAlign: 'left',
    cursor: 'pointer',
  },
  addGhost: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'dashed',
    borderColor: {
      default: 'var(--color-border)',
      ':hover': 'var(--color-accent)',
    },
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-accent-muted)',
    },
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-text-accent)',
    },
    paddingBlock: '0.625rem',
    paddingInline: '0.875rem',
    fontSize: '0.8125rem',
    fontWeight: 600,
    transitionProperty: 'color, border-color, background-color',
    transitionDuration: '150ms',
  },
  addIcon: {
    width: '1rem',
    height: '1rem',
    flexShrink: 0,
  },
});

/** A `{ id, name }` filter option (a gym trainer or branch). */
export interface ScheduleOption {
  id: string;
  name: string;
}

/** Occurrences that are not simply "on the calendar" wear a status badge. */
const STATUS_TONES: Partial<Record<ClassInstanceStatus, BadgeTone>> = {
  CANCELED: 'danger',
  COMPLETED: 'neutral',
};

/**
 * The calendar shell: toolbar, filters, and the view the URL asks for.
 *
 * The visible window and the view live in the URL (`?week`, `?view`) so the
 * server refetches exactly what is drawn and the screen stays shareable and
 * back-button friendly; the host page resolves the three anchors from `?week`
 * and hands them in. Everything is computed on the gym's clock (see `week.ts`).
 *
 * The host supplies what differs between screens: the mapped `events`, the
 * `filters` row, the `action` (its add drawer's trigger), `onOpen` (its detail
 * drawer) and `onPickSlot` (click-to-create, null when the staffer may not add).
 * Its drawers go in `children`, rendered after the view.
 */
export function CalendarBoard<E extends CalendarEvent>({
  view,
  weekStart,
  monthAnchor,
  dayAnchor,
  events,
  filtered,
  filters,
  action,
  timeZone,
  openHour,
  closeHour,
  t,
  onOpen,
  onPickSlot,
  children,
}: {
  /** Which surface to render. */
  view: ScheduleView;
  /** The visible week's Monday, `YYYY-MM-DD` (UTC) - drives week + list. */
  weekStart: string;
  /** The visible month's first day, `YYYY-MM-DD` (UTC) - drives month. */
  monthAnchor: string;
  /** The visible day, `YYYY-MM-DD` (UTC) - drives the day agenda. */
  dayAnchor: string;
  /** The window's events, ordered by `startsAt`. */
  events: E[];
  /** Whether a filter is narrowing the window (changes the empty copy). */
  filtered: boolean;
  /** The filter controls, drawn in the row under the toolbar. */
  filters: ReactNode;
  /** The add button (and its drawer), drawn at the toolbar's right end. */
  action: ReactNode;
  /** The gym's IANA zone - day columns and clock labels are read on it. */
  timeZone: string;
  /** The gym's opening window, from Settings > Business hours. */
  openHour: number;
  closeHour: number;
  /** The host screen's translator - the key shape is shared, the words are its own. */
  t: T;
  onOpen: (event: E) => void;
  /** Click-to-create: null when the staffer can't add. */
  onPickSlot: ((dayIso: string, startTime: string) => void) | null;
  children?: ReactNode;
}) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const monday = useMemo(() => new Date(`${weekStart}T00:00:00.000Z`), [weekStart]);
  const monthFirst = useMemo(() => new Date(`${monthAnchor}T00:00:00.000Z`), [monthAnchor]);
  const dayDate = useMemo(() => new Date(`${dayAnchor}T00:00:00.000Z`), [dayAnchor]);
  const days = useMemo(() => weekDays(monday), [monday]);
  const monthDays = useMemo(() => monthGridDays(monthFirst), [monthFirst]);

  // Bucket each event under the day it falls on **at the gym**; the API returns
  // them ordered by `startsAt`, so each bucket stays chronological without
  // re-sorting. Slicing the ISO string instead would file an event held just
  // after local midnight under the previous day.
  const byDay = useMemo(() => {
    const map = new Map<string, E[]>();
    for (const event of events) {
      const key = zonedIsoDate(new Date(event.startsAt), timeZone);
      const bucket = map.get(key);
      if (bucket) bucket.push(event);
      else map.set(key, [event]);
    }
    return map;
  }, [events, timeZone]);

  const todayKey = zonedIsoDate(new Date(), timeZone);

  /** Push a new URL with a batch of params set (or removed when null/empty). */
  const setParams = useCallback(
    (entries: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(entries)) {
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const setView = useCallback(
    (next: ScheduleView) => setParams({ view: next === 'week' ? null : next }),
    [setParams],
  );

  // Prev/next steps by whatever the visible view is a window on: a month, a day,
  // else a week. All three read the same `?week=` anchor, so the date the
  // operator is looking at survives a switch between them.
  const goPrev = useCallback(() => {
    if (view === 'month') setParams({ week: toIsoDate(addMonths(monthFirst, -1)) });
    else if (view === 'day') setParams({ week: toIsoDate(addDays(dayDate, -1)) });
    else setParams({ week: toIsoDate(addWeeks(monday, -1)) });
  }, [view, monthFirst, dayDate, monday, setParams]);
  const goNext = useCallback(() => {
    if (view === 'month') setParams({ week: toIsoDate(addMonths(monthFirst, 1)) });
    else if (view === 'day') setParams({ week: toIsoDate(addDays(dayDate, 1)) });
    else setParams({ week: toIsoDate(addWeeks(monday, 1)) });
  }, [view, monthFirst, dayDate, monday, setParams]);
  // "Today" is the day agenda, always re-anchored on the gym's own today - from
  // any view, on any date, it is the one control that answers "what is on now".
  const goToday = useCallback(
    () => setParams({ view: 'day', week: zonedIsoDate(new Date(), timeZone) }),
    [setParams, timeZone],
  );

  const rangeLabel =
    view === 'month'
      ? formatMonth(monthFirst, locale)
      : view === 'day'
        ? formatDay(dayDate, locale)
        : formatRange(days[0]!, days[days.length - 1]!, locale);
  const isCalendar = view === 'week' || view === 'month';
  const dayKey = toIsoDate(dayDate);

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.toolbar)}>
        <div {...stylex.props(styles.navGroup)}>
          <div {...stylex.props(styles.navBox)}>
            <button
              type="button"
              aria-label={t('toolbar.prev')}
              onClick={goPrev}
              {...stylex.props(styles.navBtn)}
            >
              <Icon name="chevronLeft" {...stylex.props(styles.navBtnIcon)} />
            </button>
            <button
              type="button"
              aria-label={t('toolbar.next')}
              onClick={goNext}
              {...stylex.props(styles.navBtn)}
            >
              <Icon name="chevronRight" {...stylex.props(styles.navBtnIcon)} />
            </button>
          </div>
          <p {...stylex.props(styles.rangeLabel)}>{rangeLabel}</p>
        </div>

        <div {...stylex.props(styles.rightGroup)}>
          {/* Today · Week · Month */}
          <div {...stylex.props(styles.seg)} role="group" aria-label={t('toolbar.range')}>
            <SegButton active={view === 'day'} label={t('toolbar.today')} onClick={goToday} />
            <SegButton
              active={view === 'week'}
              label={t('toolbar.week')}
              onClick={() => setView('week')}
            />
            <SegButton
              active={view === 'month'}
              label={t('toolbar.month')}
              onClick={() => setView('month')}
            />
          </div>

          {/*
            Calendar · List - how the *week* is drawn. The day agenda has only
            the one presentation, so rather than leave both halves unpressed the
            control steps aside while it is showing.
          */}
          {view === 'day' ? null : (
            <div {...stylex.props(styles.seg)} role="group" aria-label={t('toolbar.mode')}>
              <SegButton
                active={isCalendar}
                label={t('toolbar.calendar')}
                icon="calendar"
                onClick={() => setView('week')}
              />
              <SegButton
                active={view === 'list'}
                label={t('toolbar.list')}
                onClick={() => setView('list')}
              />
            </div>
          )}

          {action}
        </div>
      </div>

      <div aria-label={t('filters.aria')} {...stylex.props(styles.filterGroup)} role="group">
        {filters}
      </div>

      {view === 'day' ? (
        <DayAgenda
          day={dayDate}
          isToday={dayKey === todayKey}
          instances={byDay.get(dayKey) ?? []}
          filtered={filtered}
          locale={locale}
          timeZone={timeZone}
          openHour={openHour}
          t={t}
          onOpen={onOpen}
          onPickSlot={onPickSlot}
        />
      ) : view === 'week' ? (
        <WeekGrid
          days={days}
          byDay={byDay}
          todayKey={todayKey}
          locale={locale}
          timeZone={timeZone}
          openHour={openHour}
          closeHour={closeHour}
          t={t}
          onOpen={onOpen}
          onPickSlot={onPickSlot}
        />
      ) : view === 'month' ? (
        <MonthGrid
          days={monthDays}
          anchorMonth={monthFirst.getUTCMonth()}
          byDay={byDay}
          todayKey={todayKey}
          locale={locale}
          timeZone={timeZone}
          t={t}
          onOpen={onOpen}
        />
      ) : events.length === 0 ? (
        <EmptyWeek t={t} filtered={filtered} />
      ) : (
        <div {...stylex.props(styles.gridScroll)}>
          <div role="grid" aria-label={t('week.gridAria')} {...stylex.props(styles.grid)}>
            {days.map((day) => {
              const key = toIsoDate(day);
              return (
                <ListDayColumn
                  key={key}
                  day={day}
                  isToday={key === todayKey}
                  instances={byDay.get(key) ?? []}
                  locale={locale}
                  timeZone={timeZone}
                  t={t}
                  onOpen={onOpen}
                />
              );
            })}
          </div>
        </div>
      )}

      {children}
    </div>
  );
}

/** A single segmented-control button (Week / Month / Calendar / List). */
function SegButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon?: 'calendar';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      {...stylex.props(styles.segBtn, active && styles.segBtnActive)}
    >
      {icon ? <Icon name={icon} sw={2} {...stylex.props(styles.segIcon)} /> : null}
      {label}
    </button>
  );
}

// ── Day agenda ────────────────────────────────────────────────────────────────
// "Today" used to only re-anchor the week, which from the current week did
// nothing at all. It is now a surface of its own: one day read top to bottom as
// a timeline — the shape a front desk actually works from — with the classes
// that have finished stepped back, the one running right now ringed, and a line
// where the clock has got to.

/** Where a class sits relative to now: what dims it, rings it, or leaves it be. */
type RowState = 'past' | 'live' | 'upcoming';

/**
 * The stretches a gym day reads in, as the exclusive end of each on the gym's
 * clock. Grouping by them gives the timeline its headings without inventing a
 * shift model the gym hasn't configured.
 */
const PERIODS = [
  { key: 'morning', endMin: 12 * 60 },
  { key: 'afternoon', endMin: 17 * 60 },
  { key: 'evening', endMin: 24 * 60 },
] as const;

/**
 * The current instant, resolved after mount and re-read each minute. Rendering
 * it server-side would bake the build's clock into the markup and mismatch on
 * hydration, so it is null on first paint — every row then reads as "upcoming"
 * until the effect lands, which is the state the server rendered.
 */
function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Whether `instance` has finished, is running, or is still to come at `now`. */
function rowState(instance: CalendarEvent, now: Date | null): RowState {
  if (now === null) return 'upcoming';
  const at = now.getTime();
  if (at >= new Date(instance.endsAt).getTime()) return 'past';
  return at >= new Date(instance.startsAt).getTime() ? 'live' : 'upcoming';
}

/** One day as a timeline: a summary hero over morning / afternoon / evening rows. */
function DayAgenda<E extends CalendarEvent>({
  day,
  isToday,
  instances,
  filtered,
  locale,
  timeZone,
  openHour,
  t,
  onOpen,
  onPickSlot,
}: {
  day: Date;
  isToday: boolean;
  instances: E[];
  /** Whether a trainer/location filter is narrowing the day (changes the empty copy). */
  filtered: boolean;
  locale: string;
  timeZone: string;
  /** The gym's opening hour — where a first class on an empty day is seeded. */
  openHour: number;
  t: T;
  onOpen: (instance: E) => void;
  /** Click-to-create: null when the staffer can't add classes. */
  onPickSlot: ((dayIso: string, startTime: string) => void) | null;
}) {
  const now = useNow();
  const dayIso = toIsoDate(day);

  // A canceled class holds no seats, so it counts as a class on the day but not
  // towards how full the day is.
  // An event with no seats (a PT session) counts as an event on the day but
  // has nothing to add to how full the day is.
  const totals = useMemo(() => {
    let booked = 0;
    let capacity = 0;
    let canceled = 0;
    let seated = 0;
    for (const instance of instances) {
      if (instance.status === 'CANCELED') {
        canceled += 1;
        continue;
      }
      if (instance.capacity === null || instance.bookedCount === null) continue;
      seated += 1;
      booked += instance.bookedCount;
      capacity += instance.capacity;
    }
    return { booked, capacity, canceled, seated };
  }, [instances]);

  // The API returns the day already ordered by `startsAt`, so each bucket keeps
  // its chronology for free. Empty stretches are dropped rather than drawn.
  const groups = useMemo(
    () =>
      PERIODS.map((period, index) => {
        const fromMin = index === 0 ? 0 : PERIODS[index - 1]!.endMin;
        return {
          key: period.key,
          items: instances.filter((instance) => {
            const minute = zonedMinutesOfDay(new Date(instance.startsAt), timeZone);
            return minute >= fromMin && minute < period.endMin;
          }),
        };
      }).filter((group) => group.items.length > 0),
    [instances, timeZone],
  );

  // Where the clock has got to: before the next class still to come, or after
  // the last row once every class of the day has ended.
  const nowClock = isToday && now !== null ? zonedClock(now, timeZone) : null;
  const nextId =
    now === null
      ? null
      : (instances.find((instance) => new Date(instance.startsAt).getTime() > now.getTime())?.id ??
        null);
  const nowAtEnd =
    nowClock !== null &&
    nextId === null &&
    instances.length > 0 &&
    instances.every((instance) => new Date(instance.endsAt).getTime() <= now!.getTime());

  // A new class is seeded where the day left off — after the last class, or at
  // opening time on a day with none.
  const seedTime =
    instances.length === 0
      ? `${String(openHour).padStart(2, '0')}:00`
      : zonedClock(new Date(instances[instances.length - 1]!.endsAt), timeZone);

  return (
    <section aria-label={t('day.agendaAria')} {...stylex.props(styles.agenda)}>
      <header {...stylex.props(styles.hero, isToday && styles.heroToday)}>
        <div {...stylex.props(styles.heroDates)}>
          <span {...stylex.props(styles.heroWeekday)}>
            {weekdayLong(day, locale)}
            {isToday ? <span {...stylex.props(styles.todayPill)}>{t('day.today')}</span> : null}
          </span>
          <p {...stylex.props(styles.heroDate)}>{longDate(day, locale)}</p>
        </div>
        <div {...stylex.props(styles.heroStats)}>
          <Stat value={String(instances.length)} label={t('day.classes')} />
          {/* "0/0 booked" on a day with nothing on it - or with no seats to book - is noise, not a figure. */}
          {totals.seated > 0 ? (
            <Stat value={`${totals.booked}/${totals.capacity}`} label={t('day.booked')} />
          ) : null}
          {totals.canceled > 0 ? (
            <Stat value={String(totals.canceled)} label={t('day.canceled')} />
          ) : null}
        </div>
      </header>

      {instances.length === 0 ? (
        <Card padding="none" xstyle={styles.emptyCard}>
          <div {...stylex.props(styles.emptyInner)}>
            <span {...stylex.props(styles.emptyIcon)}>
              <Icon name="calendar" {...stylex.props(styles.emptyIconSvg)} />
            </span>
            <p {...stylex.props(styles.emptyText)}>
              {filtered ? t('day.emptyFiltered') : t('day.empty')}
            </p>
          </div>
        </Card>
      ) : (
        groups.map((group, groupIndex) => (
          <div key={group.key} {...stylex.props(styles.period)}>
            <div {...stylex.props(styles.periodHead)}>
              <span {...stylex.props(styles.periodLabel)}>{t(`day.${group.key}`)}</span>
              <span aria-hidden {...stylex.props(styles.periodRule)} />
              <span {...stylex.props(styles.periodCount)}>{group.items.length}</span>
            </div>
            <ol {...stylex.props(styles.rows)}>
              {group.items.map((instance, index) => (
                <Fragment key={instance.id}>
                  {nowClock !== null && instance.id === nextId ? (
                    <NowRow clock={nowClock} t={t} />
                  ) : null}
                  <AgendaRow
                    instance={instance}
                    state={rowState(instance, now)}
                    isLast={index === group.items.length - 1}
                    locale={locale}
                    timeZone={timeZone}
                    t={t}
                    onOpen={onOpen}
                  />
                </Fragment>
              ))}
              {nowAtEnd && groupIndex === groups.length - 1 ? (
                <NowRow clock={nowClock} t={t} />
              ) : null}
            </ol>
          </div>
        ))
      )}

      {onPickSlot ? (
        <button
          type="button"
          onClick={() => onPickSlot(dayIso, seedTime)}
          {...stylex.props(styles.addRow)}
        >
          <span />
          <span />
          <span {...stylex.props(styles.addGhost)}>
            <Icon name="plus" sw={2} {...stylex.props(styles.addIcon)} />
            {t('day.add')}
          </span>
        </button>
      ) : null}
    </section>
  );
}

/** One figure in the day hero (classes on the day, seats booked, cancellations). */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div {...stylex.props(styles.stat)}>
      <span {...stylex.props(styles.statValue)}>{value}</span>
      <span {...stylex.props(styles.statLabel)}>{label}</span>
    </div>
  );
}

/** The clock's position in the day, drawn between two rows. */
function NowRow({ clock, t }: { clock: string; t: T }) {
  return (
    <li aria-label={t('grid.now')} {...stylex.props(styles.nowRow)}>
      <span {...stylex.props(styles.nowLabel)}>{clock}</span>
      <span aria-hidden {...stylex.props(styles.nowMark)}>
        <span {...stylex.props(styles.nowMarkDot)} />
      </span>
      <span aria-hidden {...stylex.props(styles.nowBar)} />
    </li>
  );
}

/** One class on the day timeline: clock gutter, rail dot, and the class card. */
function AgendaRow<E extends CalendarEvent>({
  instance,
  state,
  isLast,
  locale,
  timeZone,
  t,
  onOpen,
}: {
  instance: E;
  state: RowState;
  /** The last row of its group, whose rail thread has nothing to reach. */
  isLast: boolean;
  locale: string;
  timeZone: string;
  t: T;
  onOpen: (instance: E) => void;
}) {
  const canceled = instance.status === 'CANCELED';
  // A canceled class is never "on now", however the clock reads.
  const live = state === 'live' && !canceled;
  const start = formatTime(instance.startsAt, locale, timeZone);
  const end = formatTime(instance.endsAt, locale, timeZone);
  const occupancy = occupancyOf(instance);
  const statusTone = STATUS_TONES[instance.status];
  const where = [instance.locationName, instance.room].filter(Boolean).join(' · ');

  return (
    <li {...stylex.props(styles.row, state === 'past' && styles.rowPast)}>
      <div {...stylex.props(styles.rowTime)}>
        <span {...stylex.props(styles.rowStart)}>{start}</span>
        <span {...stylex.props(styles.rowEnd)}>{end}</span>
      </div>

      <div aria-hidden {...stylex.props(styles.rail)}>
        <span {...stylex.props(styles.railLine, isLast && styles.railLineLast)} />
        <span
          {...stylex.props(styles.railDot, live && styles.railDotLive)}
          style={{
            backgroundColor: state === 'past' ? 'var(--color-border-emphasized)' : instance.color,
          }}
        />
      </div>

      <button
        type="button"
        onClick={() => onOpen(instance)}
        aria-label={t('card.viewAria', { title: instance.title, time: start })}
        {...stylex.props(
          styles.agendaCard,
          live && styles.agendaCardLive,
          canceled && styles.agendaCardCanceled,
        )}
      >
        <span
          aria-hidden
          {...stylex.props(styles.agendaAccent)}
          style={{ backgroundColor: instance.color }}
        />

        <div {...stylex.props(styles.agendaMain)}>
          <div {...stylex.props(styles.agendaTitleRow)}>
            <p {...stylex.props(styles.agendaTitle, canceled && styles.cardTitleCanceled)}>
              {instance.title}
            </p>
            {live ? (
              <span {...stylex.props(styles.livePill)}>
                <span aria-hidden {...stylex.props(styles.liveDot)} />
                {t('grid.now')}
              </span>
            ) : null}
            {statusTone ? <Badge tone={statusTone} label={t(`status.${instance.status}`)} /> : null}
          </div>
          <div {...stylex.props(styles.agendaMeta)}>
            <span {...stylex.props(styles.metaRow)}>
              <Icon name="clock" sw={2} {...stylex.props(styles.smallIcon)} />
              {t('day.minutes', { count: durationMinutes(instance) })}
            </span>
            {instance.trainerName ? (
              <span {...stylex.props(styles.metaRow, styles.truncate)}>
                <Icon name="user" sw={2} {...stylex.props(styles.smallIcon)} />
                <span {...stylex.props(styles.truncate)}>{instance.trainerName}</span>
              </span>
            ) : null}
            {instance.subtitle ? (
              <span {...stylex.props(styles.metaRow, styles.truncate)}>
                <Icon name="users" sw={2} {...stylex.props(styles.smallIcon)} />
                <span {...stylex.props(styles.truncate)}>{instance.subtitle}</span>
              </span>
            ) : null}
            {where ? (
              <span {...stylex.props(styles.metaRow, styles.truncate)}>
                <Icon name="pin" sw={2} {...stylex.props(styles.smallIcon)} />
                <span {...stylex.props(styles.truncate)}>{where}</span>
              </span>
            ) : null}
          </div>
        </div>

        {occupancy ? (
          <div {...stylex.props(styles.agendaOcc)}>
            <div {...stylex.props(styles.agendaOccTop)}>
              <span {...stylex.props(styles.agendaOccCount)}>
                {occupancy.booked}/{occupancy.capacity}
              </span>
              <span {...stylex.props(styles.agendaOccLabel)}>
                {occupancy.remaining === 0
                  ? t('card.full')
                  : t('card.remaining', { remaining: occupancy.remaining })}
              </span>
            </div>
            <div {...stylex.props(styles.agendaBar)}>
              <div
                {...stylex.props(styles.barFill)}
                style={{ width: `${occupancy.pct}%`, backgroundColor: occupancy.barColor }}
              />
            </div>
          </div>
        ) : null}

        <Icon name="chevronRight" {...stylex.props(styles.agendaChevron)} />
      </button>
    </li>
  );
}

/** How long a class runs, in whole minutes (never negative across midnight). */
function durationMinutes(instance: CalendarEvent): number {
  const span = new Date(instance.endsAt).getTime() - new Date(instance.startsAt).getTime();
  return Math.max(0, Math.round(span / 60_000));
}

// ── Month grid ────────────────────────────────────────────────────────────────

const MONTH_CHIP_LIMIT = 3;

/** The month overview: a Monday-first 7-column grid of day cells with class chips. */
function MonthGrid<E extends CalendarEvent>({
  days,
  anchorMonth,
  byDay,
  todayKey,
  locale,
  timeZone,
  t,
  onOpen,
}: {
  days: Date[];
  anchorMonth: number;
  byDay: Map<string, E[]>;
  todayKey: string;
  locale: string;
  timeZone: string;
  t: T;
  onOpen: (instance: E) => void;
}) {
  return (
    <div {...stylex.props(styles.monthWrap)}>
      <div {...stylex.props(styles.monthWeekdays)}>
        {days.slice(0, 7).map((day) => (
          <span key={toIsoDate(day)} {...stylex.props(styles.monthWeekday)}>
            {weekdayShort(day, locale)}
          </span>
        ))}
      </div>
      <div role="grid" aria-label={t('week.gridAria')} {...stylex.props(styles.monthGrid)}>
        {days.map((day) => {
          const key = toIsoDate(day);
          const dayInstances = byDay.get(key) ?? [];
          const isToday = key === todayKey;
          const isOutside = day.getUTCMonth() !== anchorMonth;
          const shown = dayInstances.slice(0, MONTH_CHIP_LIMIT);
          const overflow = dayInstances.length - shown.length;
          return (
            <div
              key={key}
              role="gridcell"
              {...stylex.props(
                styles.monthCell,
                isOutside && styles.monthCellOutside,
                isToday && styles.monthCellToday,
              )}
            >
              <span
                {...stylex.props(
                  styles.monthDateNum,
                  isOutside && styles.monthDateNumOutside,
                  isToday && styles.monthDateNumToday,
                )}
              >
                {day.getUTCDate()}
              </span>
              {shown.map((instance) => (
                <button
                  key={instance.id}
                  type="button"
                  onClick={() => onOpen(instance)}
                  aria-label={t('card.viewAria', {
                    title: instance.title,
                    time: formatTime(instance.startsAt, locale, timeZone),
                  })}
                  {...stylex.props(styles.monthChip)}
                >
                  <span
                    aria-hidden
                    {...stylex.props(styles.monthChipDot)}
                    style={{ backgroundColor: instance.color }}
                  />
                  <span {...stylex.props(styles.monthChipText)}>
                    {formatTime(instance.startsAt, locale, timeZone)} {instance.title}
                  </span>
                </button>
              ))}
              {overflow > 0 ? (
                <span {...stylex.props(styles.monthMore)}>
                  {t('month.more', { count: overflow })}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── List view (unchanged day-column cards) ───────────────────────────────────

/** One day's column: a weekday header over its stacked class cards. */
function ListDayColumn<E extends CalendarEvent>({
  day,
  isToday,
  instances,
  locale,
  timeZone,
  t,
  onOpen,
}: {
  day: Date;
  isToday: boolean;
  instances: E[];
  locale: string;
  timeZone: string;
  t: T;
  onOpen: (instance: E) => void;
}) {
  return (
    <div role="gridcell" {...stylex.props(styles.column)}>
      <div {...stylex.props(styles.listDayHeader, isToday && styles.listDayHeaderToday)}>
        <span {...stylex.props(styles.weekdayLabel)}>{weekdayShort(day, locale)}</span>
        <span {...stylex.props(styles.dayNum, isToday && styles.dayNumToday)}>
          {day.getUTCDate()}
        </span>
      </div>

      <div {...stylex.props(styles.cardStack)}>
        {instances.length === 0 ? (
          <p {...stylex.props(styles.emptyDay)}>{t('empty.day')}</p>
        ) : (
          instances.map((instance) => (
            <EventCard
              key={instance.id}
              instance={instance}
              locale={locale}
              timeZone={timeZone}
              t={t}
              onOpen={onOpen}
            />
          ))
        )}
      </div>
    </div>
  );
}

/** One event block in the list view: time, title, trainer/branch, occupancy, status. */
function EventCard<E extends CalendarEvent>({
  instance,
  locale,
  timeZone,
  t,
  onOpen,
}: {
  instance: E;
  locale: string;
  timeZone: string;
  t: T;
  onOpen: (instance: E) => void;
}) {
  const occupancy = occupancyOf(instance);
  const statusTone = STATUS_TONES[instance.status];
  const canceled = instance.status === 'CANCELED';
  const start = formatTime(instance.startsAt, locale, timeZone);
  const end = formatTime(instance.endsAt, locale, timeZone);

  return (
    <button
      type="button"
      onClick={() => onOpen(instance)}
      aria-label={t('card.viewAria', { title: instance.title, time: start })}
      title={`${start}–${end} · ${instance.title}`}
      {...stylex.props(styles.card, canceled && styles.cardCanceled)}
    >
      <span
        aria-hidden
        {...stylex.props(styles.accentRail)}
        style={{ backgroundColor: instance.color }}
      />

      <div {...stylex.props(styles.timeRow)}>
        <Icon name="clock" sw={2} {...stylex.props(styles.smallIcon)} />
        <span {...stylex.props(styles.mono)}>
          {start}–{end}
        </span>
      </div>

      <p {...stylex.props(styles.cardTitle, canceled && styles.cardTitleCanceled)}>
        {instance.title}
      </p>

      <div {...stylex.props(styles.metaCol)}>
        {instance.trainerName ? (
          <span {...stylex.props(styles.metaRow, styles.truncate)}>
            <Icon name="user" sw={2} {...stylex.props(styles.smallIcon)} />
            <span {...stylex.props(styles.truncate)}>{instance.trainerName}</span>
          </span>
        ) : null}
        {instance.subtitle ? (
          <span {...stylex.props(styles.metaRow, styles.truncate)}>
            <Icon name="users" sw={2} {...stylex.props(styles.smallIcon)} />
            <span {...stylex.props(styles.truncate)}>{instance.subtitle}</span>
          </span>
        ) : null}
        {instance.locationName || instance.room ? (
          <span {...stylex.props(styles.metaRow, styles.truncate)}>
            <Icon name="pin" sw={2} {...stylex.props(styles.smallIcon)} />
            <span {...stylex.props(styles.truncate)}>
              {[instance.locationName, instance.room].filter(Boolean).join(' · ')}
            </span>
          </span>
        ) : null}
      </div>

      {occupancy ? (
        <div {...stylex.props(styles.occWrap)}>
          <div {...stylex.props(styles.occLabels)}>
            <span {...stylex.props(styles.occBooked)}>
              {t('card.spots', { booked: occupancy.booked, cap: occupancy.capacity })}
            </span>
            <span {...stylex.props(styles.occRemaining)}>
              {occupancy.remaining === 0
                ? t('card.full')
                : t('card.remaining', { remaining: occupancy.remaining })}
            </span>
          </div>
          <div {...stylex.props(styles.barTrack)}>
            <div
              {...stylex.props(styles.barFill)}
              style={{ width: `${occupancy.pct}%`, backgroundColor: occupancy.barColor }}
            />
          </div>
        </div>
      ) : null}

      {statusTone ? (
        <span {...stylex.props(styles.badgeWrap)}>
          <Badge tone={statusTone} label={t(`status.${instance.status}`)} />
        </span>
      ) : null}
    </button>
  );
}

/** A labelled `{ id, name }` filter select for the filter row (trainer / location). */
export function FilterSelect({
  label,
  value,
  allLabel,
  options,
  onChange,
}: {
  label: string;
  value: string;
  allLabel: string;
  options: ScheduleOption[];
  onChange: (value: string) => void;
}) {
  return (
    <label {...stylex.props(styles.selectLabel)}>
      <span {...stylex.props(styles.srOnly)}>{label}</span>
      <div {...stylex.props(styles.selectWrap)}>
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          {...stylex.props(styles.select)}
        >
          <option value="">{allLabel}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <Icon name="chevronDown" {...stylex.props(styles.selectChevron)} />
      </div>
    </label>
  );
}

/** The empty state — no occurrences in the visible week (optionally filtered). */
function EmptyWeek({ t, filtered }: { t: T; filtered: boolean }) {
  return (
    <Card padding="none" xstyle={styles.emptyCard}>
      <div {...stylex.props(styles.emptyInner)}>
        <span {...stylex.props(styles.emptyIcon)}>
          <Icon name="calendar" {...stylex.props(styles.emptyIconSvg)} />
        </span>
        <p {...stylex.props(styles.emptyText)}>
          {filtered ? t('empty.filtered') : t('empty.week')}
        </p>
      </div>
    </Card>
  );
}

/** Localised weekday abbreviation for a UTC day anchor (e.g. "Mon"). */
function weekdayShort(day: Date, locale: string): string {
  return createDateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(day);
}

/** Localised weekday in full, for the day agenda's hero (e.g. "Saturday"). */
function weekdayLong(day: Date, locale: string): string {
  return createDateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(day);
}

/** "15 August 2026" — the day agenda's hero date, in UTC. */
function longDate(day: Date, locale: string): string {
  return createDateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(day);
}

/** "Saturday, 15 August 2026" — the toolbar's label while the agenda is showing. */
function formatDay(day: Date, locale: string): string {
  return createDateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(day);
}

/**
 * `HH:MM` for an ISO instant, on the gym's clock — the same clock the grid rows
 * are labelled with, so a block can never print a time that disagrees with the
 * row it sits on. (It used to: `createDateTimeFormat` reads every field in UTC by
 * design, so a Tbilisi gym's 12:00 class was drawn on the 12:00 row wearing an
 * "08:00" label.) `locale` no longer takes part — `HH:MM` is the same 24-hour
 * form in both catalogues and matches the gutter's hour labels exactly.
 */
function formatTime(iso: string, _locale: string, timeZone: string): string {
  return zonedClock(new Date(iso), timeZone);
}

/**
 * The visible week as a span, both anchors in UTC.
 *
 * Both ends are formatted whole — "Aug 10 – Aug 16, 2026" / "10 აგვ – 16 აგვ.
 * 2026". Dropping the repeated month from the closing date looks tidier in
 * English but asks the formatter for a bare `{ day, year }`, which is not a date
 * pattern CLDR has: it answers "2026 (day: 16)", and this header rendered the
 * two numbers glued together as "162026". A month named twice is a small price
 * for a label that is right in both locales.
 */
function formatRange(start: Date, end: Date, locale: string): string {
  const dayMonth = createDateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const withYear = createDateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `${dayMonth.format(start)} – ${withYear.format(end)}`;
}

/** "July 2026" for the month header, in UTC. */
function formatMonth(anchor: Date, locale: string): string {
  return createDateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(anchor);
}
