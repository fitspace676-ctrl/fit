'use client';

import { useEffect, useMemo, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import type { ServiceCard, ServiceSlot } from '@fit/types';
import { Button } from '@/src/components/ui/kit';
import { Icon } from '@/src/components/ui';
import { fetchServiceSlots } from '@/lib/service-sessions';
import {
  addDays,
  addWeeks,
  formatWeekRange,
  formatZonedTime,
  startOfWeek,
  weekDays,
  zonedDayKey,
} from '../classes/date-utils';
import { createDateTimeFormat } from '@fit/i18n';
import { SlotBookingModal } from './SlotBookingModal';

const styles = stylex.create({
  root: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    flexWrap: 'wrap',
  },
  navGroup: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  navBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '2.25rem',
    height: '2.25rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: {
      default: 'var(--color-background-card)',
      ':hover': 'var(--color-overlay-hover)',
    },
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
  },
  navIcon: { width: '1rem', height: '1rem' },
  range: { margin: 0, fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-text-primary)' },
  grid: {
    display: 'grid',
    gap: '0.75rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 1024px)': 'repeat(4, minmax(0, 1fr))',
    },
  },
  day: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '0.875rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-card)',
  },
  dayToday: { borderColor: 'var(--color-accent)' },
  dayHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  dayName: {
    margin: 0,
    fontSize: '0.8125rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  dayDate: { margin: 0, fontSize: '0.75rem', color: 'var(--color-text-secondary)' },
  slots: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.375rem',
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  slot: {
    height: '2.25rem',
    paddingInline: '0.75rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'dashed',
    borderColor: 'var(--color-accent)',
    backgroundColor: { default: 'transparent', ':hover': 'var(--color-accent)' },
    color: { default: 'var(--color-text-primary)', ':hover': 'var(--color-on-accent)' },
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.8125rem',
    fontWeight: 700,
    cursor: 'pointer',
  },
  none: { margin: 0, fontSize: '0.75rem', color: 'var(--color-text-disabled)' },
  status: {
    margin: 0,
    paddingBlock: '2rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  stateBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
    paddingBlock: '2rem',
  },
});

export interface SlotCalendarProps {
  gymId: string;
  service: ServiceCard;
  /** The gym's IANA zone — every slot is a wall-clock time at the gym. */
  timeZone: string;
}

interface LoadState {
  slots: ServiceSlot[];
  status: 'loading' | 'ready' | 'error';
}

/**
 * A service's booking calendar: one week of OPEN slots (the same slots staff
 * opened on the console's PT calendar), stepped week by week. Tapping a slot
 * opens {@link SlotBookingModal}; a booked slot leaves the calendar on refresh.
 */
export function SlotCalendar({ gymId, service, timeZone }: SlotCalendarProps) {
  const t = useTranslations('services.calendar');
  const locale = useLocale();
  const [week, setWeek] = useState(() => startOfWeek(new Date()));
  const [load, setLoad] = useState<LoadState>({ slots: [], status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<ServiceSlot | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoad((prev) => ({ slots: prev.slots, status: 'loading' }));
    fetchServiceSlots({
      gymId,
      serviceId: service.id,
      from: week.toISOString(),
      to: addWeeks(week, 1).toISOString(),
      signal: controller.signal,
    })
      .then((slots) => setLoad({ slots, status: 'ready' }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoad({ slots: [], status: 'error' });
      });
    return () => controller.abort();
  }, [gymId, service.id, week, reloadKey]);

  const days = useMemo(() => weekDays(week), [week]);
  const byDay = useMemo(() => {
    const map = new Map<string, ServiceSlot[]>();
    for (const slot of load.slots) {
      const key = zonedDayKey(slot.startsAt, timeZone);
      const list = map.get(key);
      if (list) list.push(slot);
      else map.set(key, [slot]);
    }
    return map;
  }, [load.slots, timeZone]);
  const todayKey = zonedDayKey(new Date().toISOString(), timeZone);
  const dayName = createDateTimeFormat(locale, { weekday: 'long' });
  const dayDate = createDateTimeFormat(locale, { day: 'numeric', month: 'short' });
  const keyOf = (day: Date) =>
    `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.toolbar)}>
        <div {...stylex.props(styles.navGroup)}>
          <button
            type="button"
            aria-label={t('previousWeek')}
            onClick={() => setWeek((w) => addWeeks(w, -1))}
            {...stylex.props(styles.navBtn)}
          >
            <Icon
              name="arrow"
              sw={2}
              {...stylex.props(styles.navIcon)}
              style={{ transform: 'rotate(180deg)' }}
            />
          </button>
          <button
            type="button"
            aria-label={t('nextWeek')}
            onClick={() => setWeek((w) => addWeeks(w, 1))}
            {...stylex.props(styles.navBtn)}
          >
            <Icon name="arrow" sw={2} {...stylex.props(styles.navIcon)} />
          </button>
          <Button
            variant="secondary"
            size="inline"
            label={t('today')}
            onClick={() => setWeek(startOfWeek(new Date()))}
          />
        </div>
        <p {...stylex.props(styles.range)}>{formatWeekRange(week, locale)}</p>
      </div>

      {load.status === 'error' ? (
        <div {...stylex.props(styles.stateBlock)}>
          <p {...stylex.props(styles.status)}>{t('error')}</p>
          <Button
            variant="secondary"
            size="inline"
            label={t('retry')}
            onClick={() => setReloadKey((k) => k + 1)}
          />
        </div>
      ) : (
        <div {...stylex.props(styles.grid)} aria-busy={load.status === 'loading'}>
          {days.map((day) => {
            const key = keyOf(day);
            const slots = byDay.get(key) ?? [];
            const isToday = key === todayKey;
            return (
              <section key={key} {...stylex.props(styles.day, isToday && styles.dayToday)}>
                <div {...stylex.props(styles.dayHead)}>
                  <h3 {...stylex.props(styles.dayName)}>{dayName.format(day)}</h3>
                  <p {...stylex.props(styles.dayDate)}>{dayDate.format(day)}</p>
                </div>
                {slots.length === 0 ? (
                  <p {...stylex.props(styles.none)}>
                    {load.status === 'loading' ? t('loading') : t('noSlots')}
                  </p>
                ) : (
                  <ul {...stylex.props(styles.slots)}>
                    {slots.map((slot) => (
                      <li key={slot.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(slot)}
                          {...stylex.props(styles.slot)}
                        >
                          {formatZonedTime(slot.startsAt, timeZone)}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {selected ? (
        <SlotBookingModal
          slot={selected}
          service={service}
          timeZone={timeZone}
          onClose={() => setSelected(null)}
          onBooked={() => setReloadKey((k) => k + 1)}
        />
      ) : null}
    </div>
  );
}

// `addDays` is re-exported for callers building windows around the calendar.
export { addDays };
