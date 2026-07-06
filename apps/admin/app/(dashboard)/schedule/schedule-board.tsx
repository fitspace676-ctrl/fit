'use client';

import { useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type { AdminScheduleInstance, ClassInstanceStatus } from '@fit/types';
import { Badge, Btn, Icon, type Tone } from '@/components/ui';
import { Card } from '@astryxdesign/core/Card';
import { useOccupancyStream } from '@/hooks/use-occupancy-stream';
import { ClassDrawer } from './class-drawer';
import { addWeeks, mondayOf, toIsoDate, weekDays } from './week';

type T = ReturnType<typeof useTranslations>;

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
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
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  filterGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem',
  },
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
  dayHeader: {
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
  dayHeaderToday: {
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent-muted)',
  },
  weekdayLabel: {
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: 'var(--color-text-secondary)',
  },
  dayNum: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.125rem',
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  dayNumToday: {
    color: 'var(--color-text-accent)',
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
    <div {...stylex.props(styles.root)}>
      {/* Toolbar: week navigation + filters. */}
      <div {...stylex.props(styles.toolbar)}>
        <div {...stylex.props(styles.navGroup)}>
          <div {...stylex.props(styles.navBox)}>
            <button
              type="button"
              aria-label={t('toolbar.prev')}
              onClick={() => goToWeek(addWeeks(monday, -1))}
              {...stylex.props(styles.navBtn)}
            >
              <Icon name="chevronLeft" {...stylex.props(styles.navBtnIcon)} />
            </button>
            <button
              type="button"
              aria-label={t('toolbar.next')}
              onClick={() => goToWeek(addWeeks(monday, 1))}
              {...stylex.props(styles.navBtn)}
            >
              <Icon name="chevronRight" {...stylex.props(styles.navBtnIcon)} />
            </button>
          </div>
          <Btn v="outline" size="sm" icon="calendar" onClick={() => goToWeek(mondayOf(new Date()))}>
            {t('toolbar.today')}
          </Btn>
          <p {...stylex.props(styles.rangeLabel)}>{rangeLabel}</p>
        </div>

        <div aria-label={t('filters.aria')} {...stylex.props(styles.filterGroup)} role="group">
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
        <div {...stylex.props(styles.gridScroll)}>
          <div role="grid" aria-label={t('week.gridAria')} {...stylex.props(styles.grid)}>
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
    <div role="gridcell" {...stylex.props(styles.column)}>
      <div {...stylex.props(styles.dayHeader, isToday && styles.dayHeaderToday)}>
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
        time: formatTime(instance.startsAt, locale),
      })}
      {...stylex.props(styles.card, canceled && styles.cardCanceled)}
    >
      {/* Category colour accent rail. */}
      <span
        aria-hidden
        {...stylex.props(styles.accentRail)}
        style={{ backgroundColor: instance.color }}
      />

      <div {...stylex.props(styles.timeRow)}>
        <Icon name="clock" sw={2} {...stylex.props(styles.smallIcon)} />
        <span {...stylex.props(styles.mono)}>
          {formatTime(instance.startsAt, locale)}–{formatTime(instance.endsAt, locale)}
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

      {/* Occupancy: a compact fill bar over "booked / capacity". */}
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
