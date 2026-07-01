'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { ClassInstanceCard } from '@fit/types';
import { Btn, Card } from '@/src/components/ui';
import { EmptyClasses } from './EmptyClasses';
import {
  addWeeks,
  dayIndexInWeek,
  formatTime,
  formatWeekRange,
  isSameDay,
  minutesIntoDay,
  startOfWeek,
  weekDays,
} from './date-utils';

/** Pixels per hour row — drives both the gutter scale and card positioning. */
const HOUR_HEIGHT = 56;
/** Default visible band (06:00–22:00) when the data doesn't push it wider. */
const DEFAULT_START_HOUR = 6;
const DEFAULT_END_HOUR = 22;
/** Floor on a card's rendered height so a short class stays readable/clickable. */
const MIN_CARD_HEIGHT = 28;

export interface WeekCalendarProps {
  instances: ClassInstanceCard[];
  /** Monday 00:00 (local) of the week being shown. */
  week: Date;
  /** Called with the new week start when the visitor steps back/forward / to today. */
  onWeekChange: (week: Date) => void;
  /** Called with a class id when its card is clicked. */
  onClassClick: (id: string) => void;
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
export function WeekCalendar({ instances, week, onWeekChange, onClassClick }: WeekCalendarProps) {
  const t = useTranslations('classes');
  const locale = useLocale();

  const days = useMemo(() => weekDays(week), [week]);
  const { startHour, endHour } = useMemo(() => hourBand(instances), [instances]);
  const positioned = useMemo(
    () => layoutWeek(instances, week, startHour),
    [instances, week, startHour],
  );

  const today = new Date();
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const gridHeight = (endHour - startHour) * HOUR_HEIGHT;

  return (
    <section aria-label={t('weekView.label')} className="flex flex-col gap-4">
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
        <Card glow className="overflow-x-auto p-0">
          <div className="grid min-w-[720px] grid-cols-[3.5rem_repeat(7,1fr)]">
            {/* Header row: empty gutter + weekday headings. */}
            <div className="border-b border-ink-200 dark:border-white/10" />
            {days.map((day) => {
              const isToday = isSameDay(day, today);
              return (
                <div
                  key={day.toISOString()}
                  className={`border-b border-l border-ink-200 px-2 py-2 text-center dark:border-white/10 ${
                    isToday ? 'bg-brand-50 dark:bg-brand-400/10' : ''
                  }`}
                >
                  <p className="text-xs uppercase tracking-wide text-ink-400">
                    {day.toLocaleDateString(locale, { weekday: 'short' })}
                  </p>
                  <p
                    className={`font-mono text-sm font-bold tabular-nums ${
                      isToday
                        ? 'text-brand-700 dark:text-brand-300'
                        : 'text-ink-900 dark:text-white'
                    }`}
                  >
                    {day.getDate()}
                  </p>
                </div>
              );
            })}

            {/* Body row: hour gutter + 7 day columns. */}
            <div className="relative" style={{ height: gridHeight }}>
              {hours.map((hour, i) => (
                <div
                  key={hour}
                  className="absolute right-1 -translate-y-1/2 font-mono text-[11px] tabular-nums text-ink-400"
                  style={{ top: i * HOUR_HEIGHT }}
                >
                  {`${hour}`.padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {days.map((day, dayIndex) => (
              <div
                key={day.toISOString()}
                className="relative border-l border-ink-200 dark:border-white/10"
                style={{ height: gridHeight }}
              >
                {/* Hour gridlines. */}
                {hours.map((hour, i) => (
                  <div
                    key={hour}
                    className="absolute inset-x-0 border-t border-ink-100 dark:border-white/5"
                    style={{ top: i * HOUR_HEIGHT }}
                  />
                ))}

                {positioned
                  .filter((p) => p.dayIndex === dayIndex)
                  .map((p) => (
                    <ClassCard
                      key={p.instance.id}
                      positioned={p}
                      locale={locale}
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
  locale,
  spotsLeftLabel,
  onClick,
}: {
  positioned: PositionedInstance;
  locale: string;
  spotsLeftLabel: string;
  onClick: () => void;
}) {
  const { instance, top, height, lane, lanes } = positioned;
  const widthPct = 100 / lanes;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        top,
        height,
        left: `calc(${lane * widthPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        borderInlineStartColor: instance.color,
      }}
      className="absolute overflow-hidden rounded-btn border border-ink-200 border-l-[3px] bg-white px-1.5 py-1 text-left shadow-sm transition-shadow hover:z-10 hover:shadow-md focus:z-10 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-white/10 dark:bg-white/[0.06]"
    >
      <span className="block truncate text-[11px] font-bold text-ink-900 dark:text-white">
        {instance.title}
      </span>
      <span className="block truncate font-mono text-[10px] text-ink-500 dark:text-ink-400">
        {formatTime(instance.startsAt, locale)}
      </span>
      {height >= MIN_CARD_HEIGHT * 1.6 ? (
        <span className="mt-0.5 block truncate text-[10px] text-ink-400">{spotsLeftLabel}</span>
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
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-1.5">
        <Btn v="outline" size="icon" icon="chevronLeft" aria-label={prevLabel} onClick={onPrev} />
        <Btn v="outline" size="icon" icon="chevronRight" aria-label={nextLabel} onClick={onNext} />
        <p className="ml-2 font-display text-sm font-bold text-ink-900 dark:text-white">{label}</p>
      </div>
      <Btn v="outline" size="sm" onClick={onToday}>
        {todayLabel}
      </Btn>
    </div>
  );
}

/** The visible hour band: the default 06:00–22:00 widened to fit the data. */
function hourBand(instances: ClassInstanceCard[]): { startHour: number; endHour: number } {
  let startHour = DEFAULT_START_HOUR;
  let endHour = DEFAULT_END_HOUR;

  for (const instance of instances) {
    const start = new Date(instance.startsAt);
    const end = new Date(instance.endsAt);
    startHour = Math.min(startHour, start.getHours());
    // Round the end up to the next whole hour so a 09:30 finish still has room.
    const endRounded = end.getMinutes() > 0 ? end.getHours() + 1 : end.getHours();
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
): PositionedInstance[] {
  const byDay = new Map<number, ClassInstanceCard[]>();
  for (const instance of instances) {
    const dayIndex = dayIndexInWeek(instance.startsAt, week);
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
      const startMinutes = minutesIntoDay(instance.startsAt) - startHour * 60;
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
