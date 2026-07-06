'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import type { AdminLocationRow, LocationStatus } from '@fit/types';
import {
  Badge,
  CountUp,
  FilterChips,
  Icon,
  useToast,
  type FilterChip,
  type IconName,
  type Tone,
} from '@/components/ui';
import { formatDayHours, hoursForDate, isOpenAt } from './format-hours';
import { setLocationActiveAction } from './actions';

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  crumbIcon: {
    width: '0.875rem',
    height: '0.875rem',
  },
  crumbCurrent: {
    color: 'var(--color-text-primary)',
  },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  headText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    maxWidth: '42rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  addLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    height: '2.75rem',
    paddingInline: '1.25rem',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
    fontSize: '0.875rem',
    fontWeight: 600,
    textDecoration: 'none',
  },
  addIcon: {
    width: '1rem',
    height: '1rem',
  },
  kpiSection: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 1024px)': 'repeat(4, minmax(0, 1fr))',
    },
  },
  kpiCard: {
    display: 'flex',
    height: '100%',
    flexDirection: 'column',
    padding: '1.25rem',
  },
  kpiIcon: {
    display: 'grid',
    height: '2.5rem',
    width: '2.5rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  kpiIconSvg: {
    width: '1.25rem',
    height: '1.25rem',
  },
  kpiValue: {
    margin: 0,
    marginTop: '1rem',
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.875rem',
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  kpiLabel: {
    margin: 0,
    marginTop: '0.25rem',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  kpiContext: {
    margin: 0,
    marginTop: '0.5rem',
    fontSize: '0.75rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  filterRow: {
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
    gap: '0.75rem',
  },
  searchWrap: {
    position: 'relative',
    width: {
      default: 'auto',
      '@media (min-width: 1024px)': '18rem',
    },
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
  searchIcon: {
    pointerEvents: 'none',
    position: 'absolute',
    insetBlock: 0,
    left: '0.75rem',
    display: 'flex',
    alignItems: 'center',
    color: 'var(--color-icon-secondary)',
  },
  searchIconSvg: {
    width: '1rem',
    height: '1rem',
  },
  searchInput: {
    height: '2.75rem',
    width: '100%',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: 'var(--color-background-surface)',
    paddingLeft: '2.25rem',
    paddingRight: '0.875rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
    outline: 'none',
    '::placeholder': {
      color: 'var(--color-text-secondary)',
    },
  },
  emptyCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
    paddingInline: '1rem',
    paddingBlock: '3rem',
    textAlign: 'center',
  },
  emptyIcon: {
    display: 'grid',
    height: '2.75rem',
    width: '2.75rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-muted)',
    color: 'var(--color-icon-secondary)',
  },
  emptyIconSvg: {
    width: '1.25rem',
    height: '1.25rem',
  },
  emptyTitle: {
    margin: 0,
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  emptyHint: {
    margin: 0,
    maxWidth: '24rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  grid: {
    display: 'grid',
    gap: '1.25rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 768px)': 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 1280px)': 'repeat(3, minmax(0, 1fr))',
    },
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  photoHead: {
    position: 'relative',
    height: '9rem',
  },
  photoImg: {
    position: 'absolute',
    inset: 0,
    height: '100%',
    width: '100%',
    objectFit: 'cover',
  },
  photoFallback: {
    position: 'absolute',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-icon-accent)',
  },
  photoFallbackIcon: {
    width: '2rem',
    height: '2rem',
  },
  photoScrim: {
    position: 'absolute',
    inset: 0,
    backgroundImage:
      'linear-gradient(to top, rgba(9, 9, 11, 0.8), rgba(9, 9, 11, 0.2) 60%, transparent)',
  },
  badgePos: {
    position: 'absolute',
    left: '0.75rem',
    top: '0.75rem',
  },
  badgeInner: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
  },
  badgeDot: {
    display: 'inline-block',
    height: '0.375rem',
    width: '0.375rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
  },
  menuPos: {
    position: 'absolute',
    right: '0.5rem',
    top: '0.5rem',
  },
  menuAnchor: {
    position: 'relative',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  menuTrigger: {
    display: 'grid',
    height: '2.25rem',
    width: '2.25rem',
    placeItems: 'center',
    borderWidth: 0,
    borderRadius: 'var(--radius-element)',
    backgroundColor: {
      default: 'rgba(9, 9, 11, 0.3)',
      ':hover': 'rgba(9, 9, 11, 0.5)',
    },
    color: 'var(--color-on-accent)',
    backdropFilter: 'blur(4px)',
    cursor: 'pointer',
    opacity: {
      default: 1,
      ':disabled': 0.5,
    },
  },
  menuTriggerIcon: {
    width: '1.25rem',
    height: '1.25rem',
  },
  menuBackdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 30,
  },
  menu: {
    position: 'absolute',
    right: 0,
    top: '2.5rem',
    zIndex: 40,
    width: '11rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-popover)',
    padding: '0.375rem',
  },
  menuItem: {
    display: 'flex',
    height: '2.25rem',
    width: '100%',
    alignItems: 'center',
    gap: '0.625rem',
    borderWidth: 0,
    borderRadius: 'var(--radius-element)',
    paddingInline: '0.625rem',
    textAlign: 'left',
    fontSize: '0.875rem',
    fontWeight: 500,
    textDecoration: 'none',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-background-muted)',
    },
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
  },
  menuItemIcon: {
    width: '1rem',
    height: '1rem',
  },
  photoIdentity: {
    position: 'absolute',
    insetInline: '1rem',
    bottom: '0.75rem',
  },
  photoName: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.125rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    textDecoration: {
      default: 'none',
      ':hover': 'underline',
    },
    color: 'var(--color-on-accent)',
  },
  photoAddress: {
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.75rem',
    color: 'var(--color-on-accent)',
    opacity: 0.75,
  },
  photoAddressIcon: {
    width: '0.875rem',
    height: '0.875rem',
  },
  body: {
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    gap: '1rem',
    padding: '1.25rem',
  },
  metaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
    fontSize: '0.875rem',
  },
  metaItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    color: 'var(--color-text-secondary)',
  },
  metaIcon: {
    width: '1rem',
    height: '1rem',
    color: 'var(--color-icon-secondary)',
  },
  amenityWrap: {
    marginTop: 'auto',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.375rem',
    paddingTop: '0.25rem',
  },
  amenityTag: {
    display: 'inline-flex',
    height: '1.75rem',
    alignItems: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    paddingInline: '0.625rem',
    fontSize: '0.6875rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
  },
  noAmenities: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
});

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
    <Card variant="default" padding={0} xstyle={styles.kpiCard}>
      <span {...stylex.props(styles.kpiIcon)}>
        <Icon name={icon} {...stylex.props(styles.kpiIconSvg)} />
      </span>
      <p {...stylex.props(styles.kpiValue)}>
        <CountUp to={value} suffix={suffix} />
      </p>
      <p {...stylex.props(styles.kpiLabel)}>{label}</p>
      <p {...stylex.props(styles.kpiContext)}>{context}</p>
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
      return { tone: 'ink', dot: 'var(--color-text-secondary)', label: t('card.inactive') };
    }
    if (now === null) {
      // Pre-mount: fall back to the lifecycle label (it is active) until the
      // client clock resolves the live open/closed state.
      return { tone: 'success', dot: 'var(--color-success)', label: t('status.ACTIVE') };
    }
    return isOpenAt(location.hours, now)
      ? { tone: 'success', dot: 'var(--color-success)', label: t('card.open') }
      : { tone: 'ink', dot: 'var(--color-text-secondary)', label: t('card.closed') };
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
    <div {...stylex.props(styles.page)}>
      <nav aria-label={t('breadcrumb.label')} {...stylex.props(styles.breadcrumb)}>
        <span>Iron Gym</span>
        <Icon name="chevronRight" {...stylex.props(styles.crumbIcon)} />
        <span {...stylex.props(styles.crumbCurrent)}>{t('breadcrumb.locations')}</span>
      </nav>

      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headText)}>
          <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
          <p {...stylex.props(styles.subtitle)}>{t('subtitle')}</p>
        </div>
        {canWrite ? (
          <Link href="/locations/new" {...stylex.props(styles.addLink)}>
            <Icon name="plus" {...stylex.props(styles.addIcon)} sw={2} />
            {t('add')}
          </Link>
        ) : null}
      </header>

      {/* Gym-wide KPI cards — live aggregates over the whole roster. */}
      <section aria-label={t('title')} {...stylex.props(styles.kpiSection)}>
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

      <div {...stylex.props(styles.filterRow)}>
        <FilterChips
          chips={statusChips}
          active={statusFilter}
          onSelect={(value) => setStatusFilter(value as LocationStatus | '')}
          ariaLabel={t('filters.statusAria')}
        />
        <div {...stylex.props(styles.searchWrap)}>
          <label htmlFor="location-search" {...stylex.props(styles.srOnly)}>
            {t('filters.searchLabel')}
          </label>
          <span {...stylex.props(styles.searchIcon)}>
            <Icon name="search" {...stylex.props(styles.searchIconSvg)} />
          </span>
          <input
            id="location-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('filters.searchPlaceholder')}
            {...stylex.props(styles.searchInput)}
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <Card variant="default" padding={0} xstyle={styles.emptyCard}>
          <span {...stylex.props(styles.emptyIcon)}>
            <Icon name={noMatch ? 'search' : 'pin'} {...stylex.props(styles.emptyIconSvg)} />
          </span>
          <p {...stylex.props(styles.emptyTitle)}>
            {noMatch ? t('empty.noMatchTitle') : t('empty.emptyTitle')}
          </p>
          <p {...stylex.props(styles.emptyHint)}>
            {noMatch ? t('empty.noMatchHint') : t('empty.emptyHint')}
          </p>
        </Card>
      ) : (
        <div {...stylex.props(styles.grid)}>
          {visible.map((location) => {
            const open = openStateOf(location);
            const today = todayLine(location);
            const rowBusy = busyId === location.id && pending;
            return (
              <Card key={location.id} variant="default" padding={0} xstyle={styles.card}>
                {/* Photo header with the identity overlay, status badge and row menu. */}
                <div {...stylex.props(styles.photoHead)}>
                  {location.photoUrl ? (
                    <img
                      src={location.photoUrl}
                      alt={location.name}
                      {...stylex.props(styles.photoImg)}
                    />
                  ) : (
                    <div {...stylex.props(styles.photoFallback)}>
                      <Icon name="pin" {...stylex.props(styles.photoFallbackIcon)} />
                    </div>
                  )}
                  <div aria-hidden {...stylex.props(styles.photoScrim)} />

                  <div {...stylex.props(styles.badgePos)}>
                    <Badge tone={open.tone}>
                      <span {...stylex.props(styles.badgeInner)}>
                        <span
                          aria-hidden
                          {...stylex.props(styles.badgeDot)}
                          style={{ backgroundColor: open.dot }}
                        />
                        {open.label}
                      </span>
                    </Badge>
                  </div>

                  {canWrite ? (
                    <div {...stylex.props(styles.menuPos)}>
                      <div {...stylex.props(styles.menuAnchor)}>
                        <button
                          type="button"
                          aria-label={t('rowMenu.open', { name: location.name })}
                          aria-haspopup="menu"
                          aria-expanded={menuFor === location.id}
                          disabled={rowBusy}
                          onClick={() => setMenuFor(menuFor === location.id ? null : location.id)}
                          {...stylex.props(styles.menuTrigger)}
                        >
                          <Icon name="settings" {...stylex.props(styles.menuTriggerIcon)} />
                        </button>
                        {menuFor === location.id ? (
                          <>
                            <div
                              {...stylex.props(styles.menuBackdrop)}
                              aria-hidden
                              onClick={() => setMenuFor(null)}
                            />
                            <div role="menu" {...stylex.props(styles.menu)}>
                              <Link
                                href={`/locations/${location.id}`}
                                role="menuitem"
                                onClick={() => setMenuFor(null)}
                                {...stylex.props(styles.menuItem)}
                              >
                                <Icon name="search" {...stylex.props(styles.menuItemIcon)} />
                                {t('rowMenu.view')}
                              </Link>
                              <Link
                                href={`/locations/${location.id}/edit`}
                                role="menuitem"
                                onClick={() => setMenuFor(null)}
                                {...stylex.props(styles.menuItem)}
                              >
                                <Icon name="settings" {...stylex.props(styles.menuItemIcon)} />
                                {t('rowMenu.edit')}
                              </Link>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => setActive(location, location.status !== 'ACTIVE')}
                                {...stylex.props(styles.menuItem)}
                              >
                                <Icon
                                  name={location.status === 'ACTIVE' ? 'lock' : 'check'}
                                  {...stylex.props(styles.menuItemIcon)}
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

                  <div {...stylex.props(styles.photoIdentity)}>
                    <Link href={`/locations/${location.id}`} {...stylex.props(styles.photoName)}>
                      {location.name}
                    </Link>
                    <p {...stylex.props(styles.photoAddress)}>
                      <Icon name="pin" {...stylex.props(styles.photoAddressIcon)} sw={2} />
                      {location.address || t('card.noAddress')}
                    </p>
                  </div>
                </div>

                {/* Body: today's hours, phone, and the amenities chips. */}
                <div {...stylex.props(styles.body)}>
                  <div {...stylex.props(styles.metaRow)}>
                    <span {...stylex.props(styles.metaItem)}>
                      <Icon name="clock" {...stylex.props(styles.metaIcon)} sw={2} />
                      {today ?? '—'}
                    </span>
                    {location.phone ? (
                      <span {...stylex.props(styles.metaItem)}>
                        <Icon name="bell" {...stylex.props(styles.metaIcon)} sw={2} />
                        {location.phone}
                      </span>
                    ) : null}
                  </div>

                  <div {...stylex.props(styles.amenityWrap)}>
                    {location.amenities.length > 0 ? (
                      location.amenities.map((tag) => (
                        <span key={tag} {...stylex.props(styles.amenityTag)}>
                          {tag}
                        </span>
                      ))
                    ) : (
                      <span {...stylex.props(styles.noAmenities)}>{t('card.noAmenities')}</span>
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
