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
import { HStack } from '@astryxdesign/core/HStack';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { DateRangeInput, type DateRange } from '@astryxdesign/core/DateRangeInput';
import type {
  DashboardAlert,
  DashboardKpi,
  DashboardOverviewResponse,
  DashboardPeriod,
  DashboardRange,
} from '@fit/types';
import { CountUp, Icon, type IconName } from '@/components/ui';
import { LIVE_REFRESH_MS, useLiveRefresh } from '@/hooks/use-live-refresh';
import { AreaChart, Donut, type AreaPoint } from './charts';

/** Translator for the `admin.dashboard` namespace (from `useTranslations`). */
type T = ReturnType<typeof useTranslations>;

/** The range values offered by the segmented control, in ascending span order. */
const RANGE_VALUES = ['7d', '30d', '12w'] as const satisfies readonly DashboardRange[];

/** The period values offered by the header date filter, in ascending span order. */
const PERIOD_VALUES = [
  'today',
  'week',
  'month',
  'custom',
] as const satisfies readonly DashboardPeriod[];

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
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  headerText: {
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
  headerControls: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.75rem',
  },
  pending: {
    opacity: 0.7,
    transitionProperty: 'opacity',
    transitionDuration: '150ms',
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
  occupancyCard: {
    height: '100%',
  },
  kpiCard: {
    height: '100%',
    minHeight: '13rem',
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
  areaValue: {
    whiteSpace: 'nowrap',
  },
  iconTile: {
    display: 'grid',
    placeItems: 'center',
    height: '2.75rem',
    width: '2.75rem',
    borderRadius: '0.75rem',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 18%, transparent)',
  },
  icon: {
    width: '1.25rem',
    height: '1.25rem',
  },
  kpiValue: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '2.125rem',
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  kpiLabel: {
    margin: 0,
    marginTop: '0.375rem',
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
  secondaryKpiGrid: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 1024px)': 'repeat(3, minmax(0, 1fr))',
    },
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

  // The header period filter drives the period-bounded KPI cards (revenue /
  // check-ins / new members / classes) by writing `?period=` (+ `from`/`to` for a
  // custom range) so the server component re-fetches — the URL stays the source of
  // truth, exactly like the revenue chart's `?range=`.
  function selectPeriod(next: DashboardPeriod): void {
    const params = new URLSearchParams(searchParams.toString());
    params.set('period', next);
    // Presets carry no explicit dates — drop any stale custom range.
    if (next !== 'custom') {
      params.delete('from');
      params.delete('to');
    }
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  }

  function selectCustomRange(range: DateRange | null): void {
    if (!range) {
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set('period', 'custom');
    params.set('from', range.start);
    params.set('to', range.end);
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  }

  const periodRange: DateRange = {
    start: data.period.from as DateRange['start'],
    end: data.period.to as DateRange['end'],
  };

  return (
    <div {...stylex.props(styles.page, isPending && styles.pending)}>
      {/* Page header + period filter */}
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headerText)}>
          <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
          <p {...stylex.props(styles.subtitle)}>{t('subtitle')}</p>
        </div>
        <div {...stylex.props(styles.headerControls)}>
          <SegmentedControl
            value={data.period.period}
            onChange={(next) => selectPeriod(next as DashboardPeriod)}
            label={t('period.aria')}
            size="sm"
            isDisabled={isPending}
          >
            {PERIOD_VALUES.map((value) => (
              <SegmentedControlItem key={value} value={value} label={t(`period.${value}`)} />
            ))}
          </SegmentedControl>
          <DateRangeInput
            label={t('period.rangeLabel')}
            isLabelHidden
            value={periodRange}
            onChange={selectCustomRange}
            hasClear={false}
            size="sm"
            numberOfMonths={1}
            isDisabled={isPending}
          />
        </div>
      </header>

      {/* In the gym now + KPIs */}
      <section {...stylex.props(styles.gridThirds)}>
        <InGymNow data={data} />
        <div {...stylex.props(styles.kpiGroup)}>
          <KpiCard
            label={t('kpi.revenue')}
            icon="card"
            kpi={data.kpis.todaysRevenue}
            format={(v) => money.format(v / 100)}
          />
          <KpiCard label={t('kpi.checkIns')} icon="check" kpi={data.kpis.checkInsToday} />
          <KpiCard label={t('kpi.newMembers')} icon="users" kpi={data.kpis.newMembers7d} />
        </div>
      </section>

      {/* Secondary stat KPIs (gym-admin parity) */}
      <section {...stylex.props(styles.secondaryKpiGrid)}>
        <StatKpiCard
          label={t('secondaryKpi.activeMembers')}
          icon="users"
          value={data.secondaryKpis.activeMembers}
        />
        <KpiCard
          label={t('secondaryKpi.revenueThisMonth')}
          icon="card"
          kpi={data.secondaryKpis.revenueThisMonth}
          format={(v) => money.format(v / 100)}
        />
        <StatKpiCard
          label={t('secondaryKpi.overduePayments')}
          icon="bell"
          value={data.secondaryKpis.overduePayments}
        />
        <StatKpiCard
          label={t('secondaryKpi.classes')}
          icon="calendar"
          value={data.secondaryKpis.classesToday}
        />
        <StatKpiCard
          label={t('secondaryKpi.expiringSoon')}
          icon="clock"
          value={data.secondaryKpis.expiringSoon}
          hint={t('secondaryKpi.expiringSoonHint')}
        />
        <StatKpiCard
          label={t('secondaryKpi.renewalsDue')}
          icon="arrow"
          value={data.secondaryKpis.renewalsDue}
          hint={t('secondaryKpi.renewalsDueHint')}
        />
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

      {/* Recent members (gym-admin parity) */}
      <RecentMembersCard data={data} />
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
    <Card variant="default" padding={5} xstyle={styles.occupancyCard}>
      <Stack gap={4} height="100%">
        <HStack justify="between" align="center">
          <Text type="label" color="secondary" weight="bold">
            {t('inGymNow.title')}
          </Text>
          <span {...stylex.props(styles.livePill)}>
            <span {...stylex.props(styles.liveDot)} />
            {t('inGymNow.live')}
          </span>
        </HStack>

        <HStack gap={5} align="center">
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
        </HStack>

        {areas.length > 0 && (
          <ul {...stylex.props(styles.areaList)}>
            {areas.map((area) => (
              <li key={area.name}>
                <Stack gap={1}>
                  <HStack justify="between" align="center">
                    <Text type="supporting" color="secondary" weight="medium">
                      {area.name}
                    </Text>
                    <Text
                      type="supporting"
                      color="secondary"
                      hasTabularNumbers
                      xstyle={styles.areaValue}
                    >
                      {area.occupancy}/{area.capacity}
                    </Text>
                  </HStack>
                  <ProgressBar
                    value={area.occupancy}
                    max={Math.max(area.capacity, 1)}
                    label={area.name}
                    isLabelHidden
                    variant="success"
                  />
                </Stack>
              </li>
            ))}
          </ul>
        )}
      </Stack>
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
    <Card variant="default" padding={5} xstyle={styles.kpiCard}>
      <Stack height="100%" justify="between" gap={5}>
        <HStack justify="between" align="center">
          <span {...stylex.props(styles.iconTile)}>
            <Icon name={icon} {...stylex.props(styles.icon)} />
          </span>
          <DeltaChip kpi={kpi} />
        </HStack>
        <Stack gap={1}>
          <Text type="display-3" weight="bold" hasTabularNumbers display="block">
            {format ? format(kpi.value) : <CountUp to={Math.round(kpi.value)} />}
          </Text>
          <Text type="supporting" color="secondary" weight="semibold" display="block">
            {label}
          </Text>
        </Stack>
      </Stack>
    </Card>
  );
}

/**
 * A secondary "stat card" — like {@link KpiCard} but for a live count with no
 * period-over-period baseline: it shows a static descriptive `hint` (a label, not a
 * fabricated trend) where the delta chip would sit, or nothing when `hint` is omitted.
 */
function StatKpiCard({
  label,
  icon,
  value,
  hint,
}: {
  label: string;
  icon: IconName;
  value: number;
  hint?: string;
}) {
  return (
    <Card variant="default" padding={5} xstyle={styles.kpiCard}>
      <Stack height="100%" justify="between" gap={5}>
        <HStack justify="between" align="center">
          <span {...stylex.props(styles.iconTile)}>
            <Icon name={icon} {...stylex.props(styles.icon)} />
          </span>
          {hint ? <span {...stylex.props(styles.deltaMuted)}>{hint}</span> : null}
        </HStack>
        <Stack gap={1}>
          <Text type="display-3" weight="bold" hasTabularNumbers display="block">
            <CountUp to={Math.round(value)} />
          </Text>
          <Text type="supporting" color="secondary" weight="semibold" display="block">
            {label}
          </Text>
        </Stack>
      </Stack>
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

/**
 * The "recent members" card (gym-admin parity) — the latest joiners with their plan,
 * status badge, and membership expiry. Mirrors the recent-check-ins row layout. The
 * payload carries each member's `id` for a future row link into the member's profile
 * route; wiring that link is deferred to a later part of the migration.
 */
function RecentMembersCard({ data }: { data: DashboardOverviewResponse }) {
  const t = useTranslations('admin.dashboard');
  const locale = useLocale();
  const rows = data.recentMembers;
  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.cardHead)}>
        <h2 {...stylex.props(styles.sectionLabel)}>{t('recentMembers.title')}</h2>
      </div>
      {rows.length === 0 ? (
        <EmptyState>{t('recentMembers.empty')}</EmptyState>
      ) : (
        <ul {...stylex.props(styles.checkInGrid)}>
          {rows.map((row) => (
            <li key={row.id} {...stylex.props(styles.checkInRow)}>
              <span {...stylex.props(styles.avatar)}>{initials(row.name)}</span>
              <span {...stylex.props(styles.alertMain)}>
                <span {...stylex.props(styles.alertTitle)}>{row.name}</span>
                <span {...stylex.props(styles.alertDetail)}>
                  {row.planName ?? t('recentMembers.noPlan')}
                  {row.expiresAt
                    ? ` · ${t('recentMembers.expires', { date: formatDate(locale, row.expiresAt) })}`
                    : ''}
                </span>
              </span>
              <Badge
                variant={memberStatusVariant(row.status)}
                label={t(`recentMembers.status.${row.status.toLowerCase()}`)}
              />
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

function formatTime(locale: string, iso: string): string {
  return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

/** Locale-formatted short date for the recent-members "expires" line. */
function formatDate(locale: string, iso: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso));
}

/** Map a `GymMemberStatus` string to an Astryx Badge variant. */
function memberStatusVariant(status: string): 'success' | 'error' | 'neutral' {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'SUSPENDED':
      return 'error';
    default:
      return 'neutral';
  }
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
