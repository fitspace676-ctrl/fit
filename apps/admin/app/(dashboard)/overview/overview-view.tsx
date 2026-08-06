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

import { useMemo, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { DateRangeInput, type DateRange } from '@astryxdesign/core/DateRangeInput';
import type { DashboardOverviewResponse, DashboardPeriod, DashboardRange } from '@fit/types';
import { LIVE_REFRESH_MS, useLiveRefresh } from '@/hooks/use-live-refresh';
import { InGymNow } from './in-gym-now';
import { KpiCard, StatKpiCard } from './kpi-cards';
import { RevenueCard } from './revenue-card';
import { PlanMixCard } from './plan-mix-card';
import { ScheduleCard } from './schedule-card';
import { AlertsCard } from './alerts-card';
import { RecentCheckInsCard, RecentMembersCard } from './recent-cards';

/** The period values offered by the header date filter, in ascending span order. */
const PERIOD_VALUES = [
  'today',
  'week',
  'month',
  'custom',
] as const satisfies readonly DashboardPeriod[];

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

export function OverviewView({ data }: { data: DashboardOverviewResponse }) {
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
