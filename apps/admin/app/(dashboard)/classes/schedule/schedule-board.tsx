'use client';

import { useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type { AdminClassTypeOption, AdminScheduleInstance, ClassInstanceStatus } from '@fit/types';
import { Badge, Btn, Icon, type Tone } from '@/components/ui';
import { Card } from '@astryxdesign/core/Card';
import { useOccupancyStream } from '@/hooks/use-occupancy-stream';
import { ClassDrawer } from './class-drawer';
import { AddClassDrawer } from '../add-class-drawer';
import type { RelationOption } from '../class-template-form';
import { addMonths, addWeeks, monthGridDays, toIsoDate, weekDays, zonedIsoDate } from './week';
import { createDateTimeFormat } from '@fit/i18n';

type T = ReturnType<typeof useTranslations>;

/** Which calendar surface is showing — the two calendar granularities plus the list. */
export type ScheduleView = 'week' | 'month' | 'list';

// ── Time-grid geometry (week view) ───────────────────────────────────────────
// The week grid draws a fixed 06:00–22:00 day, one row per hour split in half at
// the 30-minute mark. Everything is measured in `rem` off a single hour height so
// the hour labels, the gridlines, and the absolutely-positioned event blocks all
// share one scale.
// NOTE: keep these in sync with the literal `rem` values baked into `styles`
// below (`timeCell` height, `dayCol` height + gridline gradient). StyleX evaluates
// `stylex.create` at build time and can't read these runtime consts, so the style
// object must use literals — 3.5rem/hour, 1.75rem/half, 56rem total.
const HOUR_REM = 3.5;
/**
 * Breathing room above the first hour line and below the last, in rem. The hour
 * labels straddle their gridline, so without the top pad the first is clipped by
 * the sticky header; without the bottom one a class running to midnight sits
 * flush on the container's edge. Kept in sync with the `paddingBlock` on
 * `timeCol` / `dayCol` — `box-sizing: border-box` (Tailwind preflight) means the
 * column's explicit height has to carry both pads on top of the hour rows.
 */
const GRID_PAD_REM = 0.5;
/** Fewest hour rows the grid draws, so a sparse week still reads as a day. */
const MIN_ROWS = 6;
const MIN_EVENT_REM = 1.5;

const styles = stylex.create({
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
  // ── Week time-grid ─────────────────────────────────────────────────────────
  calScroll: {
    overflowX: 'auto',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-body)',
  },
  calGrid: {
    minWidth: '52rem',
    display: 'grid',
    gridTemplateColumns: '4rem repeat(7, minmax(0, 1fr))',
  },
  corner: {
    position: 'sticky',
    top: 0,
    zIndex: 3,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBlock: '0.75rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    backgroundColor: 'var(--color-background-body)',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
  },
  dayHead: {
    position: 'sticky',
    top: 0,
    zIndex: 3,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.125rem',
    paddingBlock: '0.625rem',
    backgroundColor: 'var(--color-background-body)',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
    borderLeftWidth: '1px',
    borderLeftStyle: 'solid',
    borderLeftColor: 'var(--color-border)',
  },
  dayHeadToday: {
    backgroundColor: 'var(--color-accent-muted)',
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
  timeCol: {
    display: 'flex',
    flexDirection: 'column',
    // Matches `dayCol`: the hour labels straddle their gridline (`top: -0.5rem`),
    // so without this the first one is drawn above the body and clipped by the
    // sticky header. Blocks and the gridline gradient are positioned from the
    // padding box too, so the whole grid shifts as one. The matching bottom
    // padding keeps the last row off the container's edge.
    paddingTop: '0.5rem',
    paddingBottom: '0.5rem',
    backgroundColor: 'var(--color-background-body)',
  },
  timeCell: {
    position: 'relative',
    height: '3.5rem',
    paddingRight: '0.5rem',
  },
  timeLabel: {
    position: 'absolute',
    top: '-0.5rem',
    right: '0.5rem',
    fontSize: '0.6875rem',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  dayCol: {
    position: 'relative',
    paddingTop: '0.5rem',
    paddingBottom: '0.5rem',
    borderLeftWidth: '1px',
    borderLeftStyle: 'solid',
    borderLeftColor: 'var(--color-border)',
    // Hour lines (stronger) over half-hour lines (subtle), both transparent-based
    // so they composite over the today tint.
    backgroundImage:
      'repeating-linear-gradient(to bottom, var(--color-border) 0, var(--color-border) 1px, transparent 1px, transparent 3.5rem), repeating-linear-gradient(to bottom, var(--color-border-subtle, rgba(120,120,120,0.12)) 0, var(--color-border-subtle, rgba(120,120,120,0.12)) 1px, transparent 1px, transparent 1.75rem)',
  },
  dayColToday: {
    backgroundColor: 'var(--color-accent-muted)',
  },
  event: {
    position: 'absolute',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.0625rem',
    overflow: 'hidden',
    borderRadius: 'var(--radius-element)',
    borderLeftWidth: '3px',
    borderLeftStyle: 'solid',
    paddingBlock: '0.25rem',
    paddingInline: '0.375rem',
    backgroundColor: 'var(--color-background-surface)',
    boxShadow: {
      default: 'var(--shadow-low)',
      ':hover': 'var(--shadow-high)',
    },
    textAlign: 'left',
    cursor: 'pointer',
    outlineStyle: 'none',
    transitionProperty: 'box-shadow',
    transitionDuration: '150ms',
  },
  eventCanceled: {
    opacity: 0.6,
  },
  eventTime: {
    fontSize: '0.625rem',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  eventTitle: {
    margin: 0,
    fontSize: '0.75rem',
    fontWeight: 700,
    lineHeight: 1.15,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: 'var(--color-text-primary)',
  },
  eventTitleCanceled: {
    textDecorationLine: 'line-through',
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
});

/** A `{ id, name }` filter option (a gym trainer or branch). */
export interface ScheduleOption {
  id: string;
  name: string;
}

/** Occurrences that are not simply "on the calendar" wear a status badge. */
const STATUS_TONES: Partial<Record<ClassInstanceStatus, Tone>> = {
  CANCELED: 'danger',
  COMPLETED: 'ink',
};

/**
 * The staff schedule (T3.2), now a real calendar. Server-rendered occurrences for
 * the visible window are shown three ways — a **week** time-grid (06:00–22:00,
 * half-hour ruled, events positioned by their clock time), a **month** overview
 * grid, and the original **list** of day columns — chosen by the `?view` param.
 * The toolbar pages the window (a week or a month at a time depending on the
 * view) and filters by trainer / location, all in the URL (`?week`, `?view`,
 * `?trainerId`, `?locationId`) so the server refetches the right window and the
 * view stays shareable and back-button friendly.
 *
 * Everything is computed in UTC (see `week.ts`): occurrences carry a real
 * time-of-day (their template's `validFrom` hour) but the console has no
 * gym-timezone plumbing, so bucketing and time labels stay in UTC to match the
 * data and avoid hydration drift.
 */
export function ScheduleBoard({
  view,
  weekStart,
  monthAnchor,
  instances,
  trainers,
  locations,
  trainerId,
  locationId,
  canWrite,
  addClass,
  timeZone,
  openHour,
  closeHour,
}: {
  /** Which surface to render. */
  view: ScheduleView;
  /** The visible week's Monday, `YYYY-MM-DD` (UTC) — drives week + list. */
  weekStart: string;
  /** The visible month's first day, `YYYY-MM-DD` (UTC) — drives month. */
  monthAnchor: string;
  instances: AdminScheduleInstance[];
  trainers: ScheduleOption[];
  locations: ScheduleOption[];
  trainerId: string;
  locationId: string;
  /** Whether the staff session holds `ClassWrite` (gates the drawer's cancel). */
  canWrite: boolean;
  /** Class-relation options for the "Add Class" drawer; null when the staffer can't write. */
  /** The gym's IANA zone — day columns and clock labels are read on it. */
  timeZone: string;
  /** The gym's opening window, from Settings → Business hours. */
  openHour: number;
  closeHour: number;
  addClass: {
    trainers: RelationOption[];
    locations: RelationOption[];
    plans: RelationOption[];
    classTypes: AdminClassTypeOption[];
  } | null;
}) {
  const t = useTranslations('admin.schedule');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Live occupancy (T8.10): refresh the grid as members book / cancel and the
  // desk promotes, pushed over SSE — replacing the schedule's need to poll.
  useOccupancyStream();

  // The occurrence whose detail drawer is open (null when closed).
  const [selected, setSelected] = useState<AdminScheduleInstance | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openInstance = useCallback((instance: AdminScheduleInstance) => {
    setSelected(instance);
    setDrawerOpen(true);
  }, []);

  const monday = useMemo(() => new Date(`${weekStart}T00:00:00.000Z`), [weekStart]);
  const monthFirst = useMemo(() => new Date(`${monthAnchor}T00:00:00.000Z`), [monthAnchor]);
  const days = useMemo(() => weekDays(monday), [monday]);
  const monthDays = useMemo(() => monthGridDays(monthFirst), [monthFirst]);

  // Bucket each occurrence under the day it falls on **at the gym**; the API
  // returns them ordered by `startsAt`, so each bucket stays chronological
  // without re-sorting. Slicing the ISO string instead would file a class held
  // just after local midnight under the previous day.
  const byDay = useMemo(() => {
    const map = new Map<string, AdminScheduleInstance[]>();
    for (const instance of instances) {
      const key = zonedIsoDate(new Date(instance.startsAt), timeZone);
      const bucket = map.get(key);
      if (bucket) bucket.push(instance);
      else map.set(key, [instance]);
    }
    return map;
  }, [instances, timeZone]);

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

  // Prev/next steps by month in month view, else by week. "Today" re-anchors both.
  const goPrev = useCallback(() => {
    if (view === 'month') setParams({ week: toIsoDate(addMonths(monthFirst, -1)) });
    else setParams({ week: toIsoDate(addWeeks(monday, -1)) });
  }, [view, monthFirst, monday, setParams]);
  const goNext = useCallback(() => {
    if (view === 'month') setParams({ week: toIsoDate(addMonths(monthFirst, 1)) });
    else setParams({ week: toIsoDate(addWeeks(monday, 1)) });
  }, [view, monthFirst, monday, setParams]);
  const goToday = useCallback(
    () => setParams({ week: zonedIsoDate(new Date(), timeZone) }),
    [setParams, timeZone],
  );

  const rangeLabel =
    view === 'month'
      ? formatMonth(monthFirst, locale)
      : formatRange(days[0]!, days[days.length - 1]!, locale);
  const hasFilters = trainerId !== '' || locationId !== '';
  const isCalendar = view === 'week' || view === 'month';

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
            <button type="button" onClick={goToday} {...stylex.props(styles.segBtn)}>
              {t('toolbar.today')}
            </button>
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

          {/* Calendar · List */}
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

          {addClass ? (
            <AddClassDrawer
              trainers={addClass.trainers}
              locations={addClass.locations}
              plans={addClass.plans}
              classTypes={addClass.classTypes}
              triggerLabel={t('toolbar.addClass')}
            />
          ) : null}
        </div>
      </div>

      {/* Filters (trainer / location) — kept from the original board. */}
      <div aria-label={t('filters.aria')} {...stylex.props(styles.filterGroup)} role="group">
        <FilterSelect
          label={t('filters.trainer')}
          value={trainerId}
          allLabel={t('filters.allTrainers')}
          options={trainers}
          onChange={(value) => setParams({ trainerId: value })}
        />
        <FilterSelect
          label={t('filters.location')}
          value={locationId}
          allLabel={t('filters.allLocations')}
          options={locations}
          onChange={(value) => setParams({ locationId: value })}
        />
        {hasFilters ? (
          <Btn
            v="ghost"
            size="sm"
            icon="x"
            onClick={() => setParams({ trainerId: null, locationId: null })}
          >
            {t('filters.clear')}
          </Btn>
        ) : null}
      </div>

      {view === 'week' ? (
        <WeekGrid
          days={days}
          byDay={byDay}
          todayKey={todayKey}
          locale={locale}
          timeZone={timeZone}
          openHour={openHour}
          closeHour={closeHour}
          t={t}
          onOpen={openInstance}
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
          onOpen={openInstance}
        />
      ) : instances.length === 0 ? (
        <EmptyWeek t={t} filtered={hasFilters} />
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
                  onOpen={openInstance}
                />
              );
            })}
          </div>
        </div>
      )}

      <ClassDrawer
        instance={selected}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        canWrite={canWrite}
        locale={locale}
        timeZone={timeZone}
      />
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

// ── Week time-grid ────────────────────────────────────────────────────────────

/** A laid-out event: its instance plus rem-position and overlap lane geometry. */
interface PlacedEvent {
  instance: AdminScheduleInstance;
  topRem: number;
  heightRem: number;
  leftPct: number;
  widthPct: number;
}

/** Minutes past midnight for an ISO instant, on the gym's clock. */
function zonedMinutes(iso: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const at = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  return at('hour') * 60 + at('minute');
}

/**
 * Widen a tight window to a readable one. Following the data exactly is right
 * when a day is busy, but a week with a single 45-minute session would draw a
 * one-hour-tall "calendar" — accurate and useless. Grow symmetrically around
 * what is booked so the session keeps its context, clamped to a real day.
 */
function atLeast(
  range: { startHour: number; endHour: number },
  minRows: number,
): { startHour: number; endHour: number } {
  const rows = range.endHour - range.startHour;
  if (rows >= minRows) return range;

  const grow = minRows - rows;
  const lifted = Math.max(0, range.startHour - Math.floor(grow / 2));
  // Clamp to a real day, then pull the window back off midnight rather than
  // losing rows to the clamp.
  const endHour = Math.min(24, lifted + minRows);
  return { startHour: Math.max(0, endHour - minRows), endHour };
}

/**
 * The hours the grid needs to draw: the whole hour the first class starts on
 * through the whole hour the last one ends on. A fixed 06:00–22:00 window spent
 * most of its height on rows no gym uses — a day whose classes run 09:00–17:00
 * had a quarter of the grid empty above them.
 *
 * The bounds are widened to whole hours so a 09:50 start still sits under a 09:00
 * label, and an empty week falls back to a plausible day rather than collapsing.
 */
function hourRange(
  instances: AdminScheduleInstance[],
  timeZone: string,
  openHour: number,
  closeHour: number,
): { startHour: number; endHour: number } {
  // The gym's own opening window is the answer; occurrences only ever widen it.
  let earliest = openHour * 60;
  let latest = closeHour * 60;
  for (const instance of instances) {
    const start = zonedMinutes(instance.startsAt, timeZone);
    const rawEnd = zonedMinutes(instance.endsAt, timeZone);
    // An occurrence running past local midnight wraps to a small number; treat it
    // as the end of the day rather than letting it drag the window back to 00:00.
    const end = rawEnd > start ? rawEnd : 24 * 60;
    if (start < earliest) earliest = start;
    if (end > latest) latest = end;
  }

  const startHour = Math.max(0, Math.floor(earliest / 60));
  const endHour = Math.min(24, Math.ceil(latest / 60));
  // Always leave at least one row, however tight the day.
  return atLeast({ startHour, endHour: Math.max(endHour, startHour + 1) }, MIN_ROWS);
}

/**
 * Position one day's occurrences in the `[startHour, endHour)` grid, splitting overlapping
 * events into side-by-side lanes. Times outside the window are clamped so nothing
 * ever disappears (a 05:30 class pins to the top edge, a 23:00 one to the bottom).
 */
function placeEvents(
  instances: AdminScheduleInstance[],
  timeZone: string,
  startHour: number,
  endHour: number,
): PlacedEvent[] {
  const totalMin = (endHour - startHour) * 60;
  const items = instances
    .map((instance) => {
      const start = zonedMinutes(instance.startsAt, timeZone) - startHour * 60;
      const rawEnd = zonedMinutes(instance.endsAt, timeZone) - startHour * 60;
      // A class ending at or past local midnight wraps to a smaller number than
      // it started at — a 23:00–00:00 hour reads as 23:00→00:00, not a negative
      // span. Run it to the end of the grid instead of collapsing it to the
      // 30-minute stub the zero-length guard gives, which cut its title in half.
      const wrapsMidnight = rawEnd <= start;
      const end = wrapsMidnight ? (endHour - startHour) * 60 : rawEnd;
      return { instance, start, end };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  // Cluster transitively-overlapping events, then greedily assign lanes per cluster.
  const placed: PlacedEvent[] = [];
  let cluster: typeof items = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (cluster.length === 0) return;
    const laneEnds: number[] = [];
    const laneOf = new Map<number, number>();
    cluster.forEach((item, idx) => {
      let lane = laneEnds.findIndex((e) => e <= item.start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(item.end);
      } else {
        laneEnds[lane] = item.end;
      }
      laneOf.set(idx, lane);
    });
    const lanes = laneEnds.length;
    cluster.forEach((item, idx) => {
      const clampedStart = Math.max(0, Math.min(item.start, totalMin));
      const clampedEnd = Math.max(clampedStart, Math.min(item.end, totalMin));
      const lane = laneOf.get(idx) ?? 0;
      placed.push({
        instance: item.instance,
        topRem: (clampedStart / 60) * HOUR_REM,
        heightRem: Math.max(MIN_EVENT_REM, ((clampedEnd - clampedStart) / 60) * HOUR_REM),
        leftPct: (lane / lanes) * 100,
        widthPct: 100 / lanes,
      });
    });
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const item of items) {
    if (item.start >= clusterEnd && cluster.length > 0) flush();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flush();
  return placed;
}

/** The week calendar: a sticky day-header row over a 06:00–22:00 time-grid. */
function WeekGrid({
  days,
  byDay,
  todayKey,
  locale,
  timeZone,
  openHour,
  closeHour,
  t,
  onOpen,
}: {
  days: Date[];
  byDay: Map<string, AdminScheduleInstance[]>;
  todayKey: string;
  locale: string;
  timeZone: string;
  /** The gym's opening window, from Settings → Business hours. */
  openHour: number;
  closeHour: number;
  t: T;
  onOpen: (instance: AdminScheduleInstance) => void;
}) {
  // The visible window follows the week's own classes, so the grid never spends
  // rows on hours the gym doesn't use.
  const { startHour, endHour } = hourRange(
    days.flatMap((day) => byDay.get(toIsoDate(day)) ?? []),
    timeZone,
    openHour,
    closeHour,
  );
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  return (
    <div {...stylex.props(styles.calScroll)}>
      <div {...stylex.props(styles.calGrid)}>
        {/* Header row: corner + seven day headers. */}
        <div {...stylex.props(styles.corner)}>{t('time')}</div>
        {days.map((day) => {
          const isToday = toIsoDate(day) === todayKey;
          return (
            <div
              key={toIsoDate(day)}
              {...stylex.props(styles.dayHead, isToday && styles.dayHeadToday)}
            >
              <span {...stylex.props(styles.weekdayLabel)}>{weekdayShort(day, locale)}</span>
              <span {...stylex.props(styles.dayNum, isToday && styles.dayNumToday)}>
                {day.getUTCDate()}
              </span>
            </div>
          );
        })}

        {/* Body row: time column + seven day columns. */}
        <div {...stylex.props(styles.timeCol)}>
          {hours.map((h) => (
            <div key={h} {...stylex.props(styles.timeCell)}>
              <span {...stylex.props(styles.timeLabel)}>{hourLabel(h)}</span>
            </div>
          ))}
        </div>
        {days.map((day) => {
          const key = toIsoDate(day);
          const placed = placeEvents(byDay.get(key) ?? [], timeZone, startHour, endHour);
          const isToday = key === todayKey;
          return (
            <div
              key={key}
              {...stylex.props(styles.dayCol, isToday && styles.dayColToday)}
              style={{ height: `${(endHour - startHour) * HOUR_REM + GRID_PAD_REM * 2}rem` }}
            >
              {placed.map((ev) => (
                <EventBlock
                  key={ev.instance.id}
                  placed={ev}
                  locale={locale}
                  timeZone={timeZone}
                  t={t}
                  onOpen={onOpen}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** One positioned class block inside the week time-grid. */
function EventBlock({
  placed,
  locale,
  timeZone,
  t,
  onOpen,
}: {
  placed: PlacedEvent;
  locale: string;
  timeZone: string;
  t: T;
  onOpen: (instance: AdminScheduleInstance) => void;
}) {
  const { instance } = placed;
  const canceled = instance.status === 'CANCELED';
  return (
    <button
      type="button"
      onClick={() => onOpen(instance)}
      aria-label={t('card.viewAria', {
        title: instance.title,
        time: formatTime(instance.startsAt, locale, timeZone),
      })}
      {...stylex.props(styles.event, canceled && styles.eventCanceled)}
      style={{
        top: `${placed.topRem}rem`,
        height: `${placed.heightRem}rem`,
        left: `calc(${placed.leftPct}% + 0.125rem)`,
        width: `calc(${placed.widthPct}% - 0.25rem)`,
        borderLeftColor: instance.color,
      }}
    >
      <span {...stylex.props(styles.eventTime)}>
        {formatTime(instance.startsAt, locale, timeZone)}–
        {formatTime(instance.endsAt, locale, timeZone)}
      </span>
      <p {...stylex.props(styles.eventTitle, canceled && styles.eventTitleCanceled)}>
        {instance.title}
      </p>
    </button>
  );
}

// ── Month grid ────────────────────────────────────────────────────────────────

const MONTH_CHIP_LIMIT = 3;

/** The month overview: a Monday-first 7-column grid of day cells with class chips. */
function MonthGrid({
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
  byDay: Map<string, AdminScheduleInstance[]>;
  todayKey: string;
  locale: string;
  timeZone: string;
  t: T;
  onOpen: (instance: AdminScheduleInstance) => void;
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
function ListDayColumn({
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
  instances: AdminScheduleInstance[];
  locale: string;
  timeZone: string;
  t: T;
  onOpen: (instance: AdminScheduleInstance) => void;
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
            <ClassCard
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

/** One class occurrence block: time, title, trainer/branch, occupancy, status. */
function ClassCard({
  instance,
  locale,
  timeZone,
  t,
  onOpen,
}: {
  instance: AdminScheduleInstance;
  locale: string;
  timeZone: string;
  t: T;
  onOpen: (instance: AdminScheduleInstance) => void;
}) {
  const remaining = Math.max(0, instance.capacity - instance.bookedCount);
  const pct = instance.capacity > 0 ? (instance.bookedCount / instance.capacity) * 100 : 0;
  const barColor =
    pct > 85 ? 'var(--color-error)' : pct > 60 ? 'var(--color-warning)' : 'var(--color-success)';
  const statusTone = STATUS_TONES[instance.status];
  const canceled = instance.status === 'CANCELED';

  return (
    <button
      type="button"
      onClick={() => onOpen(instance)}
      aria-label={t('card.viewAria', {
        title: instance.title,
        time: formatTime(instance.startsAt, locale, timeZone),
      })}
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
          {formatTime(instance.startsAt, locale, timeZone)}–
          {formatTime(instance.endsAt, locale, timeZone)}
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
        {instance.locationName || instance.room ? (
          <span {...stylex.props(styles.metaRow, styles.truncate)}>
            <Icon name="pin" sw={2} {...stylex.props(styles.smallIcon)} />
            <span {...stylex.props(styles.truncate)}>
              {[instance.locationName, instance.room].filter(Boolean).join(' · ')}
            </span>
          </span>
        ) : null}
      </div>

      <div {...stylex.props(styles.occWrap)}>
        <div {...stylex.props(styles.occLabels)}>
          <span {...stylex.props(styles.occBooked)}>
            {t('card.spots', { booked: instance.bookedCount, cap: instance.capacity })}
          </span>
          <span {...stylex.props(styles.occRemaining)}>
            {remaining === 0 ? t('card.full') : t('card.remaining', { remaining })}
          </span>
        </div>
        <div {...stylex.props(styles.barTrack)}>
          <div
            {...stylex.props(styles.barFill)}
            style={{ width: `${Math.min(100, pct)}%`, backgroundColor: barColor }}
          />
        </div>
      </div>

      {statusTone ? (
        <span {...stylex.props(styles.badgeWrap)}>
          <Badge tone={statusTone}>{t(`status.${instance.status}`)}</Badge>
        </span>
      ) : null}
    </button>
  );
}

/** A labelled `{ id, name }` filter select for the toolbar (trainer / location). */
function FilterSelect({
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
    <Card variant="default" padding={0} xstyle={styles.emptyCard}>
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

/** `06:00`-style label for an hour number. */
function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

/** Localised weekday abbreviation for a UTC day anchor (e.g. "Mon"). */
function weekdayShort(day: Date, locale: string): string {
  return createDateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(day);
}

/** Localised `HH:MM` for an ISO instant, read on the gym's clock. */
function formatTime(iso: string, locale: string, timeZone: string): string {
  return createDateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(iso));
}

/** A compact "Jun 30 – Jul 6, 2026" span for the week, both anchors in UTC. */
function formatRange(start: Date, end: Date, locale: string): string {
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const startFmt = createDateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(start);
  const endFmt = createDateTimeFormat(locale, {
    month: sameMonth ? undefined : 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(end);
  return `${startFmt} – ${endFmt}`;
}

/** "July 2026" for the month header, in UTC. */
function formatMonth(anchor: Date, locale: string): string {
  return createDateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(anchor);
}
