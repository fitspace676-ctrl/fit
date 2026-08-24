'use client';

import { useMemo } from 'react';
import { Button, Card } from '@/src/components/ui/kit';
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import type { ClassInstanceCard } from '@fit/types';
import { Icon } from '@/src/components/ui';
import { EmptyClasses } from './EmptyClasses';
import {
  addWeeks,
  dayKey,
  formatWeekRange,
  formatZonedTime,
  isSameDay,
  startOfWeek,
  weekDays,
  zonedDayIndexInWeek,
  zonedParts,
} from './date-utils';
import { createDateTimeFormat } from '@fit/i18n';

// The week is a slot grid, not a time-proportional one: one row per hour, one
// column per day, and every class an equal-height card in its start-hour cell.
// A gym's week is a timetable of discrete sessions, and a card with room for the
// trainer, the length and how full the class is tells a member more than a block
// whose height encodes minutes. It also fixes what the proportional grid could
// not: classes sharing an hour used to be squeezed into side-by-side lanes,
// which truncated their titles to a letter or two. They now stack, and the row
// grows to fit. Mirrors the console's own week grid so both read the same.

/** Default visible band (06:00–22:00) when the data doesn't push it wider. */
const DEFAULT_START_HOUR = 6;
const DEFAULT_END_HOUR = 22;

/**
 * Above this many seats the occupancy bar stops drawing one segment per seat —
 * a 30-seat studio would render confetti — and falls back to a solid fill.
 */
const MAX_SEGMENTS = 12;

const styles = stylex.create({
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  navLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
  },
  navIcon: {
    height: '1rem',
    width: '1rem',
  },
  navLabel: {
    margin: 0,
    marginInlineStart: '0.25rem',
    fontSize: '0.875rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  card: {
    overflowX: 'auto',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '3.5rem repeat(7, minmax(10rem, 1fr))',
    minWidth: '58rem',
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
    fontSize: '0.625rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--color-text-secondary)',
    backgroundColor: 'var(--color-background-surface)',
    borderBottomColor: 'var(--color-border)',
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
  },
  headCell: {
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
  headCellToday: {
    backgroundColor: 'var(--color-accent-muted)',
  },
  headDow: {
    margin: 0,
    fontSize: '0.625rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--color-text-secondary)',
  },
  headDate: {
    margin: 0,
    fontSize: '0.9375rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  headDateToday: {
    color: 'var(--color-text-accent)',
  },
  hourCell: {
    position: 'sticky',
    left: 0,
    zIndex: 2,
    display: 'flex',
    justifyContent: 'center',
    padding: '0.75rem 0.25rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
    backgroundColor: 'var(--color-background-surface)',
    borderTopColor: 'var(--color-border)',
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
  },
  slot: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '0.5rem',
    minHeight: '3rem',
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
  classCard: {
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'start',
    width: '100%',
    padding: 0,
    overflow: 'hidden',
    cursor: 'pointer',
    appearance: 'none',
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
  classBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.3125rem',
    padding: '0.5rem 0.625rem 0.625rem',
  },
  classTime: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.9375rem',
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  classTitle: {
    fontSize: '0.8125rem',
    fontWeight: 600,
    lineHeight: 1.3,
    color: 'var(--color-text-primary)',
    overflowWrap: 'anywhere',
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    minWidth: 0,
    fontSize: '0.6875rem',
    color: 'var(--color-text-secondary)',
  },
  metaIcon: {
    height: '0.8125rem',
    width: '0.8125rem',
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
    height: '0.3125rem',
    marginTop: '0.125rem',
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
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
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
    padding: '0.375rem 0.5rem',
    fontSize: '0.6875rem',
    fontWeight: 600,
    backgroundColor: 'var(--color-background-muted)',
    color: 'var(--color-text-secondary)',
  },
  footFull: {
    color: 'var(--color-error)',
  },
});

export interface WeekCalendarProps {
  instances: ClassInstanceCard[];
  /** Monday 00:00 (local) of the week being shown. */
  week: Date;
  /** Called with the new week start when the visitor steps back/forward / to today. */
  onWeekChange: (week: Date) => void;
  /** Called with a class id when its card is clicked. */
  onClassClick: (id: string) => void;
  /**
   * The gym's IANA zone. Every time on this screen is read in it rather than in
   * the viewer's zone — a class is a wall-clock commitment at the gym.
   */
  timeZone: string;
}

/** How long a class runs, in whole minutes (never negative across midnight). */
function durationMinutes(instance: ClassInstanceCard): number {
  const span = new Date(instance.endsAt).getTime() - new Date(instance.startsAt).getTime();
  return Math.max(0, Math.round(span / 60_000));
}

/**
 * The hour rows the grid draws: the default 06:00–22:00 band widened to whatever
 * hour the week's earliest / latest class *starts* on. Only starts matter now —
 * a card sits on the row it begins on rather than spanning its duration.
 */
function hourRows(instances: ClassInstanceCard[], timeZone: string): number[] {
  let first = DEFAULT_START_HOUR;
  let last = DEFAULT_END_HOUR;
  for (const instance of instances) {
    const { hour } = zonedParts(instance.startsAt, timeZone);
    if (hour < first) first = hour;
    if (hour + 1 > last) last = hour + 1;
  }
  return Array.from({ length: last - first }, (_, i) => first + i);
}

/**
 * Week view: a 7-column (Mon→Sun) grid of hour rows, each day cell holding the
 * classes that start in that hour as stacked cards.
 *
 * Stateless: the selected `week` and the data are owned by the parent; this
 * component only renders them and reports navigation / clicks back up.
 */
export function WeekCalendar({
  instances,
  week,
  onWeekChange,
  onClassClick,
  timeZone,
}: WeekCalendarProps) {
  const t = useTranslations('classes');
  const locale = useLocale();

  const days = useMemo(() => weekDays(week), [week]);
  const hours = useMemo(() => hourRows(instances, timeZone), [instances, timeZone]);

  /** `dayIndex:hour` → the classes starting in that cell, earliest first. */
  const byCell = useMemo(() => {
    const map = new Map<string, ClassInstanceCard[]>();
    for (const instance of instances) {
      const dayIndex = zonedDayIndexInWeek(instance.startsAt, dayKey(week), timeZone);
      if (dayIndex === -1) continue;
      const { hour } = zonedParts(instance.startsAt, timeZone);
      const key = `${dayIndex}:${hour}`;
      map.set(key, [...(map.get(key) ?? []), instance]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    }
    return map;
  }, [instances, week, timeZone]);

  const today = new Date();

  return (
    <section aria-label={t('weekView.label')} {...stylex.props(styles.section)}>
      <WeekNav
        label={formatWeekRange(week, locale)}
        onPrev={() => onWeekChange(addWeeks(week, -1))}
        onNext={() => onWeekChange(addWeeks(week, 1))}
        onToday={() => onWeekChange(startOfWeek(today))}
        prevLabel={t('weekView.prev')}
        nextLabel={t('weekView.next')}
        todayLabel={t('weekView.today')}
      />

      {instances.length === 0 ? (
        <EmptyClasses />
      ) : (
        <Card padding="none" xstyle={styles.card}>
          <div role="grid" aria-label={t('weekView.label')} {...stylex.props(styles.grid)}>
            <div role="row" {...stylex.props(styles.row)}>
              <div role="columnheader" {...stylex.props(styles.corner)}>
                {t('weekView.time')}
              </div>
              {days.map((day) => {
                const isToday = isSameDay(day, today);
                return (
                  <div
                    key={day.toISOString()}
                    role="columnheader"
                    {...stylex.props(styles.headCell, isToday && styles.headCellToday)}
                  >
                    <p {...stylex.props(styles.headDow)}>
                      {createDateTimeFormat(locale, { weekday: 'short' }).format(day)}
                    </p>
                    <p {...stylex.props(styles.headDate, isToday && styles.headDateToday)}>
                      {day.getDate()}
                    </p>
                  </div>
                );
              })}
            </div>

            {hours.map((hour) => (
              <div key={hour} role="row" {...stylex.props(styles.row)}>
                <div role="rowheader" {...stylex.props(styles.hourCell)}>
                  {`${hour}`.padStart(2, '0')}:00
                </div>
                {days.map((day, dayIndex) => {
                  const cell = byCell.get(`${dayIndex}:${hour}`) ?? [];
                  return (
                    <div
                      key={day.toISOString()}
                      role="gridcell"
                      {...stylex.props(styles.slot, isSameDay(day, today) && styles.slotToday)}
                    >
                      {cell.map((instance) => (
                        <ClassCard
                          key={instance.id}
                          instance={instance}
                          timeZone={timeZone}
                          durationLabel={t('detail.minutes', { count: durationMinutes(instance) })}
                          spotsLabel={
                            instance.bookedCount >= instance.capacity
                              ? t('card.full')
                              : t('card.spotsLeft', {
                                  count: instance.capacity - instance.bookedCount,
                                })
                          }
                          isFull={instance.bookedCount >= instance.capacity}
                          onClick={() => onClassClick(instance.id)}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </Card>
      )}
    </section>
  );
}

/** One class card inside its hour-row slot. */
function ClassCard({
  instance,
  timeZone,
  durationLabel,
  spotsLabel,
  isFull,
  onClick,
}: {
  instance: ClassInstanceCard;
  timeZone: string;
  durationLabel: string;
  spotsLabel: string;
  isFull: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...stylex.props(styles.classCard)}
      style={{ borderTopColor: instance.color }}
    >
      <span {...stylex.props(styles.classBody)}>
        <span {...stylex.props(styles.classTime)}>
          {formatZonedTime(instance.startsAt, timeZone)}
        </span>
        <span {...stylex.props(styles.classTitle)}>{instance.title}</span>
        {instance.trainerName ? (
          <span {...stylex.props(styles.metaRow)}>
            <Icon name="user" sw={2} {...stylex.props(styles.metaIcon)} />
            <span {...stylex.props(styles.metaText)}>{instance.trainerName}</span>
          </span>
        ) : null}
        <span {...stylex.props(styles.metaRow)}>
          <Icon name="clock" sw={2} {...stylex.props(styles.metaIcon)} />
          <span {...stylex.props(styles.metaText)}>{durationLabel}</span>
        </span>
        <OccupancyMeter instance={instance} label={spotsLabel} />
      </span>
      <span {...stylex.props(styles.foot, isFull && styles.footFull)}>{spotsLabel}</span>
    </button>
  );
}

/**
 * The card's occupancy bar: one segment per seat while that stays legible,
 * a solid fill past {@link MAX_SEGMENTS}.
 */
function OccupancyMeter({ instance, label }: { instance: ClassInstanceCard; label: string }) {
  const { bookedCount, capacity } = instance;
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

/** Week navigation bar — previous / range label / next / today. */
function WeekNav({
  label,
  onPrev,
  onNext,
  onToday,
  prevLabel,
  nextLabel,
  todayLabel,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  prevLabel: string;
  nextLabel: string;
  todayLabel: string;
}) {
  return (
    <div {...stylex.props(styles.nav)}>
      <div {...stylex.props(styles.navLeft)}>
        <Button
          variant="secondary"
          size="inline"
          iconOnly
          label={prevLabel}
          icon={<Icon name="chevronLeft" {...stylex.props(styles.navIcon)} />}
          onClick={onPrev}
        />
        <Button
          variant="secondary"
          size="inline"
          iconOnly
          label={nextLabel}
          icon={<Icon name="chevronRight" {...stylex.props(styles.navIcon)} />}
          onClick={onNext}
        />
        <p {...stylex.props(styles.navLabel)}>{label}</p>
      </div>
      <Button variant="secondary" size="inline" label={todayLabel} onClick={onToday} />
    </div>
  );
}
