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
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type {
  DashboardAlert,
  DashboardKpi,
  DashboardOverviewResponse,
  DashboardRange,
} from '@fit/types';
import {
  AreaChart,
  Badge,
  Card,
  CountUp,
  Donut,
  Dot,
  Icon,
  Progress,
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
  const eyebrow = `${now.toLocaleDateString(undefined, { weekday: 'long' })} · ${now.toLocaleDateString(
    undefined,
    { day: 'numeric', month: 'long', year: 'numeric' },
  )}`;
  const greeting = greetingFor(now.getHours());
  const firstName = data.viewer.name.split(' ')[0] || data.viewer.name;

  return (
    <div className={`flex flex-col gap-6 ${isPending ? 'opacity-70 transition-opacity' : ''}`}>
      {/* Eyebrow + greeting */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-500 dark:text-ink-400">
            {eyebrow}
          </p>
          <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
            {greeting}, {firstName}
          </h1>
        </div>
        <Badge tone="success">
          <Dot c="bg-success-400" />
          All systems live
        </Badge>
      </header>

      {/* Hero row — live occupancy focal + KPI cards */}
      <section className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-[1.1fr_2fr]">
        <InGymNow data={data} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
          <KpiCard
            label="Today's revenue"
            icon="card"
            tone="text-success-400"
            kpi={data.kpis.todaysRevenue}
            format={(v) => money.format(v / 100)}
          />
          <KpiCard
            label="Check-ins today"
            icon="qr"
            tone="text-accent-400"
            kpi={data.kpis.checkInsToday}
          />
          <KpiCard
            label="New members · 7d"
            icon="users"
            tone="text-iris-400"
            kpi={data.kpis.newMembers7d}
          />
        </div>
      </section>

      {/* Revenue + plan mix */}
      <section className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-3">
        <RevenueCard data={data} money={money} onSelectRange={selectRange} disabled={isPending} />
        <PlanMixCard data={data} />
      </section>

      {/* Today's schedule + alerts */}
      <section className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-3">
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
    <Card glow className="p-5 sm:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 right-0 h-40 w-56 bg-brand-500/20 blur-3xl"
      />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="users" className="h-5 w-5 text-brand-400" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-ink-500 dark:text-ink-400">
            In the gym now
          </h2>
        </div>
        <Badge tone="brand">
          <Dot c="bg-brand-400" />
          live
        </Badge>
      </div>

      <div className="relative mt-5 flex items-center gap-6">
        <Donut pct={pct} size={120} stroke={12} color="text-brand-400">
          <div className="text-center">
            <CountUp
              to={current}
              className="font-display text-3xl font-black leading-none tabular-nums text-ink-900 dark:text-white"
            />
            <div className="mt-1 font-mono text-[10px] text-ink-400 dark:text-ink-500">
              /{capacity} cap
            </div>
          </div>
        </Donut>
        <div className="min-w-0 flex-1 space-y-2.5">
          {areas.length === 0 ? (
            <p className="text-sm text-ink-500 dark:text-ink-400">
              {current === 0
                ? 'Quiet right now — no members checked in today yet.'
                : `${pct}% of capacity in use.`}
            </p>
          ) : (
            areas.map((area) => (
              <div key={area.name}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="truncate text-ink-600 dark:text-ink-300">{area.name}</span>
                  <span className="font-mono tabular-nums text-ink-500 dark:text-ink-400">
                    {area.occupancy}/{area.capacity}
                  </span>
                </div>
                <Meter value={area.occupancy} cap={area.capacity} />
              </div>
            ))
          )}
        </div>
      </div>
    </Card>
  );
}

/**
 * The design's compact occupancy meter: a small mono "value/cap" + percent header
 * over a colour-coded fill bar (green → blue → amber → red as it fills).
 */
function Meter({ value, cap }: { value: number; cap: number }) {
  const pct = cap > 0 ? Math.round((value / cap) * 100) : 0;
  const tone =
    pct >= 100
      ? 'bg-danger-500'
      : pct > 85
        ? 'bg-warning-500'
        : pct > 60
          ? 'bg-accent-500'
          : 'bg-success-500';
  return (
    <div>
      <div className="mb-1.5 flex items-end justify-between">
        <span className="font-mono text-sm font-bold tabular-nums text-ink-900 dark:text-white">
          {value}
          <span className="text-ink-400 dark:text-ink-500">/{cap}</span>
        </span>
        <span className="font-mono text-[11px] text-ink-500 dark:text-ink-400">{pct}%</span>
      </div>
      <Progress value={pct} tone={tone} />
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
  format,
}: {
  label: string;
  icon: IconName;
  /** The icon's accent colour class (per the design: success / accent / iris). */
  tone: string;
  kpi: DashboardKpi;
  format?: (value: number) => string;
}) {
  return (
    <Card glow className="flex h-full flex-col p-5 transition-colors dark:hover:bg-white/[0.06]">
      <div className="flex items-center justify-between">
        <Icon name={icon} className={`h-6 w-6 ${tone}`} />
        <DeltaChip kpi={kpi} />
      </div>
      <p className="mt-4 font-display text-3xl font-extrabold tabular-nums tracking-tight text-ink-900 dark:text-white">
        {format ? format(kpi.value) : <CountUp to={Math.round(kpi.value)} />}
      </p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500 dark:text-ink-400">
        {label}
      </p>
    </Card>
  );
}

/** The design's trend-arrow marks (not in the shared icon set, so drawn locally). */
const TREND_UP = 'M3 17l6-6 4 4 8-8M21 11V7h-4';
const TREND_DOWN = 'M3 7l6 6 4-4 8 8M21 13v4h-4';

function TrendIcon({ down = false }: { down?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden
    >
      <path d={down ? TREND_DOWN : TREND_UP} />
    </svg>
  );
}

function DeltaChip({ kpi }: { kpi: DashboardKpi }) {
  if (kpi.deltaPct === null) {
    return <span className="text-xs text-ink-300 dark:text-ink-600">no prior data</span>;
  }
  const good = kpi.deltaPct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-xs font-semibold tabular-nums ${
        good ? 'text-success-700 dark:text-success-300' : 'text-danger-700 dark:text-danger-300'
      }`}
    >
      <TrendIcon down={!good} />
      {good ? '+' : ''}
      {kpi.deltaPct}%
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
    <Card glow className="flex flex-col p-5 sm:p-6 lg:col-span-2">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
            Revenue
          </h2>
          <p className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">
            {rangeCaption(data.revenue.range)} · total{' '}
            <span className="font-mono text-brand-600 dark:text-brand-300">
              {money.format(data.revenue.total / 100)}
            </span>
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Revenue range"
          className="inline-flex w-fit rounded-btn bg-ink-100 p-1 ring-1 ring-inset ring-ink-200 dark:bg-white/[0.06] dark:ring-white/10"
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
                className={`h-8 rounded-[7px] px-3 text-xs font-semibold transition disabled:pointer-events-none ${
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
      </div>

      {hasData ? (
        <>
          <AreaChart data={points} height={170} ariaLabel="Revenue over the selected range" />
          <div className="mt-2 flex justify-between px-1 font-mono text-[10px] text-ink-400 dark:text-ink-500">
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
    <Card glow className="flex flex-col p-5 sm:p-6">
      <h2 className="font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
        Plan mix
      </h2>
      <p className="mb-4 mt-0.5 font-mono text-sm tabular-nums text-ink-500 dark:text-ink-400">
        {total.toLocaleString()} paid members
      </p>

      {plans.length === 0 || total === 0 ? (
        <EmptyState>No active subscribers yet.</EmptyState>
      ) : (
        <>
          <div className="flex h-2.5 overflow-hidden rounded-pill bg-ink-100 dark:bg-white/10">
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
          <ul className="mt-4 space-y-2.5">
            {plans.map((plan) => (
              <li key={plan.planId ?? plan.name} className="flex items-center gap-2.5 text-sm">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: plan.color ?? '#7C3AED' }}
                />
                <span className="min-w-0 flex-1 truncate text-ink-600 dark:text-ink-300">
                  {plan.name}
                </span>
                <span
                  className="shrink-0 font-mono font-semibold tabular-nums"
                  style={{ color: plan.color ?? '#7C3AED' }}
                >
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
    <Card glow className="flex flex-col p-2 lg:col-span-2">
      <div className="flex items-center justify-between px-3 pb-2 pt-3">
        <h2 className="font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
          Today's schedule
        </h2>
        <Link
          href="/classes"
          className="text-xs font-semibold text-brand-600 transition hover:opacity-80 dark:text-brand-300"
        >
          Full schedule →
        </Link>
      </div>
      {rows.length === 0 ? (
        <div className="p-1 pt-0">
          <EmptyState>No classes scheduled today.</EmptyState>
        </div>
      ) : (
        <ul className="space-y-0.5">
          {rows.map((row, i) => (
            <li key={`${row.startsAt}-${i}`}>
              <Link
                href="/classes"
                className="group flex items-center gap-3.5 rounded-btn px-3 py-3 transition hover:bg-ink-50 dark:hover:bg-white/[0.04]"
              >
                <span className="w-14 shrink-0 text-center font-mono text-sm font-bold tabular-nums text-ink-900 dark:text-white">
                  {formatTime(row.startsAt)}
                </span>
                <span
                  className="w-1 self-stretch rounded-full"
                  style={{ backgroundColor: row.color ?? '#7C3AED' }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink-900 dark:text-white">
                    {row.title}
                  </span>
                  <span className="block truncate text-xs text-ink-500 dark:text-ink-400">
                    {row.trainerName ?? 'Unassigned'}
                  </span>
                </span>
                <span className="hidden w-28 sm:block">
                  <Meter value={row.booked} cap={row.capacity} />
                </span>
                <span className="sm:hidden">
                  {row.booked >= row.capacity ? (
                    <Badge tone="danger">Full</Badge>
                  ) : (
                    <span className="font-mono text-sm tabular-nums text-ink-700 dark:text-ink-200">
                      {row.booked}/{row.capacity}
                    </span>
                  )}
                </span>
                <Icon
                  name="arrow"
                  sw={2}
                  className="h-4 w-4 shrink-0 text-ink-400 transition group-hover:text-brand-400 dark:text-ink-500"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Alerts                                                                     */
/* -------------------------------------------------------------------------- */

/** Per-kind icon + tone treatment, mirroring the design's alert rows. */
const ALERT_STYLE: Record<
  DashboardAlert['kind'],
  { icon: IconName; sw: number; bar: string; glow: string; ic: string; title: string }
> = {
  payment: {
    icon: 'check',
    sw: 2.4,
    bar: 'bg-success-500 dark:bg-success-400',
    glow: 'bg-success-500/20 dark:bg-success-500/30',
    ic: 'text-success-600 dark:text-success-300',
    title: 'text-success-800 dark:text-success-200',
  },
  class_full: {
    icon: 'flame',
    sw: 2,
    bar: 'bg-warning-500 dark:bg-warning-400',
    glow: 'bg-warning-500/20 dark:bg-warning-500/30',
    ic: 'text-warning-600 dark:text-warning-300',
    title: 'text-warning-800 dark:text-warning-200',
  },
  payment_failed: {
    icon: 'card',
    sw: 1.9,
    bar: 'bg-danger-500 dark:bg-danger-400',
    glow: 'bg-danger-500/20 dark:bg-danger-500/30',
    ic: 'text-danger-600 dark:text-danger-300',
    title: 'text-danger-800 dark:text-danger-200',
  },
};

function AlertsCard({ data }: { data: DashboardOverviewResponse }) {
  const alerts = data.alerts;
  return (
    <Card glow className="flex flex-col p-5">
      <div className="mb-3.5 flex items-center justify-between">
        <h2 className="font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
          Alerts
        </h2>
        <Badge tone="warning">{alerts.length}</Badge>
      </div>
      {alerts.length === 0 ? (
        <EmptyState>All clear — no alerts right now.</EmptyState>
      ) : (
        <ul className="space-y-2.5">
          {alerts.map((alert, i) => {
            const s = ALERT_STYLE[alert.kind];
            return (
              <li
                key={`${alert.kind}-${i}`}
                className="relative flex items-center gap-3 overflow-hidden rounded-card bg-ink-50 p-3 pl-4 ring-1 ring-inset ring-ink-200 transition hover:bg-white dark:bg-white/[0.04] dark:ring-white/10 dark:hover:bg-white/[0.07]"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 hidden h-px bg-gradient-to-r from-transparent via-white/20 to-transparent dark:block"
                />
                <span
                  className={`absolute bottom-2.5 left-0 top-2.5 w-[3px] rounded-full ${s.bar}`}
                />
                <span className="relative grid h-9 w-9 shrink-0 place-items-center">
                  <span aria-hidden className={`absolute inset-0 blur-md ${s.glow}`} />
                  <Icon name={s.icon} sw={s.sw} className={`relative h-6 w-6 ${s.ic}`} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-semibold leading-tight ${s.title}`}>
                    {alert.title}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-ink-500 dark:text-ink-400">
                    {alert.detail}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink-400 dark:text-ink-500">
                  {timeAgo(alert.at)}
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
/*  Recent check-ins                                                          */
/* -------------------------------------------------------------------------- */

function RecentCheckInsCard({ data }: { data: DashboardOverviewResponse }) {
  const rows = data.recentCheckIns;
  return (
    <Card glow className="flex flex-col p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h2 className="font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
            Recent check-ins
          </h2>
          <Badge tone="brand">
            <Dot c="bg-brand-400" />
            live
          </Badge>
        </div>
        <Link
          href="/check-in"
          className="text-xs font-semibold text-brand-600 transition hover:opacity-80 dark:text-brand-300"
        >
          View all →
        </Link>
      </div>
      {rows.length === 0 ? (
        <EmptyState>No check-ins today yet.</EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {rows.map((row, i) => (
            <li
              key={`${row.checkedInAt}-${i}`}
              className="flex items-center gap-3 rounded-card bg-ink-50 p-3 ring-1 ring-inset ring-ink-200 transition hover:bg-white dark:bg-white/[0.03] dark:ring-white/10 dark:hover:bg-white/[0.06]"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#7C3AED,#EC4899)] font-display text-xs font-bold text-white">
                {initials(row.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink-900 dark:text-white">
                  {row.name}
                </span>
                <span className="block truncate text-xs text-ink-500 dark:text-ink-400">
                  {row.planName ?? 'No plan'}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[10px] text-ink-400 dark:text-ink-500">
                {timeAgo(row.checkedInAt)}
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

/** The design's compact relative timestamp: "now", "2m", "1h", "3d". */
function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}
