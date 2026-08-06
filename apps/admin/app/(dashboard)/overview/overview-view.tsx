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
import { useLocale } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type { DashboardOverviewResponse, DashboardRange } from '@fit/types';
import { LIVE_REFRESH_MS, useLiveRefresh } from '@/hooks/use-live-refresh';
import { InGymNow } from './in-gym-now';
import { MetricStrip } from './metric-strip';
import { RevenueCard } from './revenue-card';
import { PlanMixCard } from './plan-mix-card';
import { ScheduleCard } from './schedule-card';
import { AlertsCard } from './alerts-card';
import { RecentActivityCard } from './recent-activity-card';

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
  gridThirds: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 1024px)': 'repeat(3, minmax(0, 1fr))',
    },
  },
});

export function OverviewView({ data }: { data: DashboardOverviewResponse }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
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

  return (
    <div {...stylex.props(styles.page, isPending && styles.pending)}>
      <MetricStrip data={data} />

      <section {...stylex.props(styles.gridThirds)}>
        <InGymNow data={data} />
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

      <RecentActivityCard data={data} />
    </div>
  );
}
