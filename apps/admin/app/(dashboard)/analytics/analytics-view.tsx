'use client';

import { useMemo, useTransition, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type {
  AdminAnalyticsResponse,
  AnalyticsChannelSlice,
  AnalyticsKpi,
  AnalyticsRange,
} from '@fit/types';
import { AreaChart, Card, CountUp, Icon, type AreaPoint, type IconName } from '@/components/ui';

/** The range options offered by the segmented control, in ascending span order. */
const RANGE_OPTIONS: ReadonlyArray<{ value: AnalyticsRange; label: string }> = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '12w', label: '12 weeks' },
  { value: '12m', label: '12 months' },
];

/** Fixed palette for the channel-mix slices, brand-first. */
const CHANNEL_COLORS: Record<AnalyticsChannelSlice['channel'], string> = {
  POS: 'text-brand-500 dark:text-brand-400',
  ONLINE: 'text-accent-500 dark:text-accent-400',
};

const CHANNEL_LABELS: Record<AnalyticsChannelSlice['channel'], string> = {
  POS: 'Point of sale',
  ONLINE: 'Online orders',
};

/**
 * The Analytics screen's client view. Renders the real {@link AdminAnalyticsResponse}
 * as a range control, four KPI cards, a revenue area chart, a channel-mix donut, a
 * plan-mix bar list, and a top-classes list — every section degrades to an explicit
 * empty state when its series is empty, never inventing a value. The range control
 * writes `?range=` to the URL so the server component re-fetches (the data source of
 * truth stays server-side).
 */
export function AnalyticsView({ data }: { data: AdminAnalyticsResponse }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function selectRange(next: AnalyticsRange): void {
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', next);
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  }

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

  return (
    <div className={`flex flex-col gap-6 ${isPending ? 'opacity-70 transition-opacity' : ''}`}>
      <RangeControl value={data.range} onSelect={selectRange} disabled={isPending} />

      {/* KPI cards */}
      <section
        aria-label="Key metrics"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <KpiCard
          label="Revenue"
          icon="card"
          kpi={data.kpis.revenue}
          format={(v) => money.format(v / 100)}
        />
        <KpiCard label="Active members" icon="users" kpi={data.kpis.activeMembers} />
        <KpiCard label="Attendance rate" icon="check" kpi={data.kpis.attendanceRate} suffix="%" />
        <KpiCard label="Churn" icon="logout" kpi={data.kpis.churn} suffix="%" invertDelta />
      </section>

      {/* Revenue + channel mix */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card glow className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-sm font-bold uppercase tracking-[0.15em] text-ink-500 dark:text-ink-400">
              Revenue
            </h2>
            <span className="font-mono text-xs text-ink-400">captured payments</span>
          </div>
          {revenuePoints.some((p) => p.value > 0) ? (
            <AreaChart data={revenuePoints} ariaLabel="Revenue over the selected range" />
          ) : (
            <EmptyState>No captured revenue in this window yet.</EmptyState>
          )}
        </Card>

        <Card glow className="p-5">
          <h2 className="mb-4 font-display text-sm font-bold uppercase tracking-[0.15em] text-ink-500 dark:text-ink-400">
            Channel mix
          </h2>
          <ChannelMix slices={data.channelMix} format={(v) => money.format(v / 100)} />
        </Card>
      </section>

      {/* Plan mix + top classes */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card glow className="p-5">
          <h2 className="mb-4 font-display text-sm font-bold uppercase tracking-[0.15em] text-ink-500 dark:text-ink-400">
            Subscribers by plan
          </h2>
          <PlanMix data={data} />
        </Card>

        <Card glow className="p-5">
          <h2 className="mb-4 font-display text-sm font-bold uppercase tracking-[0.15em] text-ink-500 dark:text-ink-400">
            Top classes
          </h2>
          <TopClasses data={data} />
        </Card>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Range control                                                              */
/* -------------------------------------------------------------------------- */

function RangeControl({
  value,
  onSelect,
  disabled,
}: {
  value: AnalyticsRange;
  onSelect: (next: AnalyticsRange) => void;
  disabled: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label="Reporting range"
      className="inline-flex w-fit rounded-btn border border-ink-200 bg-white p-1 dark:border-white/10 dark:bg-white/[0.04]"
    >
      {RANGE_OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onSelect(option.value)}
            className={`rounded-btn px-3.5 py-1.5 text-sm font-semibold transition-colors disabled:pointer-events-none ${
              active
                ? 'bg-[linear-gradient(135deg,#7C3AED,#EC4899)] text-white shadow-[0_4px_14px_-4px_rgba(98,87,227,0.8)]'
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

/* -------------------------------------------------------------------------- */
/*  KPI card                                                                   */
/* -------------------------------------------------------------------------- */

function KpiCard({
  label,
  icon,
  kpi,
  suffix = '',
  format,
  invertDelta = false,
}: {
  label: string;
  icon: IconName;
  kpi: AnalyticsKpi;
  suffix?: string;
  format?: (value: number) => string;
  /** For metrics where down is good (churn): a negative delta reads as positive. */
  invertDelta?: boolean;
}) {
  return (
    <Card glow className="flex h-full flex-col p-5">
      <div className="flex items-center justify-between">
        <span className="grid h-10 w-10 place-items-center rounded-btn bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          <Icon name={icon} className="h-5 w-5" />
        </span>
        <DeltaChip deltaPct={kpi.deltaPct} invert={invertDelta} />
      </div>
      <p className="mt-4 font-display text-3xl font-extrabold tabular-nums tracking-tight text-ink-900 dark:text-white">
        {format ? (
          format(kpi.value)
        ) : (
          <>
            <CountUp to={Math.round(kpi.value)} />
            {suffix}
          </>
        )}
      </p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
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
  const arrow = deltaPct >= 0 ? '▲' : '▼';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-semibold tabular-nums ${
        isGood
          ? 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300'
          : 'bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-300'
      }`}
    >
      {arrow} {Math.abs(deltaPct)}%
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
    return <EmptyState>No captured revenue to split yet.</EmptyState>;
  }

  const size = 120;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div
        className="relative grid shrink-0 place-items-center"
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} className="-rotate-90">
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
                className={CHANNEL_COLORS[slice.channel]}
                stroke="currentColor"
                strokeDasharray={`${dash} ${circ - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <span className="font-display text-sm font-bold text-ink-900 dark:text-white">
            {format(total)}
          </span>
        </div>
      </div>

      <ul className="flex-1 space-y-2 self-stretch">
        {slices.map((slice) => (
          <li key={slice.channel} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 text-ink-600 dark:text-ink-300">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${CHANNEL_COLORS[slice.channel]}`}
                style={{ backgroundColor: 'currentColor' }}
              />
              {CHANNEL_LABELS[slice.channel]}
            </span>
            <span className="font-mono tabular-nums text-ink-900 dark:text-white">
              {format(slice.amount)}
            </span>
          </li>
        ))}
      </ul>
    </div>
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
    <ul className="space-y-3">
      {planMix.map((plan) => (
        <li key={plan.planId ?? plan.name}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="truncate text-ink-700 dark:text-ink-200">{plan.name}</span>
            <span className="ml-3 shrink-0 font-mono tabular-nums text-ink-500 dark:text-ink-400">
              {plan.subscribers}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-pill bg-ink-100 dark:bg-white/10">
            <div
              className="h-full rounded-pill bg-[linear-gradient(135deg,#7C3AED,#EC4899)]"
              style={{ width: `${(plan.subscribers / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
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
  return (
    <ol className="space-y-2">
      {topClasses.map((row, i) => (
        <li
          key={row.templateId}
          className="flex items-center justify-between gap-3 rounded-field border border-ink-100 px-3 py-2 text-sm dark:border-white/5"
        >
          <span className="flex items-center gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-50 font-mono text-xs font-bold text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
              {i + 1}
            </span>
            <span className="truncate text-ink-700 dark:text-ink-200">{row.title}</span>
          </span>
          <span className="shrink-0 font-mono tabular-nums text-ink-500 dark:text-ink-400">
            {row.bookings} booking{row.bookings === 1 ? '' : 's'}
          </span>
        </li>
      ))}
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
