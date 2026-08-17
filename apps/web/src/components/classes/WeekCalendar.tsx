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
  zonedMinutesIntoDay,
  zonedParts,
} from './date-utils';
import { createDateTimeFormat } from '@fit/i18n';

// Astryx migration (T11), now on the portal kit: the week grid is rebuilt on the kit's `Card` over
// the FormaCore theme, with the 7-column time grid, hour gridlines, and
// positioned class cards authored in compiled StyleX (`var(--color-*)`) — no
// Tailwind utilities and no formacore Aurora-glass primitives. The per-card
// absolute positioning (top/height/lane) stays as inline styles since it is
// data-derived. Layout math is unchanged.

/** Pixels per hour row — drives both the gutter scale and card positioning. */
const HOUR_HEIGHT = 56;
/** Default visible band (06:00–22:00) when the data doesn't push it wider. */
const DEFAULT_START_HOUR = 6;
const DEFAULT_END_HOUR = 22;
/** Floor on a card's rendered height so a short class stays readable/clickable. */
const MIN_CARD_HEIGHT = 28;

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
  // The week range is the calendar's title, so it is set like one. At 14px it
  // sat below the day numbers inside the grid it was supposed to name.
  navLabel: {
    margin: 0,
    marginInlineStart: '0.5rem',
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.0625rem',
    fontWeight: 800,
    letterSpacing: '-0.01em',
    color: 'var(--color-text-primary)',
  },
  card: {
    overflowX: 'auto',
  },
  grid: {
    display: 'grid',
    minWidth: '720px',
    gridTemplateColumns: '3.5rem repeat(7, 1fr)',
  },
  headGutter: {
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
  },
  headCell: {
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
    borderLeftWidth: '1px',
    borderLeftStyle: 'solid',
    borderLeftColor: 'var(--color-border)',
    paddingInline: '0.5rem',
    paddingBlock: '0.5rem',
    textAlign: 'center',
  },
  // Today is the lime. It was `--color-background-purple` — a token the
  // FormaCore theme keeps only as an alias and flattens onto plain ink, so the
  // one column a member looks for first was tinted the same grey as the rest of
  // the header and read as nothing at all. The direction has exactly one colour
  // for "this is the one"; this is it.
  headCellToday: {
    backgroundColor: 'var(--color-accent-muted)',
  },
  headDow: {
    margin: 0,
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--color-text-secondary)',
  },
  headDate: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.875rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  headDateToday: {
    color: 'var(--color-text-accent)',
  },
  gutter: {
    position: 'relative',
  },
  gutterLabel: {
    position: 'absolute',
    right: '0.25rem',
    transform: 'translateY(-50%)',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  dayCol: {
    position: 'relative',
    borderLeftWidth: '1px',
    borderLeftStyle: 'solid',
    borderLeftColor: 'var(--color-border)',
  },
  gridline: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    opacity: 0.5,
  },
  classCard: {
    position: 'absolute',
    overflow: 'hidden',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderLeftWidth: '3px',
    backgroundColor: 'var(--color-background-card)',
    paddingInline: '0.375rem',
    paddingBlock: '0.25rem',
    textAlign: 'left',
    cursor: 'pointer',
    outline: 'none',
    transitionProperty: 'box-shadow',
    transitionDuration: '150ms',
    // No resting elevation — the direction reserves shadow for things that
    // FLOAT, and a card sitting in a grid does not. On hover it lifts, because
    // then it genuinely is above its neighbours (`zIndex: 10`).
    ':hover': {
      zIndex: 10,
      boxShadow: '0 4px 12px -2px var(--color-shadow)',
    },
    ':focus-visible': {
      zIndex: 10,
      boxShadow: '0 0 0 2px var(--color-accent-muted)',
    },
  },
  classTitle: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.6875rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  classTime: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.625rem',
    color: 'var(--color-text-secondary)',
  },
  classSpots: {
    marginTop: '0.125rem',
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.625rem',
    color: 'var(--color-text-secondary)',
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

/** A class positioned within its day column. */
interface PositionedInstance {
  instance: ClassInstanceCard;
  dayIndex: number;
  top: number;
  height: number;
  /** 0-based lane within the day, for side-by-side overlap layout. */
  lane: number;
  /** Total lanes the day uses, so every card in it shares one width. */
  lanes: number;
}

/**
 * Week view: a 7-column (Mon→Sun) time grid with class cards positioned by their
 * start offset and sized by duration. The visible hour band auto-expands to fit
 * the week's earliest/latest classes around a 06:00–22:00 default. Overlapping
 * classes within a day are split into side-by-side lanes so none is hidden.
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
  const { startHour, endHour } = useMemo(
    () => hourBand(instances, timeZone),
    [instances, timeZone],
  );
  const positioned = useMemo(
    () => layoutWeek(instances, week, startHour, timeZone),
    [instances, week, startHour, timeZone],
  );

  const today = new Date();
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const gridHeight = (endHour - startHour) * HOUR_HEIGHT;

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
          <div {...stylex.props(styles.grid)}>
            {/* Header row: empty gutter + weekday headings. */}
            <div {...stylex.props(styles.headGutter)} />
            {days.map((day) => {
              const isToday = isSameDay(day, today);
              return (
                <div
                  key={day.toISOString()}
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

            {/* Body row: hour gutter + 7 day columns. */}
            <div {...stylex.props(styles.gutter)} style={{ height: gridHeight }}>
              {hours.map((hour, i) => (
                <div
                  key={hour}
                  {...stylex.props(styles.gutterLabel)}
                  style={{ top: i * HOUR_HEIGHT }}
                >
                  {`${hour}`.padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {days.map((day, dayIndex) => (
              <div
                key={day.toISOString()}
                {...stylex.props(styles.dayCol)}
                style={{ height: gridHeight }}
              >
                {/* Hour gridlines. */}
                {hours.map((hour, i) => (
                  <div
                    key={hour}
                    {...stylex.props(styles.gridline)}
                    style={{ top: i * HOUR_HEIGHT }}
                  />
                ))}

                {positioned
                  .filter((p) => p.dayIndex === dayIndex)
                  .map((p) => (
                    <ClassCard
                      key={p.instance.id}
                      positioned={p}
                      timeZone={timeZone}
                      spotsLeftLabel={t('card.spotsLeft', {
                        count: Math.max(p.instance.capacity - p.instance.bookedCount, 0),
                      })}
                      onClick={() => onClassClick(p.instance.id)}
                    />
                  ))}
              </div>
            ))}
          </div>
        </Card>
      )}
    </section>
  );
}

/** A single positioned class card inside a day column. */
function ClassCard({
  positioned,
  timeZone,
  spotsLeftLabel,
  onClick,
}: {
  positioned: PositionedInstance;
  timeZone: string;
  spotsLeftLabel: string;
  onClick: () => void;
}) {
  const { instance, top, height, lane, lanes } = positioned;
  const widthPct = 100 / lanes;

  return (
    <button
      type="button"
      onClick={onClick}
      {...stylex.props(styles.classCard)}
      style={{
        top,
        height,
        left: `calc(${lane * widthPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        borderInlineStartColor: instance.color,
      }}
    >
      <span {...stylex.props(styles.classTitle)}>{instance.title}</span>
      <span {...stylex.props(styles.classTime)}>
        {formatZonedTime(instance.startsAt, timeZone)}
      </span>
      {height >= MIN_CARD_HEIGHT * 1.6 ? (
        <span {...stylex.props(styles.classSpots)}>{spotsLeftLabel}</span>
      ) : null}
    </button>
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

/** The visible hour band: the default 06:00–22:00 widened to fit the data. */
function hourBand(
  instances: ClassInstanceCard[],
  timeZone: string,
): { startHour: number; endHour: number } {
  let startHour = DEFAULT_START_HOUR;
  let endHour = DEFAULT_END_HOUR;

  for (const instance of instances) {
    const start = zonedParts(instance.startsAt, timeZone);
    const end = zonedParts(instance.endsAt, timeZone);
    startHour = Math.min(startHour, start.hour);
    // Round the end up to the next whole hour so a 09:30 finish still has room.
    const endRounded = end.minute > 0 ? end.hour + 1 : end.hour;
    endHour = Math.max(endHour, endRounded);
  }

  return {
    startHour: Math.max(0, startHour),
    endHour: Math.min(24, Math.max(endHour, startHour + 1)),
  };
}

/**
 * Position every in-week instance into its day column, splitting same-day
 * overlaps into side-by-side lanes. Cards outside the week window are dropped.
 */
function layoutWeek(
  instances: ClassInstanceCard[],
  week: Date,
  startHour: number,
  timeZone: string,
): PositionedInstance[] {
  const byDay = new Map<number, ClassInstanceCard[]>();
  for (const instance of instances) {
    const dayIndex = zonedDayIndexInWeek(instance.startsAt, dayKey(week), timeZone);
    if (dayIndex === -1) {
      continue;
    }
    const bucket = byDay.get(dayIndex);
    if (bucket) {
      bucket.push(instance);
    } else {
      byDay.set(dayIndex, [instance]);
    }
  }

  const positioned: PositionedInstance[] = [];
  for (const [dayIndex, dayInstances] of byDay) {
    const sorted = [...dayInstances].sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );

    // Greedy lane assignment: reuse the first lane free at this card's start.
    const laneEnds: number[] = [];
    const laneOf = new Map<string, number>();
    for (const instance of sorted) {
      const start = new Date(instance.startsAt).getTime();
      const end = new Date(instance.endsAt).getTime();
      let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(end);
      } else {
        laneEnds[lane] = end;
      }
      laneOf.set(instance.id, lane);
    }
    const lanes = Math.max(laneEnds.length, 1);

    for (const instance of sorted) {
      const startMinutes = zonedMinutesIntoDay(instance.startsAt, timeZone) - startHour * 60;
      const durationMinutes =
        (new Date(instance.endsAt).getTime() - new Date(instance.startsAt).getTime()) / 60000;
      positioned.push({
        instance,
        dayIndex,
        top: (startMinutes / 60) * HOUR_HEIGHT,
        height: Math.max((durationMinutes / 60) * HOUR_HEIGHT, MIN_CARD_HEIGHT),
        lane: laneOf.get(instance.id) ?? 0,
        lanes,
      });
    }
  }

  return positioned;
}
