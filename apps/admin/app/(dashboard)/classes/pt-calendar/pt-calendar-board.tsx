'use client';

import { useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import type { AdminPtSession, AdminServiceSession, ClassInstanceStatus } from '@fit/types';
import { Badge, Button, Card, type BadgeTone } from '@fit/ui-kit';
import { Icon } from '@/components/ui';
import { useSlideDrawer } from '@/hooks/use-slide-drawer';
import { addWeeks, toIsoDate, weekDays, zonedClock, zonedIsoDate } from '../schedule/week';
import { AddSlotDrawer, type ServiceOption } from './add-slot-drawer';
import { SlotBlock, SlotDetail } from './slot-block';
import { cancelPtSessionAction, completePtSessionAction } from './pt-session-actions';
import { createDateTimeFormat } from '@fit/i18n';

// The time-grid runs 06:00–22:00 (matching the class schedule), each hour 3.5rem
// tall, and session blocks are absolutely positioned by their UTC clock time.
const HOUR_REM = 3.5;
/** Room above the first hour line and below the last; see `timeCol` / `dayCol`. */
const GRID_PAD_REM = 0.5;
/** Fewest hour rows the grid draws, so a sparse week still reads as a day. */
const MIN_ROWS = 6;
const MIN_EVENT_REM = 1.5;

const STATUS_TONES: Record<ClassInstanceStatus, { label: string; tone: BadgeTone }> = {
  SCHEDULED: { label: 'Scheduled', tone: 'positive' },
  COMPLETED: { label: 'Completed', tone: 'neutral' },
  CANCELED: { label: 'Canceled', tone: 'danger' },
};

const styles = stylex.create({
  root: { display: 'flex', flexDirection: 'column', gap: '1.25rem' },
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  navGroup: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
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
    backgroundColor: { default: 'transparent', ':hover': 'var(--color-background-muted)' },
    color: { default: 'var(--color-text-secondary)', ':hover': 'var(--color-text-primary)' },
    cursor: 'pointer',
    transitionProperty: 'background-color, color',
    transitionDuration: '150ms',
  },
  navBtnIcon: { width: '1rem', height: '1rem' },
  todayBtn: {
    height: '2.25rem',
    paddingInline: '0.875rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: {
      default: 'var(--color-background-surface)',
      ':hover': 'var(--color-background-muted)',
    },
    color: 'var(--color-text-primary)',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  rangeLabel: {
    margin: 0,
    marginLeft: '0.25rem',
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.125rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
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
  dayHeadToday: { backgroundColor: 'var(--color-accent-muted)' },
  weekdayLabel: { fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-secondary)' },
  dayNum: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.25rem',
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1,
    color: 'var(--color-text-primary)',
  },
  dayNumToday: { color: 'var(--color-text-accent)' },
  timeCol: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--color-background-body)',
    paddingBlock: '0.5rem',
  },
  timeCell: { position: 'relative', height: '3.5rem', paddingRight: '0.5rem' },
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
    // The hour labels straddle their gridline, so without this the first is
    // clipped by the sticky header and a late session sits on the container's
    // edge. Blocks and the gridline gradient start at the padding box too, so
    // the whole grid shifts as one.
    paddingBlock: '0.5rem',
    borderLeftWidth: '1px',
    borderLeftStyle: 'solid',
    borderLeftColor: 'var(--color-border)',
    backgroundImage:
      'repeating-linear-gradient(to bottom, var(--color-border) 0, var(--color-border) 1px, transparent 1px, transparent 3.5rem), repeating-linear-gradient(to bottom, var(--color-border-subtle, rgba(120,120,120,0.12)) 0, var(--color-border-subtle, rgba(120,120,120,0.12)) 1px, transparent 1px, transparent 1.75rem)',
  },
  dayColToday: { backgroundColor: 'var(--color-accent-muted)' },
  /**
   * The block itself draws nothing. Its box still carries the position and the
   * duration, but a card outline around a two-letter chip was more chrome than
   * content — several in an hour read as a stack of empty boxes. The chip is the
   * whole visual; everything else is one hover away.
   */
  event: {
    position: 'absolute',
    display: 'flex',
    alignItems: 'flex-start',
    overflow: 'visible',
    border: 'none',
    padding: 0,
    background: 'none',
    textAlign: 'left',
    cursor: 'pointer',
    outlineStyle: 'none',
  },
  eventDimmed: { opacity: 0.6 },
  /** One row: the trainer chip and the time, the two things every tier keeps. */
  /**
   * The trainer's initials. Small enough to survive a third-of-a-column block,
   * and the one element that answers "whose session" without being read as a
   * word — which is what makes concurrent sessions scannable.
   */
  /**
   * The hover / focus card. A block only ever shows the trainer chip — a column
   * of stacked name fragments read as a rendering fault rather than a schedule —
   * so the detail lives here, one interaction away, and in the `aria-label` for
   * anyone not using a pointer.
   */
  tooltip: {
    position: 'absolute',
    left: '100%',
    top: 0,
    zIndex: 5,
    marginLeft: '0.375rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.0625rem',
    minWidth: '9rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    paddingBlock: '0.5rem',
    paddingInline: '0.625rem',
    backgroundColor: 'var(--color-background-body)',
    boxShadow: 'var(--shadow-high)',
    pointerEvents: 'none',
  },
  tipTime: {
    fontSize: '0.6875rem',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  tipTitle: {
    fontSize: '0.8125rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  tipTrainer: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  /**
   * The trainer's initials — the one element on the block. Sized to stay legible
   * at a third of a column, and the only thing that has to be read to know whose
   * session an hour belongs to.
   */
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: '1.375rem',
    height: '1.375rem',
    borderRadius: 'var(--radius-full)',
    fontSize: '0.625rem',
    fontWeight: 700,
    letterSpacing: '0.01em',
    color: '#fff',
    boxShadow: { default: 'var(--shadow-low)', ':hover': 'var(--shadow-high)' },
    transitionProperty: 'transform, box-shadow',
    transitionDuration: '150ms',
    transform: { default: 'none', ':hover': 'scale(1.12)' },
  },

  // Detail drawer
  drawer: {
    height: 'calc(100dvh - 1.5rem)',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border-emphasized)',
    backgroundColor: 'var(--color-background-body)',
    boxShadow: 'var(--shadow-high)',
  },
  drawerHead: { paddingBlock: '0.5rem' },
  drawerContent: { padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' },
  detailRow: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  detailLabel: {
    fontSize: '0.6875rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--color-text-secondary)',
  },
  detailValue: { fontSize: '0.9375rem', color: 'var(--color-text-primary)' },
  detailActions: { display: 'flex', gap: '0.75rem', marginTop: '0.5rem' },
  errorCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    padding: '1rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-error)',
    backgroundColor: 'var(--color-error-muted)',
  },
  errorIcon: {
    marginTop: '0.125rem',
    width: '1.25rem',
    height: '1.25rem',
    flexShrink: 0,
    color: 'var(--color-error)',
  },
  errorText: { margin: 0, fontSize: '0.875rem', color: 'var(--color-error)' },
});

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
 * The hours the grid draws: the whole hour the first session starts on through
 * the whole hour the last one ends on. A PT week is sparse — a fixed 06:00–22:00
 * window spent most of its height on rows with nothing in them.
 */
function hourRange(
  sessions: TimeSpan[],
  timeZone: string,
  openHour: number,
  closeHour: number,
): { startHour: number; endHour: number } {
  // The gym's own opening window is the answer; sessions only ever widen it.
  let earliest = openHour * 60;
  let latest = closeHour * 60;
  for (const session of sessions) {
    const start = zonedMinutes(session.startsAt, timeZone);
    const rawEnd = zonedMinutes(session.endsAt, timeZone);
    const end = rawEnd > start ? rawEnd : 24 * 60;
    if (start < earliest) earliest = start;
    if (end > latest) latest = end;
  }
  const startHour = Math.max(0, Math.floor(earliest / 60));
  const endHour = Math.min(24, Math.ceil(latest / 60));
  return atLeast({ startHour, endHour: Math.max(endHour, startHour + 1) }, MIN_ROWS);
}

/**
 * A stable hue per trainer, so two sessions running at the same time are told
 * apart before either is read. The trainer is the axis that matters on this
 * calendar — the same workout type at the same hour is a different session
 * because someone else is taking it — so the colour encodes the trainer rather
 * than the workout. Derived from the name so it survives a reload and stays the
 * same across the week without any stored palette.
 */
/** Two-letter initials for the trainer chip: "Nika B." → "NB". */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

function trainerHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 360;
  }
  return hash;
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}
function weekdayShort(day: Date, locale: string): string {
  return createDateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(day);
}
/**
 * `HH:MM` on the gym's clock. `createDateTimeFormat` reads in UTC by design and
 * ignores the zone it is given, so this board used to label every session with a
 * clock that disagreed with the row it was drawn on — the same bug the class
 * schedule had.
 */
function formatTime(iso: string, _locale: string, timeZone: string): string {
  return zonedClock(new Date(iso), timeZone);
}

/** Anything the grid can place: a PT session or a service slot. */
export interface TimeSpan {
  id: string;
  startsAt: string;
  endsAt: string;
}

export interface PlacedSession<T extends TimeSpan = AdminPtSession> {
  session: T;
  topRem: number;
  heightRem: number;
  leftPct: number;
  widthPct: number;
}

/** Position one day's sessions in the grid, splitting overlaps into side-by-side lanes. */
function placeSessions<T extends TimeSpan>(
  sessions: T[],
  timeZone: string,
  startHour: number,
  endHour: number,
): PlacedSession<T>[] {
  const totalMin = (endHour - startHour) * 60;
  const items = sessions
    .map((session) => {
      const start = zonedMinutes(session.startsAt, timeZone) - startHour * 60;
      const rawEnd = zonedMinutes(session.endsAt, timeZone) - startHour * 60;
      // A session ending at or past local midnight wraps to a smaller number;
      // run it to the end of the grid rather than collapsing it to a stub.
      const end = rawEnd > start ? rawEnd : totalMin;
      return { session, start, end };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const placed: PlacedSession<T>[] = [];
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
        session: item.session,
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

/**
 * The PT calendar's week board — PT sessions on the same 06:00–22:00 time-grid the
 * class schedule uses, with prev/next week navigation and an "Add PT session" drawer.
 * Clicking a session opens a detail drawer with cancel / complete.
 *
 * Shows every trainer's sessions unless `trainerId` narrows it; when unfiltered, each
 * block names its trainer, since otherwise two trainers' 9am sessions are
 * indistinguishable.
 */
export function PtCalendarBoard({
  weekStart,
  sessions,
  slots,
  services,
  canWrite,
  timeZone,
  openHour,
  closeHour,
}: {
  weekStart: string;
  sessions: AdminPtSession[];
  /** The service slots (open / booked / done) in the same week. */
  slots: AdminServiceSession[];
  /** ACTIVE services the "Open a slot" drawer can pick from. */
  services: ServiceOption[];
  canWrite: boolean;
  /** The gym's IANA zone — the grid's rows and clock labels are read on it. */
  timeZone: string;
  /** The gym's opening window, from Settings → Business hours. */
  openHour: number;
  closeHour: number;
}) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const monday = useMemo(() => new Date(`${weekStart}T00:00:00.000Z`), [weekStart]);
  const days = useMemo(() => weekDays(monday), [monday]);
  const todayKey = toIsoDate(new Date());

  const byDay = useMemo(() => {
    const map = new Map<string, AdminPtSession[]>();
    for (const session of sessions) {
      const key = session.startsAt.slice(0, 10);
      const list = map.get(key);
      if (list) list.push(session);
      else map.set(key, [session]);
    }
    return map;
  }, [sessions]);

  const slotsByDay = useMemo(() => {
    const map = new Map<string, AdminServiceSession[]>();
    for (const slot of slots) {
      const key = zonedIsoDate(new Date(slot.startsAt), timeZone);
      const list = map.get(key);
      if (list) list.push(slot);
      else map.set(key, [slot]);
    }
    return map;
  }, [slots, timeZone]);

  const [selected, setSelected] = useState<AdminPtSession | null>(null);
  const detail = useSlideDrawer();
  const [selectedSlot, setSelectedSlot] = useState<AdminServiceSession | null>(null);
  const slotDetail = useSlideDrawer();

  function openSlot(slot: AdminServiceSession): void {
    setSelectedSlot(slot);
    slotDetail.open();
  }

  function goToWeek(nextMonday: Date): void {
    const params = new URLSearchParams(searchParams.toString());
    params.set('week', toIsoDate(nextMonday));
    router.replace(`${pathname}?${params.toString()}`);
  }

  function openSession(session: AdminPtSession): void {
    setSelected(session);
    detail.open();
  }

  const rangeLabel = useMemo(() => {
    const last = days[days.length - 1] ?? monday;
    const fmt = (d: Date) =>
      createDateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(d);
    return `${fmt(monday)} – ${fmt(last)}`;
  }, [days, monday, locale]);

  // The window follows the week's own sessions — a PT calendar is sparse, and a
  // fixed 06:00–22:00 grid was mostly rows with nothing in them.
  const { startHour, endHour } = hourRange([...sessions, ...slots], timeZone, openHour, closeHour);
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.toolbar)}>
        <div {...stylex.props(styles.navGroup)}>
          <div {...stylex.props(styles.navBox)}>
            <button
              type="button"
              aria-label="Previous week"
              onClick={() => goToWeek(addWeeks(monday, -1))}
              {...stylex.props(styles.navBtn)}
            >
              <Icon name="chevronLeft" sw={2} {...stylex.props(styles.navBtnIcon)} />
            </button>
            <button
              type="button"
              aria-label="Next week"
              onClick={() => goToWeek(addWeeks(monday, 1))}
              {...stylex.props(styles.navBtn)}
            >
              <Icon name="chevronRight" sw={2} {...stylex.props(styles.navBtnIcon)} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => goToWeek(new Date())}
            {...stylex.props(styles.todayBtn)}
          >
            Today
          </button>
          <p {...stylex.props(styles.rangeLabel)}>{rangeLabel}</p>
        </div>

        {canWrite ? (
          <AddSlotDrawer services={services} defaultDate={weekStart} timeZone={timeZone} />
        ) : null}
      </div>

      <div {...stylex.props(styles.calScroll)}>
        <div {...stylex.props(styles.calGrid)}>
          <div {...stylex.props(styles.corner)}>Time</div>
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

          <div {...stylex.props(styles.timeCol)}>
            {hours.map((h) => (
              <div key={h} {...stylex.props(styles.timeCell)}>
                <span {...stylex.props(styles.timeLabel)}>{hourLabel(h)}</span>
              </div>
            ))}
          </div>
          {days.map((day) => {
            const key = toIsoDate(day);
            const placed = placeSessions(byDay.get(key) ?? [], timeZone, startHour, endHour);
            const placedSlots = placeSessions(
              slotsByDay.get(key) ?? [],
              timeZone,
              startHour,
              endHour,
            );
            const isToday = key === todayKey;
            return (
              <div
                key={key}
                {...stylex.props(styles.dayCol, isToday && styles.dayColToday)}
                style={{ height: `${(endHour - startHour) * HOUR_REM + GRID_PAD_REM * 2}rem` }}
              >
                {placed.map((ev) => (
                  <SessionBlock
                    key={ev.session.id}
                    placed={ev}
                    locale={locale}
                    timeZone={timeZone}
                    onOpen={openSession}
                  />
                ))}
                {placedSlots.map((ev) => (
                  <SlotBlock
                    key={ev.session.id}
                    placed={ev}
                    timeZone={timeZone}
                    onOpen={openSlot}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <PtSessionDetail
        drawer={detail}
        session={selected}
        locale={locale}
        timeZone={timeZone}
        canWrite={canWrite}
        onChanged={() => router.refresh()}
      />
      <SlotDetail
        drawer={slotDetail}
        slot={selectedSlot}
        locale={locale}
        timeZone={timeZone}
        canWrite={canWrite}
        onChanged={() => router.refresh()}
      />
    </div>
  );
}

/** One positioned PT session block: time, workout type, trainer, status. */
function SessionBlock({
  placed,
  locale,
  timeZone,
  onOpen,
}: {
  placed: PlacedSession;
  locale: string;
  timeZone: string;
  onOpen: (session: AdminPtSession) => void;
}) {
  const { session } = placed;
  const [showInfo, setShowInfo] = useState(false);
  const dimmed = session.status !== 'SCHEDULED';
  const title = session.classTypeName ?? 'PT session';
  const trainer = session.trainerName ?? '';
  const start = formatTime(session.startsAt, locale, timeZone);
  const end = formatTime(session.endsAt, locale, timeZone);
  const hue = trainerHue(trainer || title);

  return (
    <button
      type="button"
      onClick={() => onOpen(session)}
      onMouseEnter={() => setShowInfo(true)}
      onMouseLeave={() => setShowInfo(false)}
      onFocus={() => setShowInfo(true)}
      onBlur={() => setShowInfo(false)}
      aria-label={`${start}–${end} · ${title}${trainer ? ` · ${trainer}` : ''}`}
      {...stylex.props(styles.event, dimmed && styles.eventDimmed)}
      style={{
        top: `${placed.topRem}rem`,
        height: `${placed.heightRem}rem`,
        left: `calc(${placed.leftPct}% + 0.125rem)`,
        width: `calc(${placed.widthPct}% - 0.25rem)`,
      }}
    >
      <span {...stylex.props(styles.chip)} style={{ backgroundColor: `hsl(${hue} 55% 34%)` }}>
        {initialsOf(trainer || title)}
      </span>
      {showInfo ? (
        <span role="tooltip" {...stylex.props(styles.tooltip)}>
          <span {...stylex.props(styles.tipTime)}>
            {start}–{end}
          </span>
          <span {...stylex.props(styles.tipTitle)}>{title}</span>
          {trainer ? <span {...stylex.props(styles.tipTrainer)}>{trainer}</span> : null}
        </span>
      ) : null}
    </button>
  );
}

/** The session detail drawer — workout type, time, status, notes + cancel / complete. */
function PtSessionDetail({
  drawer,
  session,
  locale,
  timeZone,
  canWrite,
  onChanged,
}: {
  drawer: ReturnType<typeof useSlideDrawer>;
  session: AdminPtSession | null;
  locale: string;
  timeZone: string;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!session) return null;

  const status = STATUS_TONES[session.status];
  const isScheduled = session.status === 'SCHEDULED';

  function run(action: (id: string) => Promise<{ ok: boolean; error?: string }>): void {
    if (!session) return;
    setError(null);
    const id = session.id;
    startTransition(async () => {
      const result = await action(id);
      if (result.ok) {
        onChanged();
        drawer.requestClose();
      } else {
        setError(result.error ?? 'Something went wrong');
      }
    });
  }

  return (
    <Dialog
      isOpen={drawer.isOpen}
      onOpenChange={drawer.handleOpenChange}
      purpose="info"
      aria-label="PT session"
      width="30rem"
      maxHeight="100dvh"
      position={{ top: '0.75rem', right: '0.75rem', bottom: '0.75rem' }}
      padding={6}
      xstyle={[styles.drawer, drawer.motion]}
    >
      <Layout
        height="fill"
        header={
          <DialogHeader
            title="PT session"
            hasDivider={false}
            onOpenChange={drawer.handleOpenChange}
            xstyle={styles.drawerHead}
          />
        }
        content={
          <LayoutContent padding={0} isScrollable xstyle={styles.drawerContent}>
            <div {...stylex.props(styles.detailRow)}>
              <span {...stylex.props(styles.detailLabel)}>Workout type</span>
              <span {...stylex.props(styles.detailValue)}>{session.classTypeName ?? '-'}</span>
            </div>
            <div {...stylex.props(styles.detailRow)}>
              <span {...stylex.props(styles.detailLabel)}>When</span>
              <span {...stylex.props(styles.detailValue)}>
                {formatTime(session.startsAt, locale, timeZone)}–
                {formatTime(session.endsAt, locale, timeZone)} · {session.durationMinutes} min
              </span>
            </div>
            <div {...stylex.props(styles.detailRow)}>
              <span {...stylex.props(styles.detailLabel)}>Status</span>
              <span>
                <Badge tone={status.tone} label={status.label} />
              </span>
            </div>
            {session.notes ? (
              <div {...stylex.props(styles.detailRow)}>
                <span {...stylex.props(styles.detailLabel)}>Notes</span>
                <span {...stylex.props(styles.detailValue)}>{session.notes}</span>
              </div>
            ) : null}

            {error ? (
              <Card padding="none" xstyle={styles.errorCard}>
                <Icon name="info" {...stylex.props(styles.errorIcon)} />
                <p role="alert" {...stylex.props(styles.errorText)}>
                  {error}
                </p>
              </Card>
            ) : null}

            {canWrite && isScheduled ? (
              <div {...stylex.props(styles.detailActions)}>
                <Button
                  variant="primary"
                  size="card"
                  onClick={() => run(completePtSessionAction)}
                  disabled={pending}
                  label="Mark complete"
                />
                <Button
                  variant="secondary"
                  size="card"
                  onClick={() => run(cancelPtSessionAction)}
                  disabled={pending}
                  label="Cancel session"
                />
              </div>
            ) : null}
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
