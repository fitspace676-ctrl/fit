'use client';

// @fit/admin — the control-room dashboard view, rebuilt on Astryx (T11.18).
//
// Renders the real {@link DashboardOverviewResponse} as: the metric strip (all
// nine KPI/count numbers in one bordered grid, see `metric-strip.tsx`) over a
// two-column work area — a main column (revenue chart, today's schedule, the
// plan-mix bar) and a rail that sticks on wide screens ("in the gym now" live
// occupancy, real-event alerts, and the merged recent-check-ins/recent-members
// feed). Every value comes from the server (tenant-scoped, real); each section
// degrades to an explicit empty state when its source is empty, never inventing
// a value. The page title, subtitle and the `?period=` filter that bounds these
// KPI numbers now live in `DashboardHeader`, above the segment tab bar in
// `segmented-dashboard.tsx` — not in this file. `RevenueCard`'s own `?range=`
// toggle is the one control that stayed here; see `selectRange` below.
//
// Presentation is Astryx `Card` / `Badge` over the Fit brand theme tokens, with
// all layout and the data-viz bits authored in compiled StyleX
// (`var(--color-*)` / `var(--font-family-*)`) — no Tailwind utilities, no
// FormaCore Aurora-glass primitives, and no Astryx `SegmentedControl` (that
// moved out to `DashboardHeader` with the period filter).
//
// Known gap (deferred, not fixed here): a `?range=` change dims this whole page
// via `isPending`/`styles.pending` below, because `selectRange` still lives in
// this component. A `?period=` change does not — `DashboardHeader` runs its own
// separate `useTransition` and only disables its own controls while pending, so
// the KPI numbers it's about to replace stay at full opacity. Wiring the two
// together needs cross-component pending state for a cosmetic difference; the
// header already gives period changes an affordance (its controls disable), so
// that is treated as sufficient rather than plumbed through.

import { useMemo, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale } from 'next-intl';
import { createNumberFormat } from '@fit/i18n';
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
  workArea: {
    display: 'grid',
    gap: '1.5rem',
    alignItems: 'start',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 1024px)': 'minmax(0, 2.2fr) minmax(280px, 1fr)',
    },
  },
  column: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    // `minWidth: 0` stops a wide chart or a long table from forcing the whole
    // grid track wider than its share — the standard grid-blowout guard.
    minWidth: 0,
  },
  rail: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    minWidth: 0,
    position: {
      default: 'static',
      '@media (min-width: 1280px)': 'sticky',
    },
    // Clears the console's fixed chrome, then a little breathing room.
    top: '5rem',
    // Scoped to the same breakpoint the sticky positioning turns on at: below
    // 1280px the rail is in normal flow and a max-height would clip content
    // for no reason. At 1280px+, `InGymNow` + `AlertsCard` + the recent-activity
    // feed can run taller than a typical scrollport once pinned, which would
    // hide the rail's own bottom with no way to scroll it into view. 6rem is
    // `top`'s 5rem plus a rem of breathing room at the bottom.
    maxHeight: {
      default: 'none',
      '@media (min-width: 1280px)': 'calc(100dvh - 6rem)',
    },
    overflowY: {
      default: 'visible',
      '@media (min-width: 1280px)': 'auto',
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
      createNumberFormat(locale, {
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

      <div {...stylex.props(styles.workArea)}>
        <div {...stylex.props(styles.column)}>
          <RevenueCard data={data} money={money} onSelectRange={selectRange} disabled={isPending} />
          <ScheduleCard data={data} />
          <PlanMixCard data={data} />
        </div>

        {/*
          The rail is what is happening right now — live occupancy, anything that
          needs attention, and the feed of what just happened. It sticks on wide
          screens so scrolling the revenue chart never scrolls the gym's live
          count off the page.
        */}
        <div {...stylex.props(styles.rail)}>
          <InGymNow data={data} />
          <AlertsCard data={data} />
          <RecentActivityCard data={data} />
        </div>
      </div>
    </div>
  );
}
