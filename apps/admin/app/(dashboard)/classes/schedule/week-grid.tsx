'use client';

import * as stylex from '@stylexjs/stylex';
import type { useTranslations } from 'next-intl';
import type { CalendarEvent } from './calendar-board';
import { createDateTimeFormat } from '@fit/i18n';
import { Icon } from '@/components/ui';
import { toIsoDate, zonedClock, zonedMinutesOfDay } from './week';

type T = ReturnType<typeof useTranslations>;

/**
 * The week as a slot grid: one row per hour, one column per day, and every
 * class an equal-height card in its start-hour cell. This replaced the
 * time-proportional grid — a gym's week is a timetable of discrete sessions,
 * and cards with room for trainer, duration and occupancy tell a staffer more
 * than blocks whose height encodes minutes.
 *
 * Same-hour classes stack vertically inside their cell, so parallel sessions
 * never fight for column width. Click-to-create survives the redesign as a
 * "+" target at the foot of every cell — occupied or not — seeded with that
 * cell's day and hour.
 */

/** Fewest hour rows the grid draws, so a sparse week still reads as a day. */
const MIN_ROWS = 6;

/**
 * Above this many seats the occupancy bar stops drawing one segment per seat —
 * a 30-seat studio would render confetti — and falls back to a solid fill.
 */
const MAX_SEGMENTS = 12;

const styles = stylex.create({
  scroll: {
    overflowX: 'auto',
    borderColor: 'var(--color-border)',
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-background-surface)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '3.75rem repeat(7, minmax(11rem, 1fr))',
    minWidth: '64rem',
  },
  row: {
    display: 'contents',
  },
  corner: {
    position: 'sticky',
    left: 0,
    zIndex: 2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.5rem 0.25rem',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--color-text-secondary)',
    backgroundColor: 'var(--color-background-surface)',
    borderBottomColor: 'var(--color-border)',
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
  },
  dayHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: '0.375rem',
    padding: '0.625rem 0.5rem',
    borderBottomColor: 'var(--color-border)',
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    borderLeftColor: 'var(--color-border)',
    borderLeftStyle: 'solid',
    borderLeftWidth: '1px',
  },
  dayHeadToday: {
    backgroundColor: 'var(--color-accent-muted)',
  },
  weekdayLabel: {
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--color-text-secondary)',
  },
  dayNum: {
    fontSize: '0.9375rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  dayNumToday: {
    color: 'var(--color-text-accent)',
  },
  hourCell: {
    position: 'sticky',
    left: 0,
    zIndex: 2,
    display: 'flex',
    justifyContent: 'center',
    padding: '0.75rem 0.25rem',
    fontSize: '0.75rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
    backgroundColor: 'var(--color-background-surface)',
    borderTopColor: 'var(--color-border)',
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
  },
  hourCellNow: {
    color: 'var(--color-text-accent)',
  },
  slot: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '0.5rem',
    minHeight: '3.25rem',
    borderTopColor: 'var(--color-border)',
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
    borderLeftColor: 'var(--color-border)',
    borderLeftStyle: 'solid',
    borderLeftWidth: '1px',
  },
  slotToday: {
    backgroundColor: 'var(--color-accent-muted)',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'start',
    width: '100%',
    padding: 0,
    overflow: 'hidden',
    cursor: 'pointer',
    backgroundColor: 'var(--color-background-surface)',
    borderColor: 'var(--color-border)',
    borderStyle: 'solid',
    borderWidth: '1px',
    borderTopWidth: '3px',
    borderRadius: 'var(--radius-element)',
    boxShadow: {
      default: 'var(--shadow-low)',
      ':hover': 'var(--shadow-high)',
    },
    transitionProperty: 'box-shadow, transform',
    transitionDuration: '120ms',
    transform: {
      default: 'none',
      ':hover': 'translateY(-1px)',
    },
  },
  cardMutedFate: {
    opacity: 0.65,
    boxShadow: { default: 'none', ':hover': 'var(--shadow-low)' },
  },
  cardBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
    padding: '0.625rem 0.75rem 0.75rem',
  },
  cardTime: {
    fontSize: '1rem',
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  cardTitle: {
    margin: 0,
    fontSize: '0.8125rem',
    fontWeight: 600,
    lineHeight: 1.3,
    color: 'var(--color-text-primary)',
    overflowWrap: 'anywhere',
  },
  cardTitleCanceled: {
    textDecorationLine: 'line-through',
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
    minWidth: 0,
  },
  metaIcon: {
    height: '0.875rem',
    width: '0.875rem',
    flexShrink: 0,
  },
  metaText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  meter: {
    display: 'flex',
    gap: '2px',
    height: '0.375rem',
    marginTop: '0.25rem',
    borderRadius: 'var(--radius-full)',
    overflow: 'hidden',
  },
  meterSeg: {
    flexGrow: 1,
    backgroundColor: 'var(--color-background-muted)',
  },
  meterSegFilled: {
    backgroundColor: 'var(--color-accent)',
  },
  meterTrack: {
    flexGrow: 1,
    backgroundColor: 'var(--color-background-muted)',
    borderRadius: 'var(--radius-full)',
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    backgroundColor: 'var(--color-accent)',
  },
  foot: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.4375rem 0.5rem',
    fontSize: '0.75rem',
    fontWeight: 600,
  },
  footScheduled: {
    backgroundColor: 'var(--color-text-primary)',
    color: 'var(--color-background-surface)',
  },
  footEnded: {
    backgroundColor: 'var(--color-background-muted)',
    color: 'var(--color-text-secondary)',
  },
  footCanceled: {
    backgroundColor: 'var(--color-background-muted)',
    color: 'var(--color-error)',
  },
  addTarget: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 'auto',
    minHeight: '1.5rem',
    cursor: 'pointer',
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderStyle: 'dashed',
    borderWidth: '1px',
    borderRadius: 'var(--radius-element)',
    color: {
      default: 'transparent',
      ':hover': 'var(--color-text-accent)',
      ':focus-visible': 'var(--color-text-accent)',
    },
    ':hover': {
      borderColor: 'var(--color-border-emphasized)',
    },
  },
  addIcon: {
    height: '1rem',
    width: '1rem',
  },
});

/** `06:00`-style label for an hour number. */
function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

/** Localised weekday abbreviation for a UTC day anchor (e.g. "Mon"). */
function weekdayShort(day: Date, locale: string): string {
  return createDateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(day);
}

/** The hour row a class belongs to, on the gym's clock. */
function startHourOf(instance: CalendarEvent, timeZone: string): number {
  return Math.floor(zonedMinutesOfDay(new Date(instance.startsAt), timeZone) / 60);
}

/**
 * Which hour rows the grid draws: the gym's opening window, widened by any
 * class starting outside it, padded to {@link MIN_ROWS} so a sparse week still
 * has somewhere to click.
 */
function hourRows(
  instances: CalendarEvent[],
  timeZone: string,
  openHour: number,
  closeHour: number,
): number[] {
  let first = Math.max(0, Math.min(23, openHour));
  let last = Math.max(first + 1, Math.min(24, closeHour));
  for (const instance of instances) {
    const hour = startHourOf(instance, timeZone);
    if (hour < first) first = hour;
    if (hour + 1 > last) last = hour + 1;
  }
  while (last - first < MIN_ROWS && last < 24) last += 1;
  while (last - first < MIN_ROWS && first > 0) first -= 1;
  return Array.from({ length: last - first }, (_, i) => first + i);
}

export function WeekGrid<E extends CalendarEvent>({
  days,
  byDay,
  todayKey,
  locale,
  timeZone,
  openHour,
  closeHour,
  t,
  onOpen,
  onPickSlot,
}: {
  days: Date[];
  byDay: Map<string, E[]>;
  todayKey: string;
  locale: string;
  timeZone: string;
  /** The gym's opening window, from Settings → Business hours. */
  openHour: number;
  closeHour: number;
  t: T;
  onOpen: (instance: E) => void;
  /** Click-to-create: null when the staffer can't add classes. */
  onPickSlot: ((dayIso: string, startTime: string) => void) | null;
}) {
  const all = days.flatMap((day) => byDay.get(toIsoDate(day)) ?? []);
  const hours = hourRows(all, timeZone, openHour, closeHour);
  const nowHour =
    zonedIsoDateSafe(timeZone) === todayKey
      ? Math.floor(zonedMinutesOfDay(new Date(), timeZone) / 60)
      : null;

  return (
    <div {...stylex.props(styles.scroll)}>
      <div role="grid" aria-label={t('week.gridAria')} {...stylex.props(styles.grid)}>
        <div role="row" {...stylex.props(styles.row)}>
          <div role="columnheader" {...stylex.props(styles.corner)}>
            {t('time')}
          </div>
          {days.map((day) => {
            const isToday = toIsoDate(day) === todayKey;
            return (
              <div
                key={toIsoDate(day)}
                role="columnheader"
                {...stylex.props(styles.dayHead, isToday && styles.dayHeadToday)}
              >
                <span {...stylex.props(styles.weekdayLabel)}>{weekdayShort(day, locale)}</span>
                <span {...stylex.props(styles.dayNum, isToday && styles.dayNumToday)}>
                  {day.getUTCDate()}
                </span>
              </div>
            );
          })}
        </div>

        {hours.map((hour) => (
          <div key={hour} role="row" {...stylex.props(styles.row)}>
            <div
              role="rowheader"
              aria-label={nowHour === hour ? t('grid.now') : undefined}
              {...stylex.props(styles.hourCell, nowHour === hour && styles.hourCellNow)}
            >
              {hourLabel(hour)}
            </div>
            {days.map((day) => {
              const key = toIsoDate(day);
              const slotClasses = (byDay.get(key) ?? [])
                .filter((instance) => startHourOf(instance, timeZone) === hour)
                .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
              return (
                <div
                  key={key}
                  role="gridcell"
                  {...stylex.props(styles.slot, key === todayKey && styles.slotToday)}
                >
                  {slotClasses.map((instance) => (
                    <SlotCard
                      key={instance.id}
                      instance={instance}
                      timeZone={timeZone}
                      t={t}
                      onOpen={onOpen}
                    />
                  ))}
                  {onPickSlot ? (
                    <button
                      type="button"
                      aria-label={t('grid.addAt', { time: hourLabel(hour) })}
                      onClick={() => onPickSlot(key, hourLabel(hour))}
                      {...stylex.props(styles.addTarget)}
                    >
                      <Icon name="plus" sw={2} {...stylex.props(styles.addIcon)} />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Today's `YYYY-MM-DD` on the gym's clock. Wrapped so a bogus stored time zone
 * degrades to "no now-highlight" instead of crashing the whole board.
 */
function zonedIsoDateSafe(timeZone: string): string | null {
  try {
    return zonedClockDate(new Date(), timeZone);
  } catch {
    return null;
  }
}

function zonedClockDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** One event card inside its hour-row slot. */
function SlotCard<E extends CalendarEvent>({
  instance,
  timeZone,
  t,
  onOpen,
}: {
  instance: E;
  timeZone: string;
  t: T;
  onOpen: (instance: E) => void;
}) {
  const start = zonedClock(new Date(instance.startsAt), timeZone);
  const canceled = instance.status === 'CANCELED';
  const completed = instance.status === 'COMPLETED';
  // An event with no seats (a PT session) has no occupancy to state: its
  // footer carries the subtitle (who it is for) or, failing that, its status.
  const seated = instance.capacity !== null && instance.bookedCount !== null;
  const spots = seated
    ? t('card.spots', { booked: instance.bookedCount, cap: instance.capacity })
    : (instance.subtitle ?? t('status.SCHEDULED'));
  const footText = canceled
    ? t('status.CANCELED')
    : completed
      ? t('status.COMPLETED')
      : seated && instance.bookedCount! >= instance.capacity!
        ? t('card.full')
        : spots;

  return (
    <button
      type="button"
      onClick={() => onOpen(instance)}
      aria-label={t('card.viewAria', { title: instance.title, time: start })}
      {...stylex.props(styles.card, (canceled || completed) && styles.cardMutedFate)}
      style={{ borderTopColor: instance.color }}
    >
      <span {...stylex.props(styles.cardBody)}>
        <span {...stylex.props(styles.cardTime)}>{start}</span>
        <span {...stylex.props(styles.cardTitle, canceled && styles.cardTitleCanceled)}>
          {instance.title}
        </span>
        {instance.trainerName ? (
          <span {...stylex.props(styles.metaRow)}>
            <Icon name="user" sw={2} {...stylex.props(styles.metaIcon)} />
            <span {...stylex.props(styles.metaText)}>{instance.trainerName}</span>
          </span>
        ) : null}
        {instance.subtitle ? (
          <span {...stylex.props(styles.metaRow)}>
            <Icon name="users" sw={2} {...stylex.props(styles.metaIcon)} />
            <span {...stylex.props(styles.metaText)}>{instance.subtitle}</span>
          </span>
        ) : null}
        <span {...stylex.props(styles.metaRow)}>
          <Icon name="clock" sw={2} {...stylex.props(styles.metaIcon)} />
          <span {...stylex.props(styles.metaText)}>
            {t('day.minutes', { count: instance.durationMinutes })}
          </span>
        </span>
        {canceled || !seated ? null : (
          <OccupancyMeter
            bookedCount={instance.bookedCount!}
            capacity={instance.capacity!}
            label={spots}
          />
        )}
      </span>
      <span
        {...stylex.props(
          styles.foot,
          canceled ? styles.footCanceled : completed ? styles.footEnded : styles.footScheduled,
        )}
      >
        {footText}
      </span>
    </button>
  );
}

/**
 * The card's occupancy bar: one segment per seat while that stays legible,
 * a solid fill past {@link MAX_SEGMENTS}.
 */
function OccupancyMeter({
  bookedCount,
  capacity,
  label,
}: {
  bookedCount: number;
  capacity: number;
  label: string;
}) {
  const pct = capacity > 0 ? Math.min(100, Math.round((bookedCount / capacity) * 100)) : 0;
  return (
    <span
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={capacity}
      aria-valuenow={Math.min(bookedCount, capacity)}
      {...stylex.props(styles.meter)}
    >
      {capacity > 0 && capacity <= MAX_SEGMENTS ? (
        Array.from({ length: capacity }, (_, i) => (
          <span
            key={i}
            {...stylex.props(styles.meterSeg, i < bookedCount && styles.meterSegFilled)}
          />
        ))
      ) : (
        <span {...stylex.props(styles.meterTrack)}>
          <span {...stylex.props(styles.meterFill)} style={{ width: `${pct}%` }} />
        </span>
      )}
    </span>
  );
}
