'use client';

import { useMemo, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type {
  AdminAnalyticsResponse,
  AnalyticsChannelSlice,
  AnalyticsKpi,
  AnalyticsRange,
} from '@fit/types';
import { AreaChart, Card, Icon, type AreaPoint, type IconName } from '@/components/ui';

/** The range options offered by the segmented control, in ascending span order. */
const RANGE_OPTIONS: ReadonlyArray<{ value: AnalyticsRange; label: string }> = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '12w', label: '12w' },
  { value: '12m', label: '12m' },
];

/** Human phrasing of each window, for card subtitles. */
const RANGE_PHRASES: Record<AnalyticsRange, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '12w': 'Last 12 weeks',
  '12m': 'Last 12 months',
};

/**
 * Fixed palette for the channel-mix slices, matching the design's channel colours
 * (POS → accent, Online → success). `text` drives the donut stroke, `swatch` the
 * legend square.
 */
const CHANNEL_COLORS: Record<AnalyticsChannelSlice['channel'], { text: string; swatch: string }> = {
  POS: { text: 'text-accent-500', swatch: 'bg-accent-500' },
  ONLINE: { text: 'text-success-500', swatch: 'bg-success-500' },
};

const CHANNEL_LABELS: Record<AnalyticsChannelSlice['channel'], string> = {
  POS: 'POS',
  ONLINE: 'Online',
};

/**
 * The range segmented control, rendered in the page header next to the title (as in
 * the design). Self-contained: it writes `?range=` to the URL so the server
 * component re-fetches — the data source of truth stays server-side.
 */
export function AnalyticsRangeControl({ value }: { value: AnalyticsRange }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function selectRange(next: AnalyticsRange): void {
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', next);
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  }

  return (
    <div
      role="tablist"
      aria-label="Reporting range"
      className={`inline-flex w-fit rounded-btn bg-ink-100 p-1 ring-1 ring-inset ring-ink-200 transition-opacity dark:bg-white/[0.06] dark:ring-white/10 ${
        isPending ? 'opacity-70' : ''
      }`}
    >
      {RANGE_OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={isPending}
            onClick={() => selectRange(option.value)}
            className={`h-9 rounded-[7px] px-3.5 text-sm font-semibold transition disabled:pointer-events-none ${
              active
                ? 'bg-white text-ink-900 shadow-sm dark:text-ink-950 dark:shadow-none'
                : 'text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The Analytics screen's client view. Renders the real {@link AdminAnalyticsResponse}
 * as four KPI cards, a revenue area chart with a date axis, a channel-mix donut, a
 * plan-mix bar list, and a top-classes list — every section degrades to an explicit
 * empty state when its series is empty, never inventing a value.
 */
export function AnalyticsView({ data }: { data: AdminAnalyticsResponse }) {
  const money = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: data.currency,
        maximumFractionDigits: 0,
      }),
    [data.currency],
  );

  const revenuePoints: AreaPoint[] = data.revenueSeries.map((p) => ({
    label: p.date,
    // Money is carried in MINOR units; the chart plots major units.
    value: p.value / 100,
  }));

  // At most ~12 x-axis ticks (the design's density), sampled evenly.
  const axisStep = Math.max(1, Math.ceil(data.revenueSeries.length / 12));
  const axisLabels = data.revenueSeries
    .filter((_, i) => i % axisStep === 0)
    .map((p) => bucketLabel(data.range, p.date));

  const revenueDelta = data.kpis.revenue.deltaPct;
  const channelTotal = data.channelMix.reduce((sum, s) => sum + s.amount, 0);
  const totalSubscribers = data.planMix.reduce((sum, p) => sum + p.subscribers, 0);

  return (
    <div className="flex flex-col gap-5">
      {/* KPI cards */}
      <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          label={`Revenue · ${data.range}`}
          icon="card"
          tone="text-brand-600 dark:text-brand-400"
          kpi={data.kpis.revenue}
          format={(v) => money.format(v / 100)}
        />
        <KpiCard
          label="Active members"
          icon="users"
          tone="text-accent-600 dark:text-accent-400"
          kpi={data.kpis.activeMembers}
        />
        <KpiCard
          label="Attendance rate"
          icon="check"
          tone="text-success-600 dark:text-success-400"
          kpi={data.kpis.attendanceRate}
          suffix="%"
        />
        <KpiCard
          label={`Churn · ${data.range}`}
          icon="logout"
          tone="text-iris-600 dark:text-iris-400"
          kpi={data.kpis.churn}
          suffix="%"
          invertDelta
        />
      </section>

      {/* Revenue + channel mix */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card glow className="p-5 lg:col-span-8">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
                Revenue
              </h2>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-display text-2xl font-extrabold tabular-nums text-ink-900 dark:text-white">
                  {money.format(data.kpis.revenue.value / 100)}
                </span>
                {revenueDelta !== null && (
                  <span
                    className={`font-mono text-xs ${
                      revenueDelta >= 0
                        ? 'text-success-600 dark:text-success-300'
                        : 'text-danger-600 dark:text-danger-300'
                    }`}
                  >
                    {formatSignedPct(revenueDelta)} vs prev
                  </span>
                )}
              </div>
            </div>
          </div>
          {revenuePoints.some((p) => p.value > 0) ? (
            <>
              <AreaChart
                data={revenuePoints}
                height={190}
                ariaLabel="Revenue over the selected range"
              />
              <div className="mt-2 flex justify-between px-1">
                {axisLabels.map((label, i) => (
                  <span
                    key={`${label}-${i}`}
                    className="font-mono text-[10px] text-ink-400 dark:text-ink-500"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <EmptyState>No captured revenue in this window yet.</EmptyState>
          )}
        </Card>

        <Card glow className="p-5 lg:col-span-4">
          <h2 className="font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
            Channel mix
          </h2>
          <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
            {RANGE_PHRASES[data.range]} · {money.format(channelTotal / 100)}
          </p>
          <ChannelMix slices={data.channelMix} format={(v) => money.format(v / 100)} />
        </Card>
      </section>

      {/* Plan mix + top classes */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card glow className="p-5 lg:col-span-5">
          <h2 className="font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
            Subscribers by plan
          </h2>
          <p className="mb-4 mt-0.5 text-xs text-ink-500 dark:text-ink-400">
            {totalSubscribers.toLocaleString()} active subscriber{totalSubscribers === 1 ? '' : 's'}
          </p>
          <PlanMix data={data} />
        </Card>

        <Card glow className="p-5 lg:col-span-7">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
              Top classes by bookings
            </h2>
            <Link
              href="/reports"
              className="text-xs font-semibold text-brand-600 dark:text-brand-300"
            >
              View all →
            </Link>
          </div>
          <TopClasses data={data} />
        </Card>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  KPI card                                                                   */
/* -------------------------------------------------------------------------- */

function KpiCard({
  label,
  icon,
  tone,
  kpi,
  suffix = '',
  format,
  invertDelta = false,
}: {
  label: string;
  icon: IconName;
  /** Icon colour classes (light + dark), per the design's per-card palette. */
  tone: string;
  kpi: AnalyticsKpi;
  suffix?: string;
  format?: (value: number) => string;
  /** For metrics where down is good (churn): a negative delta reads as positive. */
  invertDelta?: boolean;
}) {
  return (
    <Card glow className="flex h-full flex-col p-4">
      <div className="flex items-start justify-between">
        <span className={`grid place-items-center ${tone}`}>
          <Icon name={icon} className="h-6 w-6" />
        </span>
        <DeltaChip deltaPct={kpi.deltaPct} invert={invertDelta} />
      </div>
      <p className="mt-3 font-display text-2xl font-extrabold tabular-nums text-ink-900 dark:text-white sm:text-3xl">
        {format ? format(kpi.value) : `${formatKpiValue(kpi.value)}${suffix}`}
      </p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500 dark:text-ink-400">
        {label}
      </p>
    </Card>
  );
}

function DeltaChip({ deltaPct, invert }: { deltaPct: number | null; invert: boolean }) {
  if (deltaPct === null) {
    return <span className="text-xs text-ink-300 dark:text-ink-600">no prior data</span>;
  }
  const isGood = invert ? deltaPct <= 0 : deltaPct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-mono text-xs font-bold tabular-nums ${
        isGood ? 'text-success-600 dark:text-success-300' : 'text-danger-600 dark:text-danger-300'
      }`}
    >
      <span aria-hidden className="text-[9px] leading-none">
        {deltaPct >= 0 ? '▲' : '▼'}
      </span>
      {formatSignedPct(deltaPct)}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Channel mix (multi-segment donut)                                          */
/* -------------------------------------------------------------------------- */

function ChannelMix({
  slices,
  format,
}: {
  slices: AnalyticsChannelSlice[];
  format: (amount: number) => string;
}) {
  const total = slices.reduce((sum, s) => sum + s.amount, 0);
  if (total <= 0) {
    return (
      <div className="mt-4">
        <EmptyState>No captured revenue to split yet.</EmptyState>
      </div>
    );
  }

  const size = 156;
  const stroke = 20;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <>
      <div className="relative my-4 flex items-center justify-center">
        <svg width={size} height={size} className="-rotate-90 shrink-0">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            className="text-ink-100 dark:text-white/10"
            stroke="currentColor"
          />
          {slices.map((slice) => {
            const frac = slice.amount / total;
            const dash = frac * circ;
            const el = (
              <circle
                key={slice.channel}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                strokeWidth={stroke}
                strokeLinecap="butt"
                className={CHANNEL_COLORS[slice.channel].text}
                stroke="currentColor"
                strokeDasharray={`${dash} ${circ - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return el;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="font-display text-xl font-extrabold tabular-nums text-ink-900 dark:text-white">
              {format(total)}
            </div>
            <div className="text-[10px] text-ink-400 dark:text-ink-500">total</div>
          </div>
        </div>
      </div>

      <ul className="space-y-2">
        {slices.map((slice) => (
          <li key={slice.channel} className="flex items-center gap-2.5 text-sm">
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-sm ${CHANNEL_COLORS[slice.channel].swatch}`}
            />
            <span className="flex-1 text-ink-600 dark:text-ink-300">
              {CHANNEL_LABELS[slice.channel]}
            </span>
            <span className="font-mono font-semibold tabular-nums text-ink-900 dark:text-white">
              {format(slice.amount)}
            </span>
            <span className="w-9 text-right font-mono text-xs text-ink-400 dark:text-ink-500">
              {Math.round((slice.amount / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Plan mix (bar list)                                                        */
/* -------------------------------------------------------------------------- */

function PlanMix({ data }: { data: AdminAnalyticsResponse }) {
  const { planMix } = data;
  if (planMix.length === 0) {
    return <EmptyState>No active subscribers yet.</EmptyState>;
  }
  const max = Math.max(1, ...planMix.map((p) => p.subscribers));

  return (
    <div className="space-y-4">
      {planMix.map((plan) => (
        <div key={plan.planId ?? plan.name}>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <span className="truncate text-sm font-semibold text-ink-900 dark:text-white">
              {plan.name}
            </span>
            <span className="shrink-0 font-mono text-xs text-ink-500 dark:text-ink-400">
              {plan.subscribers}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-pill bg-ink-100 dark:bg-white/10">
            <div
              className="h-full rounded-pill bg-brand-500"
              style={{ width: `${(plan.subscribers / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Top classes                                                                */
/* -------------------------------------------------------------------------- */

function TopClasses({ data }: { data: AdminAnalyticsResponse }) {
  const { topClasses } = data;
  if (topClasses.length === 0) {
    return <EmptyState>No bookings in this window yet.</EmptyState>;
  }
  const max = Math.max(1, ...topClasses.map((r) => r.bookings));

  return (
    <ol className="space-y-1">
      {topClasses.map((row, i) => {
        const pct = Math.round((row.bookings / max) * 100);
        return (
          <li
            key={row.templateId}
            className="flex items-center gap-3 rounded-card p-2.5 text-sm transition hover:bg-ink-50 dark:hover:bg-white/[0.03]"
          >
            <span className="w-5 shrink-0 font-mono text-sm font-bold text-ink-400 dark:text-ink-500">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold text-ink-900 dark:text-white">
              {row.title}
            </span>
            <span className="hidden w-28 items-center gap-2 sm:flex">
              <span className="h-1.5 flex-1 overflow-hidden rounded-pill bg-ink-100 dark:bg-white/10">
                <span
                  className="block h-full rounded-pill bg-brand-500"
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="font-mono text-[11px] text-ink-400 dark:text-ink-500">{pct}%</span>
            </span>
            <span
              aria-label={`${row.bookings} booking${row.bookings === 1 ? '' : 's'}`}
              className="w-16 shrink-0 text-right font-mono font-bold tabular-nums text-ink-900 dark:text-white"
            >
              {row.bookings}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/*  Empty state                                                                */
/* -------------------------------------------------------------------------- */

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-24 place-items-center rounded-field border border-dashed border-ink-200 px-4 py-6 text-center text-sm text-ink-400 dark:border-white/10 dark:text-ink-500">
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Formatting helpers                                                         */
/* -------------------------------------------------------------------------- */

/** Group thousands; keep one decimal for fractional rates (e.g. `2.1`%). */
function formatKpiValue(value: number): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
  });
}

/** `+12.4%` / `−0.4%` — explicit sign, one decimal, true minus sign. */
function formatSignedPct(value: number): string {
  const abs = Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 1 });
  return `${value >= 0 ? '+' : '−'}${abs}%`;
}

/**
 * Compact x-axis tick for one series bucket: month name for monthly buckets,
 * `MMM d` for day/week buckets. Fixed locale + UTC so SSR and client agree.
 */
function bucketLabel(range: AnalyticsRange, iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  if (range === '12m') {
    return d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
