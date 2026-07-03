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
import { useLocale, useTranslations } from 'next-intl';
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

/** Translator for the `admin.dashboard` namespace (from `useTranslations`). */
type T = ReturnType<typeof useTranslations>;

/** The range values offered by the segmented control, in ascending span order. */
const RANGE_VALUES = ['7d', '30d', '12w'] as const satisfies readonly DashboardRange[];

/** i18n keys (under `admin.dashboard.weekdays`) indexed by JS day-of-week (0 = Sun). */
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export function DashboardView({ data }: { data: DashboardOverviewResponse }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const t = useTranslations('admin.dashboard');
  const locale = useLocale();

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
            {t('allSystemsLive')}
          </span>
        </div>
      </header>

      {/* In the gym now + KPIs */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <InGymNow data={data} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:col-span-2 lg:grid-cols-1 xl:grid-cols-3">
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
  const t = useTranslations('admin.dashboard');
  const { current, capacity, areas } = data.inGymNow;
  const pct = capacity > 0 ? Math.round((current / capacity) * 100) : 0;

  return (
    <Card glow className="flex flex-col p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-sm font-bold uppercase tracking-[0.15em] text-ink-500 dark:text-ink-400">
          {t('inGymNow.title')}
        </h2>
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-brand-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />
          {t('inGymNow.live')}
        </span>
      </div>

      <div className="flex items-center gap-5">
        <Donut pct={pct} size={104} stroke={10}>
          <div className="flex flex-col leading-none">
            <span className="font-display text-2xl font-extrabold tabular-nums text-ink-900 dark:text-white">
              <CountUp to={current} />
            </span>
            <span className="mt-0.5 font-mono text-[10px] text-ink-400">
              {t('inGymNow.of', { capacity })}
            </span>
          </div>
        </Donut>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink-500 dark:text-ink-400">
            {current === 0
              ? t('inGymNow.quiet')
              : t('inGymNow.capacity', { pct, areas: areas.length })}
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
  const t = useTranslations('admin.dashboard');
  if (kpi.deltaPct === null) {
    return <span className="text-xs text-ink-300 dark:text-ink-600">{t('kpi.noPriorData')}</span>;
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
  const t = useTranslations('admin.dashboard');
  const points: AreaPoint[] = data.revenue.series.map((p) => ({
    // Money is carried in MINOR units; the chart plots major units.
    label: t(`weekdays.${WEEKDAY_KEYS[new Date(`${p.date}T00:00:00.000Z`).getUTCDay()]}`),
    value: p.value / 100,
  }));
  const hasData = points.some((p) => p.value > 0);

  return (
    <Card glow className="flex flex-col p-5 lg:col-span-2">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-sm font-bold uppercase tracking-[0.15em] text-ink-500 dark:text-ink-400">
            {t('revenue.title')}
          </h2>
          <p className="mt-0.5 font-mono text-xs text-ink-400">
            {t('revenue.caption', {
              range: t(rangeCaptionKey(data.revenue.range)),
              total: money.format(data.revenue.total / 100),
            })}
          </p>
        </div>
        <div
          role="tablist"
          aria-label={t('revenue.rangeAria')}
          className="inline-flex w-fit rounded-btn border border-ink-200 bg-white p-1 dark:border-white/10 dark:bg-white/[0.04]"
        >
          {RANGE_VALUES.map((value) => {
            const active = value === data.revenue.range;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={disabled}
                onClick={() => onSelectRange(value)}
                className={`rounded-btn px-3 py-1 text-xs font-semibold transition-colors disabled:pointer-events-none ${
                  active
                    ? 'bg-[linear-gradient(135deg,#7C3AED,#EC4899)] text-white shadow-[0_4px_14px_-4px_rgba(98,87,227,0.8)]'
                    : 'text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white'
                }`}
              >
                {t(`ranges.${value}`)}
              </button>
            );
          })}
        </div>
      </div>

      {hasData ? (
        <>
          <AreaChart data={points} ariaLabel={t('revenue.chartAria')} />
          <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-400">
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
    <Card glow className="flex flex-col p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="font-display text-sm font-bold uppercase tracking-[0.15em] text-ink-500 dark:text-ink-400">
          {t('planMix.title')}
        </h2>
        <span className="font-mono text-xs text-ink-400">{t('planMix.count', { total })}</span>
      </div>

      {plans.length === 0 || total === 0 ? (
        <EmptyState>{t('planMix.empty')}</EmptyState>
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
  const t = useTranslations('admin.dashboard');
  const locale = useLocale();
  const rows = data.todaysSchedule;

  return (
    <Card glow className="flex flex-col p-5 lg:col-span-2">
      <h2 className="mb-4 font-display text-sm font-bold uppercase tracking-[0.15em] text-ink-500 dark:text-ink-400">
        {t('schedule.title')}
      </h2>
      {rows.length === 0 ? (
        <EmptyState>{t('schedule.empty')}</EmptyState>
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
                  {formatTime(locale, row.startsAt)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink-900 dark:text-white">
                    {row.title}
                  </span>
                  <span className="block truncate text-xs text-ink-500 dark:text-ink-400">
                    {row.trainerName ?? t('schedule.unassigned')}
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

const ALERT_TONE: Record<DashboardAlert['kind'], string> = {
  payment: 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-300',
  class_full: 'bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-300',
  payment_failed: 'bg-danger-50 text-danger-600 dark:bg-danger-500/15 dark:text-danger-300',
};

function AlertsCard({ data }: { data: DashboardOverviewResponse }) {
  const t = useTranslations('admin.dashboard');
  const alerts = data.alerts;
  return (
    <Card glow className="flex flex-col p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="font-display text-sm font-bold uppercase tracking-[0.15em] text-ink-500 dark:text-ink-400">
          {t('alerts.title')}
        </h2>
        <span className="font-mono text-xs text-ink-400">{alerts.length}</span>
      </div>
      {alerts.length === 0 ? (
        <EmptyState>{t('alerts.empty')}</EmptyState>
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
    <Card glow className="flex flex-col p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-sm font-bold uppercase tracking-[0.15em] text-ink-500 dark:text-ink-400">
          {t('recentCheckIns.title')}
        </h2>
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-brand-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />
          {t('inGymNow.live')}
        </span>
      </div>
      {rows.length === 0 ? (
        <EmptyState>{t('recentCheckIns.empty')}</EmptyState>
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
  return (
    <div className="grid min-h-24 flex-1 place-items-center rounded-field border border-dashed border-ink-200 px-4 py-6 text-center text-sm text-ink-400 dark:border-white/10 dark:text-ink-500">
      {children}
    </div>
  );
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
