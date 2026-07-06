'use client';

// @fit/admin — the control-room dashboard view, rebuilt on Astryx (T11.18).
//
// Renders the real {@link DashboardOverviewResponse} as the reference layout: an
// "in the gym now" live occupancy card (donut + per-area bars), three KPI cards,
// a range-toggled revenue area chart, a plan-mix stacked bar, today's schedule,
// a real-event alerts card, and the live recent-check-ins feed. Every value comes
// from the server (tenant-scoped, real); each section degrades to an explicit
// empty state when its source is empty, never inventing a value. The range control
// writes `?range=` to the URL so the server component re-fetches — the source of
// truth stays server-side.
//
// Presentation is Astryx `Card` / `Badge` / `SegmentedControl` over the Fit brand
// theme tokens, with all layout and the data-viz bits authored in compiled StyleX
// (`var(--color-*)` / `var(--font-family-*)`) — no Tailwind utilities and no
// FormaCore Aurora-glass primitives. The data flow below is unchanged; only the
// presentation moved off Tailwind.

import { useMemo, useTransition, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import { Badge } from '@astryxdesign/core/Badge';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import type {
  DashboardAlert,
  DashboardKpi,
  DashboardOverviewResponse,
  DashboardRange,
} from '@fit/types';
import { CountUp, Icon, type IconName } from '@/components/ui';
import { LIVE_REFRESH_MS, useLiveRefresh } from '@/hooks/use-live-refresh';
import { AreaChart, Donut, OccupancyBar, type AreaPoint } from './charts';

/** Translator for the `admin.dashboard` namespace (from `useTranslations`). */
type T = ReturnType<typeof useTranslations>;

/** The range values offered by the segmented control, in ascending span order. */
const RANGE_VALUES = ['7d', '30d', '12w'] as const satisfies readonly DashboardRange[];

/** i18n keys (under `admin.dashboard.weekdays`) indexed by JS day-of-week (0 = Sun). */
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

const pulse = stylex.keyframes({
  '0%': { opacity: 1 },
  '50%': { opacity: 0.35 },
  '100%': { opacity: 1 },
});

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  pending: {
    opacity: 0.7,
    transitionProperty: 'opacity',
    transitionDuration: '150ms',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  eyebrow: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.2em',
    color: 'var(--color-text-accent)',
  },
  titleRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.75rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  liveDot: {
    display: 'inline-block',
    height: '0.375rem',
    width: '0.375rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'currentColor',
    animationName: pulse,
    animationDuration: '1.6s',
    animationIterationCount: 'infinite',
  },
  gridThirds: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 1024px)': 'repeat(3, minmax(0, 1fr))',
    },
  },
  kpiGroup: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(3, minmax(0, 1fr))',
      '@media (min-width: 1024px)': '1fr',
      '@media (min-width: 1280px)': 'repeat(3, minmax(0, 1fr))',
    },
    gridColumn: {
      default: 'auto',
      '@media (min-width: 1024px)': 'span 2',
    },
  },
  span2: {
    gridColumn: {
      default: 'auto',
      '@media (min-width: 1024px)': 'span 2',
    },
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    padding: '1.25rem',
  },
  // The revenue + schedule cards span two of the three grid columns on lg+.
  cardWide: {
    display: 'flex',
    flexDirection: 'column',
    padding: '1.25rem',
    gridColumn: {
      default: 'auto',
      '@media (min-width: 1024px)': 'span 2',
    },
  },
  cardHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '1rem',
  },
  // KPI header: no bottom margin — the value below carries its own top margin.
  cardHeadPlain: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  labelSpaced: {
    marginBottom: '1rem',
  },
  cardHeadBaseline: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: '1rem',
  },
  sectionLabel: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '0.875rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  metaText: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  livePill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent-muted)',
    paddingInline: '0.5rem',
    paddingBlock: '0.125rem',
    fontSize: '0.625rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--color-text-accent)',
  },
  inGymTop: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.25rem',
  },
  donutValue: {
    display: 'flex',
    flexDirection: 'column',
    lineHeight: 1,
  },
  donutNumber: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  donutCaption: {
    marginTop: '0.125rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.625rem',
    color: 'var(--color-text-secondary)',
  },
  inGymCopy: {
    minWidth: 0,
    flex: 1,
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  areaList: {
    listStyle: 'none',
    margin: 0,
    marginTop: '1.25rem',
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  areaName: {
    margin: 0,
    marginBottom: '0.25rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
  },
  iconTile: {
    display: 'grid',
    placeItems: 'center',
    height: '2.5rem',
    width: '2.5rem',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  icon: {
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
  deltaMuted: {
    fontSize: '0.75rem',
    color: 'var(--color-text-disabled)',
  },
  revenueHead: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    marginBottom: '1rem',
  },
  revenueCaption: {
    margin: 0,
    marginTop: '0.125rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  axisRow: {
    marginTop: '0.25rem',
    display: 'flex',
    justifyContent: 'space-between',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.625rem',
    color: 'var(--color-text-secondary)',
  },
  planBar: {
    display: 'flex',
    height: '0.75rem',
    overflow: 'hidden',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    marginBottom: '1rem',
  },
  planSeg: {
    height: '100%',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  planRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    fontSize: '0.875rem',
  },
  planName: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    gap: '0.5rem',
    color: 'var(--color-text-secondary)',
  },
  swatch: {
    display: 'inline-block',
    height: '0.625rem',
    width: '0.625rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
  },
  truncate: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  planCount: {
    flexShrink: 0,
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  scheduleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    paddingInline: '0.75rem',
    paddingBlock: '0.625rem',
  },
  scheduleAccent: {
    height: '2rem',
    width: '0.25rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
  },
  scheduleTime: {
    width: '3.5rem',
    flexShrink: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  scheduleMain: {
    minWidth: 0,
    flex: 1,
  },
  scheduleTitle: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  scheduleSub: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  scheduleRight: {
    flexShrink: 0,
    textAlign: 'right',
  },
  scheduleCount: {
    display: 'block',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.875rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  scheduleFill: {
    display: 'block',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.625rem',
    fontVariantNumeric: 'tabular-nums',
  },
  fillOk: { color: 'var(--color-success)' },
  fillWarn: { color: 'var(--color-warning)' },
  fillFull: { color: 'var(--color-error)' },
  alertRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
  },
  alertIcon: {
    marginTop: '0.125rem',
    display: 'grid',
    height: '2rem',
    width: '2rem',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: 'var(--radius-element)',
  },
  alertToneSuccess: {
    backgroundColor: 'var(--color-success-muted)',
    color: 'var(--color-success)',
  },
  alertToneWarning: {
    backgroundColor: 'var(--color-warning-muted)',
    color: 'var(--color-warning)',
  },
  alertToneError: {
    backgroundColor: 'var(--color-error-muted)',
    color: 'var(--color-error)',
  },
  smIcon: {
    width: '1rem',
    height: '1rem',
  },
  alertMain: {
    minWidth: 0,
    flex: 1,
  },
  alertTitle: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  alertDetail: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  checkInGrid: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gap: '0.5rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 1024px)': 'repeat(3, minmax(0, 1fr))',
    },
  },
  checkInRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
  },
  avatar: {
    display: 'grid',
    height: '2.25rem',
    width: '2.25rem',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
    fontFamily: 'var(--font-family-heading)',
    fontSize: '0.75rem',
    fontWeight: 700,
  },
  empty: {
    display: 'grid',
    flex: 1,
    minHeight: '6rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'dashed',
    borderColor: 'var(--color-border)',
    paddingInline: '1rem',
    paddingBlock: '1.5rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  rangeControl: {
    flexShrink: 0,
  },
});

export function DashboardView({ data }: { data: DashboardOverviewResponse }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const t = useTranslations('admin.dashboard');
  const locale = useLocale();

  // Keep the control-room overview live: re-run the server component on an
  // interval so KPIs, occupancy, today's schedule and the check-ins feed refresh
  // without a navigation. The `?range=` param is preserved across refreshes.
  useLiveRefresh(LIVE_REFRESH_MS.dashboard);

  const money = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: data.currency,
        maximumFractionDigits: 0,
      }),
    [data.currency, locale],
  );

  function selectRange(next: DashboardRange): void {
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', next);
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  }

  const now = new Date();
  const eyebrow = now
    .toLocaleDateString(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    .toUpperCase();
  const greeting = t(greetingKey(now.getHours()));
  const firstName = data.viewer.name.split(' ')[0] || data.viewer.name;

  return (
    <div {...stylex.props(styles.page, isPending && styles.pending)}>
      {/* Eyebrow + greeting */}
      <header {...stylex.props(styles.header)}>
        <p {...stylex.props(styles.eyebrow)}>{eyebrow}</p>
        <div {...stylex.props(styles.titleRow)}>
          <h1 {...stylex.props(styles.title)}>
            {greeting}, {firstName}
          </h1>
          <Badge
            variant="success"
            label={t('allSystemsLive')}
            icon={<span {...stylex.props(styles.liveDot)} />}
          />
        </div>
      </header>

      {/* In the gym now + KPIs */}
      <section {...stylex.props(styles.gridThirds)}>
        <InGymNow data={data} />
        <div {...stylex.props(styles.kpiGroup)}>
          <KpiCard
            label={t('kpi.todaysRevenue')}
            icon="card"
            kpi={data.kpis.todaysRevenue}
            format={(v) => money.format(v / 100)}
          />
          <KpiCard label={t('kpi.checkInsToday')} icon="check" kpi={data.kpis.checkInsToday} />
          <KpiCard label={t('kpi.newMembers7d')} icon="users" kpi={data.kpis.newMembers7d} />
        </div>
      </section>

      {/* Revenue + plan mix */}
      <section {...stylex.props(styles.gridThirds)}>
        <RevenueCard data={data} money={money} onSelectRange={selectRange} disabled={isPending} />
        <PlanMixCard data={data} />
      </section>

      {/* Today's schedule + alerts */}
      <section {...stylex.props(styles.gridThirds)}>
        <ScheduleCard data={data} />
        <AlertsCard data={data} />
      </section>

      {/* Recent check-ins */}
      <RecentCheckInsCard data={data} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  In the gym now                                                             */
/* -------------------------------------------------------------------------- */

function InGymNow({ data }: { data: DashboardOverviewResponse }) {
  const t = useTranslations('admin.dashboard');
  const { current, capacity, areas } = data.inGymNow;
  const pct = capacity > 0 ? Math.round((current / capacity) * 100) : 0;

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.cardHead)}>
        <h2 {...stylex.props(styles.sectionLabel)}>{t('inGymNow.title')}</h2>
        <span {...stylex.props(styles.livePill)}>
          <span {...stylex.props(styles.liveDot)} />
          {t('inGymNow.live')}
        </span>
      </div>

      <div {...stylex.props(styles.inGymTop)}>
        <Donut pct={pct} size={104} stroke={10}>
          <span {...stylex.props(styles.donutValue)}>
            <span {...stylex.props(styles.donutNumber)}>
              <CountUp to={current} />
            </span>
            <span {...stylex.props(styles.donutCaption)}>{t('inGymNow.of', { capacity })}</span>
          </span>
        </Donut>
        <p {...stylex.props(styles.inGymCopy)}>
          {current === 0
            ? t('inGymNow.quiet')
            : t('inGymNow.capacity', { pct, areas: areas.length })}
        </p>
      </div>

      {areas.length > 0 && (
        <ul {...stylex.props(styles.areaList)}>
          {areas.map((area) => (
            <li key={area.name}>
              <p {...stylex.props(styles.areaName)}>{area.name}</p>
              <OccupancyBar value={area.occupancy} cap={area.capacity} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  KPI card                                                                   */
/* -------------------------------------------------------------------------- */

function KpiCard({
  label,
  icon,
  kpi,
  format,
}: {
  label: string;
  icon: IconName;
  kpi: DashboardKpi;
  format?: (value: number) => string;
}) {
  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.cardHeadPlain)}>
        <span {...stylex.props(styles.iconTile)}>
          <Icon name={icon} {...stylex.props(styles.icon)} />
        </span>
        <DeltaChip kpi={kpi} />
      </div>
      <p {...stylex.props(styles.kpiValue)}>
        {format ? format(kpi.value) : <CountUp to={Math.round(kpi.value)} />}
      </p>
      <p {...stylex.props(styles.kpiLabel)}>{label}</p>
    </Card>
  );
}

function DeltaChip({ kpi }: { kpi: DashboardKpi }) {
  const t = useTranslations('admin.dashboard');
  if (kpi.deltaPct === null) {
    return <span {...stylex.props(styles.deltaMuted)}>{t('kpi.noPriorData')}</span>;
  }
  const good = kpi.deltaPct >= 0;
  return (
    <Badge
      variant={good ? 'success' : 'error'}
      label={`${good ? '▲' : '▼'} ${Math.abs(kpi.deltaPct)}%`}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Revenue                                                                    */
/* -------------------------------------------------------------------------- */

function RevenueCard({
  data,
  money,
  onSelectRange,
  disabled,
}: {
  data: DashboardOverviewResponse;
  money: Intl.NumberFormat;
  onSelectRange: (next: DashboardRange) => void;
  disabled: boolean;
}) {
  const t = useTranslations('admin.dashboard');
  const points: AreaPoint[] = data.revenue.series.map((p) => ({
    // Money is carried in MINOR units; the chart plots major units.
    label: t(`weekdays.${WEEKDAY_KEYS[new Date(`${p.date}T00:00:00.000Z`).getUTCDay()]}`),
    value: p.value / 100,
  }));
  const hasData = points.some((p) => p.value > 0);

  return (
    <Card variant="default" padding={0} xstyle={styles.cardWide}>
      <div {...stylex.props(styles.revenueHead)}>
        <div>
          <h2 {...stylex.props(styles.sectionLabel)}>{t('revenue.title')}</h2>
          <p {...stylex.props(styles.revenueCaption)}>
            {t('revenue.caption', {
              range: t(rangeCaptionKey(data.revenue.range)),
              total: money.format(data.revenue.total / 100),
            })}
          </p>
        </div>
        <SegmentedControl
          value={data.revenue.range}
          onChange={(next) => onSelectRange(next as DashboardRange)}
          label={t('revenue.rangeAria')}
          size="sm"
          isDisabled={disabled}
          xstyle={styles.rangeControl}
        >
          {RANGE_VALUES.map((value) => (
            <SegmentedControlItem key={value} value={value} label={t(`ranges.${value}`)} />
          ))}
        </SegmentedControl>
      </div>

      {hasData ? (
        <>
          <AreaChart data={points} ariaLabel={t('revenue.chartAria')} />
          <div {...stylex.props(styles.axisRow)}>
            {points.map((p, i) => (
              <span key={i}>{p.label}</span>
            ))}
          </div>
        </>
      ) : (
        <EmptyState>{t('revenue.empty')}</EmptyState>
      )}
    </Card>
  );
}

/** i18n key (under `admin.dashboard`) for a range's human caption. */
function rangeCaptionKey(range: DashboardRange): string {
  switch (range) {
    case '7d':
      return 'revenue.range7d';
    case '30d':
      return 'revenue.range30d';
    case '12w':
      return 'revenue.range12w';
  }
}

/* -------------------------------------------------------------------------- */
/*  Plan mix                                                                   */
/* -------------------------------------------------------------------------- */

function PlanMixCard({ data }: { data: DashboardOverviewResponse }) {
  const t = useTranslations('admin.dashboard');
  const { total, plans } = data.planMix;

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.cardHeadBaseline)}>
        <h2 {...stylex.props(styles.sectionLabel)}>{t('planMix.title')}</h2>
        <span {...stylex.props(styles.metaText)}>{t('planMix.count', { total })}</span>
      </div>

      {plans.length === 0 || total === 0 ? (
        <EmptyState>{t('planMix.empty')}</EmptyState>
      ) : (
        <>
          <div {...stylex.props(styles.planBar)}>
            {plans.map((plan) => (
              <span
                key={plan.planId ?? plan.name}
                {...stylex.props(styles.planSeg)}
                style={{
                  width: `${(plan.count / total) * 100}%`,
                  backgroundColor: plan.color ?? 'var(--color-accent)',
                }}
              />
            ))}
          </div>
          <ul {...stylex.props(styles.list)}>
            {plans.map((plan) => (
              <li key={plan.planId ?? plan.name} {...stylex.props(styles.planRow)}>
                <span {...stylex.props(styles.planName)}>
                  <span
                    {...stylex.props(styles.swatch)}
                    style={{ backgroundColor: plan.color ?? 'var(--color-accent)' }}
                  />
                  <span {...stylex.props(styles.truncate)}>{plan.name}</span>
                </span>
                <span {...stylex.props(styles.planCount)}>{plan.count}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Today's schedule                                                          */
/* -------------------------------------------------------------------------- */

function ScheduleCard({ data }: { data: DashboardOverviewResponse }) {
  const t = useTranslations('admin.dashboard');
  const locale = useLocale();
  const rows = data.todaysSchedule;

  return (
    <Card variant="default" padding={0} xstyle={styles.cardWide}>
      <h2 {...stylex.props(styles.sectionLabel, styles.labelSpaced)}>{t('schedule.title')}</h2>
      {rows.length === 0 ? (
        <EmptyState>{t('schedule.empty')}</EmptyState>
      ) : (
        <ul {...stylex.props(styles.list)}>
          {rows.map((row, i) => {
            const fill = row.capacity > 0 ? Math.round((row.booked / row.capacity) * 100) : 0;
            const fillTone =
              fill > 85 ? styles.fillFull : fill > 60 ? styles.fillWarn : styles.fillOk;
            return (
              <li key={`${row.startsAt}-${i}`} {...stylex.props(styles.scheduleRow)}>
                <span
                  {...stylex.props(styles.scheduleAccent)}
                  style={{ backgroundColor: row.color ?? 'var(--color-accent)' }}
                />
                <span {...stylex.props(styles.scheduleTime)}>
                  {formatTime(locale, row.startsAt)}
                </span>
                <span {...stylex.props(styles.scheduleMain)}>
                  <span {...stylex.props(styles.scheduleTitle)}>{row.title}</span>
                  <span {...stylex.props(styles.scheduleSub)}>
                    {row.trainerName ?? t('schedule.unassigned')}
                  </span>
                </span>
                <span {...stylex.props(styles.scheduleRight)}>
                  <span {...stylex.props(styles.scheduleCount)}>
                    {row.booked}/{row.capacity}
                  </span>
                  <span {...stylex.props(styles.scheduleFill, fillTone)}>
                    {t('schedule.full', { fill })}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Alerts                                                                     */
/* -------------------------------------------------------------------------- */

const ALERT_ICON: Record<DashboardAlert['kind'], IconName> = {
  payment: 'card',
  class_full: 'users',
  payment_failed: 'info',
};

const ALERT_TONE: Record<DashboardAlert['kind'], keyof typeof styles> = {
  payment: 'alertToneSuccess',
  class_full: 'alertToneWarning',
  payment_failed: 'alertToneError',
};

function AlertsCard({ data }: { data: DashboardOverviewResponse }) {
  const t = useTranslations('admin.dashboard');
  const alerts = data.alerts;
  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.cardHeadBaseline)}>
        <h2 {...stylex.props(styles.sectionLabel)}>{t('alerts.title')}</h2>
        <span {...stylex.props(styles.metaText)}>{alerts.length}</span>
      </div>
      {alerts.length === 0 ? (
        <EmptyState>{t('alerts.empty')}</EmptyState>
      ) : (
        <ul {...stylex.props(styles.list)}>
          {alerts.map((alert, i) => (
            <li key={`${alert.kind}-${i}`} {...stylex.props(styles.alertRow)}>
              <span {...stylex.props(styles.alertIcon, styles[ALERT_TONE[alert.kind]])}>
                <Icon name={ALERT_ICON[alert.kind]} {...stylex.props(styles.smIcon)} />
              </span>
              <span {...stylex.props(styles.alertMain)}>
                <span {...stylex.props(styles.alertTitle)}>{alert.title}</span>
                <span {...stylex.props(styles.alertDetail)}>
                  {alert.detail} · {timeAgo(t, alert.at)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Recent check-ins                                                          */
/* -------------------------------------------------------------------------- */

function RecentCheckInsCard({ data }: { data: DashboardOverviewResponse }) {
  const t = useTranslations('admin.dashboard');
  const rows = data.recentCheckIns;
  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.cardHead)}>
        <h2 {...stylex.props(styles.sectionLabel)}>{t('recentCheckIns.title')}</h2>
        <span {...stylex.props(styles.livePill)}>
          <span {...stylex.props(styles.liveDot)} />
          {t('inGymNow.live')}
        </span>
      </div>
      {rows.length === 0 ? (
        <EmptyState>{t('recentCheckIns.empty')}</EmptyState>
      ) : (
        <ul {...stylex.props(styles.checkInGrid)}>
          {rows.map((row, i) => (
            <li key={`${row.checkedInAt}-${i}`} {...stylex.props(styles.checkInRow)}>
              <span {...stylex.props(styles.avatar)}>{initials(row.name)}</span>
              <span {...stylex.props(styles.alertMain)}>
                <span {...stylex.props(styles.alertTitle)}>{row.name}</span>
                <span {...stylex.props(styles.alertDetail)}>
                  {row.planName ?? t('recentCheckIns.noPlan')} · {timeAgo(t, row.checkedInAt)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Empty state + formatters                                                  */
/* -------------------------------------------------------------------------- */

function EmptyState({ children }: { children: ReactNode }) {
  return <div {...stylex.props(styles.empty)}>{children}</div>;
}

/** i18n key (under `admin.dashboard.greeting`) for the time-of-day greeting. */
function greetingKey(hour: number): string {
  if (hour < 12) return 'greeting.morning';
  if (hour < 18) return 'greeting.afternoon';
  return 'greeting.evening';
}

function formatTime(locale: string, iso: string): string {
  return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

function timeAgo(t: T, iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return t('relative.justNow');
  if (mins < 60) return t('relative.minutes', { mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t('relative.hours', { hours });
  return t('relative.days', { days: Math.round(hours / 24) });
}
