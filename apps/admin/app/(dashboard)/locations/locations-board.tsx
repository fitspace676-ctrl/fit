'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { AdminLocationRow, LocationStatus } from '@fit/types';
import {
  Badge,
  Card,
  CountUp,
  Dot,
  FilterChips,
  Icon,
  buttonClasses,
  useToast,
  type FilterChip,
  type IconName,
  type Tone,
} from '@/components/ui';
import { formatDayHours, hoursForDate, isOpenAt } from './format-hours';
import { setLocationActiveAction } from './actions';

/** One roster KPI card — icon tile, animated headline value, and label. */
function KpiCard({
  label,
  value,
  suffix,
  context,
  icon,
}: {
  label: string;
  value: number;
  suffix?: string;
  context: string;
  icon: IconName;
}) {
  return (
    <Card className="flex h-full flex-col p-5">
      <span className="grid h-10 w-10 place-items-center rounded-btn bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <p className="mt-4 font-display text-3xl font-extrabold tabular-nums tracking-tight text-ink-900 dark:text-white">
        <CountUp to={value} suffix={suffix} />
      </p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
        {label}
      </p>
      <p className="mt-2 text-xs tabular-nums text-ink-500 dark:text-ink-400">{context}</p>
    </Card>
  );
}

/** The live open/closed (or inactive) treatment for one location's card badge. */
interface OpenState {
  tone: Tone;
  dot: string;
  label: string;
}

/**
 * The locations board (T2.11) — the client half of the locations screen, rebuilt
 * to the formacore locations artboard. Renders the breadcrumb + header (with the
 * "New location" CTA for `LocationWrite` staff), the four gym-wide KPI cards, a
 * status filter + search, and the location card grid (photo, live open/closed
 * badge, today's hours, amenities, and a row menu wiring the activate/deactivate
 * and edit actions). Gyms run a handful of branches, so the whole (already-small)
 * roster is passed in and filtered client-side; the "open now" state is derived
 * from each location's weekly hours against the viewer's clock, refreshed each
 * minute. Lifecycle mutations run through a Server Action and refresh the route,
 * so the grid reflects the API's view rather than optimistic local state.
 */
export function LocationsBoard({
  locations,
  canWrite,
}: {
  locations: AdminLocationRow[];
  canWrite: boolean;
}) {
  const t = useTranslations('admin.locations');
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<LocationStatus | ''>('');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // The current instant drives the live open/closed derivation. It stays `null`
  // through the first (server + hydration) render so the markup matches, then
  // ticks each minute once mounted on the client.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuFor(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const activeCount = useMemo(
    () => locations.filter((location) => location.status === 'ACTIVE').length,
    [locations],
  );
  const inactiveCount = locations.length - activeCount;
  const amenitiesCount = useMemo(
    () => new Set(locations.flatMap((location) => location.amenities)).size,
    [locations],
  );
  const openNowCount = useMemo(
    () =>
      now === null
        ? 0
        : locations.filter(
            (location) => location.status === 'ACTIVE' && isOpenAt(location.hours, now),
          ).length,
    [locations, now],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return locations.filter((location) => {
      const matchesStatus = statusFilter === '' || location.status === statusFilter;
      const matchesSearch =
        needle === '' ||
        location.name.toLowerCase().includes(needle) ||
        location.address.toLowerCase().includes(needle);
      return matchesStatus && matchesSearch;
    });
  }, [locations, query, statusFilter]);

  const statusChips: FilterChip[] = [
    { label: t('filters.all'), value: '', count: locations.length },
    { label: t('status.ACTIVE'), value: 'ACTIVE', count: activeCount },
    { label: t('status.INACTIVE'), value: 'INACTIVE', count: inactiveCount },
  ];

  /** The badge treatment for a card: inactive lifecycle wins, else live open/closed. */
  function openStateOf(location: AdminLocationRow): OpenState {
    if (location.status === 'INACTIVE') {
      return { tone: 'ink', dot: 'bg-ink-400', label: t('card.inactive') };
    }
    if (now === null) {
      // Pre-mount: fall back to the lifecycle label (it is active) until the
      // client clock resolves the live open/closed state.
      return { tone: 'success', dot: 'bg-success-400', label: t('status.ACTIVE') };
    }
    return isOpenAt(location.hours, now)
      ? { tone: 'success', dot: 'bg-success-400', label: t('card.open') }
      : { tone: 'ink', dot: 'bg-ink-400', label: t('card.closed') };
  }

  /** Today's hours as a short line, or `null` before the client clock resolves. */
  function todayLine(location: AdminLocationRow): string | null {
    if (now === null) return null;
    const day = hoursForDate(location.hours, now);
    return day.closed ? t('card.todayClosed') : t('card.todayOpen', { hours: formatDayHours(day) });
  }

  function setActive(location: AdminLocationRow, active: boolean): void {
    setMenuFor(null);
    setBusyId(location.id);
    startTransition(async () => {
      const result = await setLocationActiveAction(location.id, active);
      setBusyId(null);
      if (result.ok) {
        toast(
          active
            ? t('toast.activated', { name: location.name })
            : t('toast.deactivated', { name: location.name }),
          { tone: 'success', icon: 'check' },
        );
        router.refresh();
      } else {
        toast(result.error || t('toast.actionFailed'), { tone: 'danger', icon: 'info' });
      }
    });
  }

  const noMatch = locations.length > 0 && visible.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <nav
        aria-label={t('breadcrumb.label')}
        className="flex items-center gap-1.5 text-xs font-medium text-ink-400 dark:text-ink-500"
      >
        <span>Iron Gym</span>
        <Icon name="chevronRight" className="h-3.5 w-3.5" />
        <span className="text-ink-600 dark:text-ink-300">{t('breadcrumb.locations')}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
            {t('title')}
          </h1>
          <p className="max-w-2xl text-sm text-ink-500 dark:text-ink-400">{t('subtitle')}</p>
        </div>
        {canWrite ? (
          <Link href="/locations/new" className={buttonClasses('primary', 'md')}>
            <Icon name="plus" className="h-4 w-4" sw={2} />
            {t('add')}
          </Link>
        ) : null}
      </header>

      {/* Gym-wide KPI cards — live aggregates over the whole roster. */}
      <section aria-label={t('title')} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label={t('kpi.total')}
          value={locations.length}
          context={t('kpi.totalContext', { count: activeCount })}
          icon="pin"
        />
        <KpiCard
          label={t('kpi.active')}
          value={activeCount}
          context={t('kpi.activeContext')}
          icon="bolt"
        />
        <KpiCard
          label={t('kpi.openNow')}
          value={openNowCount}
          context={t('kpi.openNowContext')}
          icon="clock"
        />
        <KpiCard
          label={t('kpi.amenities')}
          value={amenitiesCount}
          context={t('kpi.amenitiesContext')}
          icon="spark"
        />
      </section>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterChips
          chips={statusChips}
          active={statusFilter}
          onSelect={(value) => setStatusFilter(value as LocationStatus | '')}
          ariaLabel={t('filters.statusAria')}
        />
        <div className="relative lg:w-72">
          <label htmlFor="location-search" className="sr-only">
            {t('filters.searchLabel')}
          </label>
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-400">
            <Icon name="search" className="h-4 w-4" />
          </span>
          <input
            id="location-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('filters.searchPlaceholder')}
            className="h-11 w-full rounded-field border border-ink-200 bg-white pl-9 pr-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 px-4 py-12 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-btn bg-ink-100 text-ink-400 dark:bg-white/5 dark:text-ink-500">
            <Icon name={noMatch ? 'search' : 'pin'} className="h-5 w-5" />
          </span>
          <p className="text-sm font-semibold text-ink-700 dark:text-ink-200">
            {noMatch ? t('empty.noMatchTitle') : t('empty.emptyTitle')}
          </p>
          <p className="max-w-sm text-sm text-ink-500 dark:text-ink-400">
            {noMatch ? t('empty.noMatchHint') : t('empty.emptyHint')}
          </p>
        </Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((location) => {
            const open = openStateOf(location);
            const today = todayLine(location);
            const rowBusy = busyId === location.id && pending;
            return (
              <Card key={location.id} className="flex flex-col">
                {/* Photo header with the identity overlay, status badge and row menu. */}
                <div className="relative h-36">
                  {location.photoUrl ? (
                    <img
                      src={location.photoUrl}
                      alt={location.name}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-brand-500/20 to-accent-500/20 text-brand-500 dark:text-brand-300">
                      <Icon name="pin" className="h-8 w-8" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-ink-950/80 via-ink-950/20 to-transparent" />

                  <div className="absolute left-3 top-3">
                    <Badge tone={open.tone} className="gap-1.5">
                      <Dot c={open.dot} />
                      {open.label}
                    </Badge>
                  </div>

                  {canWrite ? (
                    <div className="absolute right-2 top-2">
                      <div className="relative flex justify-end">
                        <button
                          type="button"
                          aria-label={t('rowMenu.open', { name: location.name })}
                          aria-haspopup="menu"
                          aria-expanded={menuFor === location.id}
                          disabled={rowBusy}
                          onClick={() => setMenuFor(menuFor === location.id ? null : location.id)}
                          className="grid h-9 w-9 place-items-center rounded-btn bg-ink-950/30 text-white/90 backdrop-blur transition hover:bg-ink-950/50 disabled:opacity-50"
                        >
                          <Icon name="settings" className="h-5 w-5" />
                        </button>
                        {menuFor === location.id ? (
                          <>
                            <div
                              className="fixed inset-0 z-30"
                              aria-hidden
                              onClick={() => setMenuFor(null)}
                            />
                            <div
                              role="menu"
                              className="absolute right-0 top-10 z-40 w-44 rounded-card border border-ink-200 bg-white p-1.5 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.35)] dark:border-white/10 dark:bg-ink-900/95 dark:backdrop-blur-xl"
                            >
                              <Link
                                href={`/locations/${location.id}`}
                                role="menuitem"
                                onClick={() => setMenuFor(null)}
                                className="flex h-9 w-full items-center gap-2.5 rounded-btn px-2.5 text-left text-sm font-medium text-ink-600 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-white/[0.06]"
                              >
                                <Icon name="search" className="h-4 w-4" />
                                {t('rowMenu.view')}
                              </Link>
                              <Link
                                href={`/locations/${location.id}/edit`}
                                role="menuitem"
                                onClick={() => setMenuFor(null)}
                                className="flex h-9 w-full items-center gap-2.5 rounded-btn px-2.5 text-left text-sm font-medium text-ink-600 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-white/[0.06]"
                              >
                                <Icon name="settings" className="h-4 w-4" />
                                {t('rowMenu.edit')}
                              </Link>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => setActive(location, location.status !== 'ACTIVE')}
                                className="flex h-9 w-full items-center gap-2.5 rounded-btn px-2.5 text-left text-sm font-medium text-ink-600 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-white/[0.06]"
                              >
                                <Icon
                                  name={location.status === 'ACTIVE' ? 'lock' : 'check'}
                                  className="h-4 w-4"
                                />
                                {location.status === 'ACTIVE'
                                  ? t('rowMenu.deactivate')
                                  : t('rowMenu.activate')}
                              </button>
                            </div>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <div className="absolute inset-x-4 bottom-3">
                    <Link
                      href={`/locations/${location.id}`}
                      className="font-display text-lg font-extrabold tracking-tight text-white hover:underline"
                    >
                      {location.name}
                    </Link>
                    <p className="flex items-center gap-1.5 text-xs text-white/75">
                      <Icon name="pin" className="h-3.5 w-3.5" sw={2} />
                      {location.address || t('card.noAddress')}
                    </p>
                  </div>
                </div>

                {/* Body: today's hours, phone, and the amenities chips. */}
                <div className="flex flex-1 flex-col gap-4 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="inline-flex items-center gap-1.5 text-ink-600 dark:text-ink-300">
                      <Icon name="clock" className="h-4 w-4 text-ink-400" sw={2} />
                      {today ?? '—'}
                    </span>
                    {location.phone ? (
                      <span className="inline-flex items-center gap-1.5 text-ink-600 dark:text-ink-300">
                        <Icon name="bell" className="h-4 w-4 text-ink-400" sw={2} />
                        {location.phone}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                    {location.amenities.length > 0 ? (
                      location.amenities.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex h-7 items-center rounded-pill bg-ink-100 px-2.5 text-[11px] font-semibold text-ink-600 dark:bg-white/10 dark:text-ink-300"
                        >
                          {tag}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-ink-400">{t('card.noAmenities')}</span>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
