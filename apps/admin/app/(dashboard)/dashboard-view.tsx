'use client';

// @fit/admin — the FormaCore control-room dashboard view.
//
// Renders the real {@link DashboardOverviewResponse} as the reference layout: an
// "in the gym now" live occupancy card (donut + per-area bars), three KPI cards,
// a range-toggled revenue area chart, a plan-mix stacked bar, today's schedule,
// a real-event alerts card, and the live recent-check-ins feed. Every value comes
// from the server (tenant-scoped, real); each section degrades to an explicit
// empty state when its source is empty, never inventing a value. The range control
// writes `?range=` to the URL so the server component re-fetches — the source of
// truth stays server-side.

import { useMemo, useTransition, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type {
  DashboardAlert,
  DashboardKpi,
  DashboardOverviewResponse,
  DashboardRange,
} from '@fit/types';
import {
  AreaChart,
  Card,
  CountUp,
  Donut,
  Icon,
  Occupancy,
  type AreaPoint,
  type IconName,
} from '@/components/ui';

/** The range options offered by the segmented control, in ascending span order. */
const RANGE_OPTIONS: ReadonlyArray<{ value: DashboardRange; label: string }> = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '12w', label: '12w' },
];

/** Weekday axis labels for the revenue chart (Mon–Sun), derived from each point's date. */
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function DashboardView({ data }: { data: DashboardOverviewResponse }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const money = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: data.currency,
        maximumFractionDigits: 0,
      }),
    [data.currency],
  );

  function selectRange(next: DashboardRange): void {
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', next);
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  }

  const now = new Date();
  const eyebrow = now
    .toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    .toUpperCase();
  const greeting = greetingFor(now.getHours());
  const firstName = data.viewer.name.split(' ')[0] || data.viewer.name;

  return (
    <div className={`flex flex-col gap-6 ${isPending ? 'opacity-70 transition-opacity' : ''}`}>
      {/* Eyebrow + greeting */}
      <header className="flex flex-col gap-2">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-500 dark:text-brand-400">
          {eyebrow}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
            {greeting}, {firstName}
          </h1>
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-success-50 px-2.5 py-1 text-xs font-semibold text-success-700 dark:bg-success-500/15 dark:text-success-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success-500" />
            All systems live
          </span>
        </div>
      </header>

      {/* In the gym now + KPIs */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <InGymNow data={data} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:col-span-2 lg:grid-cols-1 xl:grid-cols-3">
          <KpiCard
            label="Today's revenue"
            icon="card"
            kpi={data.kpis.todaysRevenue}
            format={(v) => money.format(v / 100)}
          />
          <KpiCard label="Check-ins today" icon="check" kpi={data.kpis.checkInsToday} />
          <KpiCard label="New members · 7d" icon="users" kpi={data.kpis.newMembers7d} />
        </div>
      </section>

      {/* Revenue + plan mix */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <RevenueCard data={data} money={money} onSelectRange={selectRange} disabled={isPending} />
        <PlanMixCard data={data} />
      </section>

      {/* Today's schedule + alerts */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
  const { current, capacity, areas } = data.inGymNow;
  const pct = capacity > 0 ? Math.round((current / capacity) * 100) : 0;

  return (
    <Card glow className="flex flex-col p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-sm font-bold uppercase tracking-[0.15em] text-ink-500 dark:text-ink-400">
          In the gym now
        </h2>
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-brand-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />
          Live
        </span>
      </div>

      <div className="flex items-center gap-5">
        <Donut pct={pct} size={104} stroke={10}>
          <div className="flex flex-col leading-none">
            <span className="font-display text-2xl font-extrabold tabular-nums text-ink-900 dark:text-white">
              <CountUp to={current} />
            </span>
            <span className="mt-0.5 font-mono text-[10px] text-ink-400">of {capacity}</span>
          </div>
        </Donut>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink-500 dark:text-ink-400">
            {current === 0
              ? 'Quiet right now — no members checked in today yet.'
              : `${pct}% of capacity in use across ${areas.length} area${
                  areas.length === 1 ? '' : 's'
                }.`}
          </p>
        </div>
      </div>

      {areas.length > 0 && (
        <ul className="mt-5 space-y-3">
          {areas.map((area) => (
            <li key={area.name}>
              <p className="mb-1 truncate text-xs font-semibold text-ink-600 dark:text-ink-300">
                {area.name}
              </p>
              <Occupancy value={area.occupancy} cap={area.capacity} />
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
    <Card glow className="flex h-full flex-col p-5">
      <div className="flex items-center justify-between">
        <span className="grid h-10 w-10 place-items-center rounded-btn bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          <Icon name={icon} className="h-5 w-5" />
        </span>
        <DeltaChip kpi={kpi} />
      </div>
      <p className="mt-4 font-display text-3xl font-extrabold tabular-nums tracking-tight text-ink-900 dark:text-white">
        {format ? format(kpi.value) : <CountUp to={Math.round(kpi.value)} />}
      </p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
        {label}
      </p>
    </Card>
  );
}

function DeltaChip({ kpi }: { kpi: DashboardKpi }) {
  if (kpi.deltaPct === null) {
    return <span className="text-xs text-ink-300 dark:text-ink-600">no prior data</span>;
  }
  const good = kpi.deltaPct >= 0;
  const arrow = good ? '▲' : '▼';
  const text = `${Math.abs(kpi.deltaPct)}%`;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-semibold tabular-nums ${
        good
          ? 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300'
          : 'bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-300'
      }`}
    >
      {arrow} {text}
    </span>
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
  const points: AreaPoint[] = data.revenue.series.map((p) => ({
    // Money is carried in MINOR units; the chart plots major units.
    label: WEEKDAYS[new Date(`${p.date}T00:00:00.000Z`).getUTCDay()] ?? p.date,
    value: p.value / 100,
  }));
  const hasData = points.some((p) => p.value > 0);

  return (
    <Card glow className="flex flex-col p-5 lg:col-span-2">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-sm font-bold uppercase tracking-[0.15em] text-ink-500 dark:text-ink-400">
            Revenue
          </h2>
          <p className="mt-0.5 font-mono text-xs text-ink-400">
            {rangeCaption(data.revenue.range)} · total {money.format(data.revenue.total / 100)}
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Revenue range"
          className="inline-flex w-fit rounded-btn border border-ink-200 bg-white p-1 dark:border-white/10 dark:bg-white/[0.04]"
        >
          {RANGE_OPTIONS.map((option) => {
            const active = option.value === data.revenue.range;
            return (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={disabled}
                onClick={() => onSelectRange(option.value)}
                className={`rounded-btn px-3 py-1 text-xs font-semibold transition-colors disabled:pointer-events-none ${
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
      </div>

      {hasData ? (
        <>
          <AreaChart data={points} ariaLabel="Revenue over the selected range" />
          <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-400">
            {points.map((p, i) => (
              <span key={i}>{p.label}</span>
            ))}
          </div>
        </>
      ) : (
        <EmptyState>No captured revenue in this window yet.</EmptyState>
      )}
    </Card>
  );
}

function rangeCaption(range: DashboardRange): string {
  switch (range) {
    case '7d':
      return 'Last 7 days';
    case '30d':
      return 'Last 30 days';
    case '12w':
      return 'Last 12 weeks';
  }
}

/* -------------------------------------------------------------------------- */
/*  Plan mix                                                                   */
/* -------------------------------------------------------------------------- */

function PlanMixCard({ data }: { data: DashboardOverviewResponse }) {
  const { total, plans } = data.planMix;

  return (
    <Card glow className="flex flex-col p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="font-display text-sm font-bold uppercase tracking-[0.15em] text-ink-500 dark:text-ink-400">
          Plan mix
        </h2>
        <span className="font-mono text-xs text-ink-400">{total} paid members</span>
      </div>

      {plans.length === 0 || total === 0 ? (
        <EmptyState>No active subscribers yet.</EmptyState>
      ) : (
        <>
          <div className="mb-4 flex h-3 overflow-hidden rounded-pill bg-ink-100 dark:bg-white/10">
            {plans.map((plan) => (
              <span
                key={plan.planId ?? plan.name}
                className="h-full"
                style={{
                  width: `${(plan.count / total) * 100}%`,
                  backgroundColor: plan.color ?? '#7C3AED',
                }}
              />
            ))}
          </div>
          <ul className="space-y-2">
            {plans.map((plan) => (
              <li
                key={plan.planId ?? plan.name}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2 text-ink-600 dark:text-ink-300">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: plan.color ?? '#7C3AED' }}
                  />
                  <span className="truncate">{plan.name}</span>
                </span>
                <span className="shrink-0 font-mono tabular-nums text-ink-900 dark:text-white">
                  {plan.count}
                </span>
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
  const rows = data.todaysSchedule;

  return (
    <Card glow className="flex flex-col p-5 lg:col-span-2">
      <h2 className="mb-4 font-display text-sm font-bold uppercase tracking-[0.15em] text-ink-500 dark:text-ink-400">
        Today's schedule
      </h2>
      {rows.length === 0 ? (
        <EmptyState>No classes scheduled today.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {rows.map((row, i) => {
            const fill = row.capacity > 0 ? Math.round((row.booked / row.capacity) * 100) : 0;
            return (
              <li
                key={`${row.startsAt}-${i}`}
                className="flex items-center gap-3 rounded-field border border-ink-100 px-3 py-2.5 dark:border-white/5"
              >
                <span
                  className="h-8 w-1 shrink-0 rounded-pill"
                  style={{ backgroundColor: row.color ?? '#7C3AED' }}
                />
                <span className="w-14 shrink-0 font-mono text-xs tabular-nums text-ink-500 dark:text-ink-400">
                  {formatTime(row.startsAt)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink-900 dark:text-white">
                    {row.title}
                  </span>
                  <span className="block truncate text-xs text-ink-500 dark:text-ink-400">
                    {row.trainerName ?? 'Unassigned'}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-sm tabular-nums text-ink-900 dark:text-white">
                    {row.booked}/{row.capacity}
                  </span>
                  <span
                    className={`block font-mono text-[10px] tabular-nums ${
                      fill > 85
                        ? 'text-danger-500'
                        : fill > 60
                          ? 'text-warning-500'
                          : 'text-success-500'
                    }`}
                  >
                    {fill}% full
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

const ALERT_TONE: Record<DashboardAlert['kind'], string> = {
  payment: 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-300',
  class_full: 'bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-300',
  payment_failed: 'bg-danger-50 text-danger-600 dark:bg-danger-500/15 dark:text-danger-300',
};

function AlertsCard({ data }: { data: DashboardOverviewResponse }) {
  const alerts = data.alerts;
  return (
    <Card glow className="flex flex-col p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="font-display text-sm font-bold uppercase tracking-[0.15em] text-ink-500 dark:text-ink-400">
          Alerts
        </h2>
        <span className="font-mono text-xs text-ink-400">{alerts.length}</span>
      </div>
      {alerts.length === 0 ? (
        <EmptyState>All clear — no alerts right now.</EmptyState>
      ) : (
        <ul className="space-y-2.5">
          {alerts.map((alert, i) => (
            <li key={`${alert.kind}-${i}`} className="flex items-start gap-3">
              <span
                className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-btn ${ALERT_TONE[alert.kind]}`}
              >
                <Icon name={ALERT_ICON[alert.kind]} className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink-900 dark:text-white">
                  {alert.title}
                </span>
                <span className="block truncate text-xs text-ink-500 dark:text-ink-400">
                  {alert.detail} · {timeAgo(alert.at)}
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
  const rows = data.recentCheckIns;
  return (
    <Card glow className="flex flex-col p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-sm font-bold uppercase tracking-[0.15em] text-ink-500 dark:text-ink-400">
          Recent check-ins
        </h2>
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-brand-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />
          Live
        </span>
      </div>
      {rows.length === 0 ? (
        <EmptyState>No check-ins today yet.</EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row, i) => (
            <li
              key={`${row.checkedInAt}-${i}`}
              className="flex items-center gap-3 rounded-field border border-ink-100 px-3 py-2 dark:border-white/5"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#7C3AED,#EC4899)] font-display text-xs font-bold text-white">
                {initials(row.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink-900 dark:text-white">
                  {row.name}
                </span>
                <span className="block truncate text-xs text-ink-500 dark:text-ink-400">
                  {row.planName ?? 'No plan'} · {timeAgo(row.checkedInAt)}
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
  return (
    <div className="grid min-h-24 flex-1 place-items-center rounded-field border border-dashed border-ink-200 px-4 py-6 text-center text-sm text-ink-400 dark:border-white/10 dark:text-ink-500">
      {children}
    </div>
  );
}

function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
