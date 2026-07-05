'use client';

import { useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import type { AdminScheduleInstance, ClassInstanceStatus } from '@fit/types';
import { Badge, Btn, Card, Icon, type Tone } from '@/components/ui';
import { useOccupancyStream } from '@/hooks/use-occupancy-stream';
import { ClassDrawer } from './class-drawer';
import { addWeeks, mondayOf, toIsoDate, weekDays } from './week';

type T = ReturnType<typeof useTranslations>;

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
 * The staff schedule week calendar (T3.2). Server-rendered occurrences for the
 * visible week are bucketed into seven day columns and drawn as class cards with
 * their occupancy, trainer, branch, and status. The toolbar pages between weeks
 * and filters by trainer / location — all state lives in the URL (`?week`,
 * `?trainerId`, `?locationId`) so the server refetches the right window and the
 * view is shareable and back-button friendly.
 *
 * Everything is computed in UTC (see `week.ts`): occurrences are generated at UTC
 * midnight and the console has no gym-timezone plumbing, so bucketing and time
 * labels stay consistent with the data and free of hydration drift.
 */
export function ScheduleBoard({
  weekStart,
  instances,
  trainers,
  locations,
  trainerId,
  locationId,
  canWrite,
}: {
  /** The visible week's Monday, `YYYY-MM-DD` (UTC). */
  weekStart: string;
  instances: AdminScheduleInstance[];
  trainers: ScheduleOption[];
  locations: ScheduleOption[];
  trainerId: string;
  locationId: string;
  /** Whether the staff session holds `ClassWrite` (gates the drawer's cancel). */
  canWrite: boolean;
}) {
  const t = useTranslations('admin.schedule');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Live occupancy (T8.10): refresh the week grid as members book / cancel and the
  // desk promotes, pushed over SSE — replacing the schedule's need to poll.
  useOccupancyStream();

  // The occurrence whose detail drawer is open (null when closed). The clicked
  // block renders the drawer header instantly while its roster is fetched.
  const [selected, setSelected] = useState<AdminScheduleInstance | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openInstance = useCallback((instance: AdminScheduleInstance) => {
    setSelected(instance);
    setDrawerOpen(true);
  }, []);

  const monday = useMemo(() => new Date(`${weekStart}T00:00:00.000Z`), [weekStart]);
  const days = useMemo(() => weekDays(monday), [monday]);

  // Bucket each occurrence under its UTC day key; the API already returns them
  // ordered by `startsAt`, so each column stays chronological without re-sorting.
  const byDay = useMemo(() => {
    const map = new Map<string, AdminScheduleInstance[]>();
    for (const instance of instances) {
      const key = instance.startsAt.slice(0, 10);
      const bucket = map.get(key);
      if (bucket) {
        bucket.push(instance);
      } else {
        map.set(key, [instance]);
      }
    }
    return map;
  }, [instances]);

  const todayKey = toIsoDate(new Date());

  /** Push a new URL with one search param set (or removed when empty). */
  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value === null || value === '') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const goToWeek = useCallback(
    (mondayDate: Date) => setParam('week', toIsoDate(mondayDate)),
    [setParam],
  );

  const rangeLabel = formatRange(days[0]!, days[days.length - 1]!, locale);
  const hasFilters = trainerId !== '' || locationId !== '';

  return (
    <div className="flex flex-col gap-6">
      {/* Toolbar: week navigation + filters. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-btn border border-ink-200 bg-white p-0.5 dark:border-white/10 dark:bg-white/[0.04]">
            <button
              type="button"
              aria-label={t('toolbar.prev')}
              onClick={() => goToWeek(addWeeks(monday, -1))}
              className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-white/5 dark:hover:text-white"
            >
              <Icon name="chevronLeft" className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={t('toolbar.next')}
              onClick={() => goToWeek(addWeeks(monday, 1))}
              className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-white/5 dark:hover:text-white"
            >
              <Icon name="chevronRight" className="h-4 w-4" />
            </button>
          </div>
          <Btn v="outline" size="sm" icon="calendar" onClick={() => goToWeek(mondayOf(new Date()))}>
            {t('toolbar.today')}
          </Btn>
          <p className="ml-1 font-display text-base font-bold text-ink-900 dark:text-white">
            {rangeLabel}
          </p>
        </div>

        <div
          aria-label={t('filters.aria')}
          className="flex flex-wrap items-center gap-2"
          role="group"
        >
          <FilterSelect
            label={t('filters.trainer')}
            value={trainerId}
            allLabel={t('filters.allTrainers')}
            options={trainers}
            onChange={(value) => setParam('trainerId', value)}
          />
          <FilterSelect
            label={t('filters.location')}
            value={locationId}
            allLabel={t('filters.allLocations')}
            options={locations}
            onChange={(value) => setParam('locationId', value)}
          />
          {hasFilters ? (
            <Btn
              v="ghost"
              size="sm"
              icon="x"
              onClick={() => {
                const next = new URLSearchParams(searchParams.toString());
                next.delete('trainerId');
                next.delete('locationId');
                const qs = next.toString();
                router.push(qs ? `${pathname}?${qs}` : pathname);
              }}
            >
              {t('filters.clear')}
            </Btn>
          ) : null}
        </div>
      </div>

      {instances.length === 0 ? (
        <EmptyWeek t={t} filtered={hasFilters} />
      ) : (
        <div className="overflow-x-auto pb-1">
          <div
            role="grid"
            aria-label={t('week.gridAria')}
            className="grid min-w-[52rem] grid-cols-7 gap-3"
          >
            {days.map((day) => {
              const key = toIsoDate(day);
              return (
                <DayColumn
                  key={key}
                  day={day}
                  isToday={key === todayKey}
                  instances={byDay.get(key) ?? []}
                  locale={locale}
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
      />
    </div>
  );
}

/** One day's column: a weekday header over its stacked class cards. */
function DayColumn({
  day,
  isToday,
  instances,
  locale,
  t,
  onOpen,
}: {
  day: Date;
  isToday: boolean;
  instances: AdminScheduleInstance[];
  locale: string;
  t: T;
  onOpen: (instance: AdminScheduleInstance) => void;
}) {
  return (
    <div role="gridcell" className="flex min-w-0 flex-col gap-2">
      <div
        className={`flex flex-col items-center rounded-btn border py-2 ${
          isToday
            ? 'border-brand-500/40 bg-brand-50 dark:border-brand-500/30 dark:bg-brand-500/10'
            : 'border-ink-100 bg-ink-50/60 dark:border-white/5 dark:bg-white/[0.02]'
        }`}
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
          {weekdayShort(day, locale)}
        </span>
        <span
          className={`font-display text-lg font-extrabold tabular-nums ${
            isToday ? 'text-brand-600 dark:text-brand-300' : 'text-ink-900 dark:text-white'
          }`}
        >
          {day.getUTCDate()}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {instances.length === 0 ? (
          <p className="rounded-card border border-dashed border-ink-100 py-6 text-center text-xs text-ink-300 dark:border-white/5 dark:text-ink-600">
            {t('empty.day')}
          </p>
        ) : (
          instances.map((instance) => (
            <ClassCard
              key={instance.id}
              instance={instance}
              locale={locale}
              t={t}
              onOpen={onOpen}
            />
          ))
        )}
      </div>
    </div>
  );
}

/** One class occurrence block: time, title, trainer/branch, occupancy, status.
 * Clicking it opens the detail drawer (roster + quick actions, T3.3). */
function ClassCard({
  instance,
  locale,
  t,
  onOpen,
}: {
  instance: AdminScheduleInstance;
  locale: string;
  t: T;
  onOpen: (instance: AdminScheduleInstance) => void;
}) {
  const remaining = Math.max(0, instance.capacity - instance.bookedCount);
  const pct = instance.capacity > 0 ? (instance.bookedCount / instance.capacity) * 100 : 0;
  const barTone = pct > 85 ? 'bg-danger-500' : pct > 60 ? 'bg-warning-500' : 'bg-success-500';
  const statusTone = STATUS_TONES[instance.status];
  const canceled = instance.status === 'CANCELED';

  return (
    <button
      type="button"
      onClick={() => onOpen(instance)}
      aria-label={t('card.viewAria', {
        title: instance.title,
        time: formatTime(instance.startsAt, locale),
      })}
      className={`group relative flex w-full flex-col gap-2 overflow-hidden rounded-card border border-ink-100 bg-white p-2.5 pl-3 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:-translate-y-0.5 hover:border-ink-200 hover:shadow-[0_12px_30px_-14px_rgba(0,0,0,0.28)] focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/20 ${
        canceled ? 'opacity-70' : ''
      }`}
    >
      {/* Category colour accent rail. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: instance.color }}
      />

      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-500 dark:text-ink-400">
        <Icon name="clock" className="h-3.5 w-3.5 shrink-0" sw={2} />
        <span className="tabular-nums">
          {formatTime(instance.startsAt, locale)}–{formatTime(instance.endsAt, locale)}
        </span>
      </div>

      <p
        className={`text-sm font-bold leading-tight text-ink-900 dark:text-white ${
          canceled ? 'line-through' : ''
        }`}
      >
        {instance.title}
      </p>

      <div className="flex flex-col gap-1 text-[11px] text-ink-500 dark:text-ink-400">
        {instance.trainerName ? (
          <span className="flex items-center gap-1.5 truncate">
            <Icon name="user" className="h-3.5 w-3.5 shrink-0" sw={2} />
            <span className="truncate">{instance.trainerName}</span>
          </span>
        ) : null}
        {instance.locationName || instance.room ? (
          <span className="flex items-center gap-1.5 truncate">
            <Icon name="pin" className="h-3.5 w-3.5 shrink-0" sw={2} />
            <span className="truncate">
              {[instance.locationName, instance.room].filter(Boolean).join(' · ')}
            </span>
          </span>
        ) : null}
      </div>

      {/* Occupancy: a compact fill bar over "booked / capacity". */}
      <div className="mt-0.5 flex flex-col gap-1">
        <div className="flex items-center justify-between text-[11px] font-semibold">
          <span className="text-ink-600 dark:text-ink-300">
            {t('card.spots', { booked: instance.bookedCount, cap: instance.capacity })}
          </span>
          <span className="text-ink-400">
            {remaining === 0 ? t('card.full') : t('card.remaining', { remaining })}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-pill bg-ink-100 dark:bg-white/10">
          <div
            className={`h-full rounded-pill ${barTone}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      </div>

      {statusTone ? (
        <Badge tone={statusTone} className="self-start">
          {t(`status.${instance.status}`)}
        </Badge>
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
    <label className="inline-flex items-center gap-2">
      <span className="sr-only">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 appearance-none rounded-field border border-ink-200 bg-white pl-3 pr-9 text-sm font-medium text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
        >
          <option value="">{allLabel}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <Icon
          name="chevronDown"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
        />
      </div>
    </label>
  );
}

/** The empty state — no occurrences in the visible week (optionally filtered). */
function EmptyWeek({ t, filtered }: { t: T; filtered: boolean }) {
  return (
    <Card className="grid place-items-center py-16 text-center">
      <div className="flex max-w-sm flex-col items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-ink-100 text-ink-400 dark:bg-white/5">
          <Icon name="calendar" className="h-6 w-6" />
        </span>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          {filtered ? t('empty.filtered') : t('empty.week')}
        </p>
      </div>
    </Card>
  );
}

/** Localised weekday abbreviation for a UTC day anchor (e.g. "Mon"). */
function weekdayShort(day: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(day);
}

/** Localised `HH:MM` for an ISO instant, read in UTC to match the data anchor. */
function formatTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(iso));
}

/** A compact "Jun 30 – Jul 6, 2026" span for the week, both anchors in UTC. */
function formatRange(start: Date, end: Date, locale: string): string {
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const startFmt = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(start);
  const endFmt = new Intl.DateTimeFormat(locale, {
    month: sameMonth ? undefined : 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(end);
  return `${startFmt} – ${endFmt}`;
}
