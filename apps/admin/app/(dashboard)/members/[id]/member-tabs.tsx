'use client';

import { useState } from 'react';
import type {
  MemberActivity,
  MemberActivityKind,
  MemberCurrentPlan,
  MemberDetail,
} from '@fit/types';
import { Badge, Btn, Card, Dot, Icon, type IconName, type Tone } from '@/components/ui';
import { Glyph } from '../glyphs';

/** The detail page's tabs, matching the Planflow "formacore" reference order. */
const TABS = ['Overview', 'Subscriptions', 'Bookings', 'Payments', 'Notes'] as const;
type Tab = (typeof TABS)[number];

/** The engine gradient the reference uses for the active-tab underline + bars. */
const ENGINE_GRADIENT = 'bg-[linear-gradient(135deg,#7C3AED,#EC4899)]';

/** The reference's soft inset panel (activity rows, plan panel, tag chips). */
const SOFT_PANEL = 'bg-ink-50 ring-ink-200 dark:bg-white/[0.03] dark:ring-white/10';

/** The reference's table-header cell treatment. */
const TH_CLASS =
  'px-4 py-2.5 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-400 dark:text-ink-500';

/** Icon + tone per activity kind, per the reference timeline. */
const ACTIVITY_STYLE: Record<MemberActivityKind, { icon: IconName; glow: string; text: string }> = {
  checkin: {
    icon: 'qr',
    glow: 'bg-success-500/25',
    text: 'text-success-600 dark:text-success-300',
  },
  booking: {
    icon: 'calendar',
    glow: 'bg-accent-500/25',
    text: 'text-accent-600 dark:text-accent-300',
  },
  payment: { icon: 'card', glow: 'bg-brand-500/25', text: 'text-brand-600 dark:text-brand-300' },
  milestone: {
    icon: 'flame',
    glow: 'bg-warning-500/25',
    text: 'text-warning-600 dark:text-warning-300',
  },
};

/** Badge treatment per subscription status (Prisma `SubscriptionStatus`). */
const SUB_STATUS: Record<string, { label: string; tone: Tone; dot: string }> = {
  ACTIVE: { label: 'Active', tone: 'success', dot: 'bg-success-400' },
  FROZEN: { label: 'Frozen', tone: 'warning', dot: 'bg-warning-400' },
  PAST_DUE: { label: 'Past due', tone: 'danger', dot: 'bg-danger-400' },
  CANCELED: { label: 'Cancelled', tone: 'ink', dot: 'bg-ink-400' },
  EXPIRED: { label: 'Expired', tone: 'danger', dot: 'bg-danger-400' },
};

/** Badge treatment per booking status (Prisma `BookingStatus`). */
const BOOKING_STATUS: Record<string, { label: string; tone: Tone }> = {
  BOOKED: { label: 'Booked', tone: 'accent' },
  WAITLIST: { label: 'Waitlist', tone: 'iris' },
  ATTENDED: { label: 'Attended', tone: 'success' },
  NO_SHOW: { label: 'No-show', tone: 'danger' },
  CANCELED: { label: 'Cancelled', tone: 'ink' },
};

/** Badge treatment per payment status (Prisma `PaymentStatus`). */
const PAYMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  CAPTURED: { label: 'Paid', tone: 'success' },
  PENDING: { label: 'Pending', tone: 'ink' },
  REFUNDED: { label: 'Refunded', tone: 'warning' },
  FAILED: { label: 'Failed', tone: 'danger' },
};

/** Format minor currency units as a Georgian Lari amount. */
function formatAmount(minorUnits: number, currency: string): string {
  const symbol = currency === 'GEL' ? '₾' : currency === 'USD' ? '$' : `${currency} `;
  return `${symbol}${(minorUnits / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Format an ISO instant as a short local date. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Format an ISO instant as a short local date-time. */
function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

/** A centered empty-state line shown when a tab has no records yet. */
function EmptyState({ children }: { children: string }) {
  return (
    <Card className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <Icon name="info" className="h-7 w-7 text-ink-300 dark:text-ink-500" />
      <p className="text-sm text-ink-500 dark:text-ink-400">{children}</p>
    </Card>
  );
}

/** A status badge from one of the lookup maps, falling back to the raw value. */
function StatusBadge({
  map,
  status,
}: {
  map: Record<string, { label: string; tone: Tone; dot?: string }>;
  status: string;
}) {
  const style = map[status] ?? { label: status, tone: 'ink' as Tone };
  return (
    <Badge tone={style.tone}>
      {style.dot ? <Dot c={style.dot} /> : null}
      {style.label}
    </Badge>
  );
}

/**
 * The member detail page's tabbed history (Overview / Subscriptions / Bookings /
 * Payments / Notes), styled to the Planflow "formacore" reference. The data is
 * fetched server-side and passed in; this component owns only the active-tab
 * selection. Every populated surface is a real, tenant-scoped fact; empty
 * collections render honest empty states. Tags + notes have no backing model, so
 * they show a disabled affordance / "No notes yet".
 */
export function MemberTabs({ member, canWrite }: { member: MemberDetail; canWrite: boolean }) {
  const [active, setActive] = useState<Tab>('Overview');

  return (
    <div className="flex flex-col gap-5">
      <div
        role="tablist"
        className="flex items-center gap-1 overflow-x-auto border-b border-ink-200 dark:border-white/10"
      >
        {TABS.map((tab) => {
          const isActive = tab === active;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(tab)}
              className={`relative h-11 shrink-0 whitespace-nowrap px-4 text-sm font-semibold transition ${
                isActive
                  ? 'text-ink-900 dark:text-white'
                  : 'text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white'
              }`}
            >
              {tab}
              {isActive ? (
                <span
                  aria-hidden
                  className={`absolute inset-x-3 -bottom-px h-0.5 rounded-full ${ENGINE_GRADIENT}`}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        {active === 'Overview' && <OverviewPanel member={member} canWrite={canWrite} />}

        {active === 'Subscriptions' &&
          (member.subscriptions.length === 0 ? (
            <EmptyState>No subscriptions yet.</EmptyState>
          ) : (
            <ul className="flex flex-col gap-3">
              {member.subscriptions.map((sub) => {
                const live = sub.status === 'ACTIVE' || sub.status === 'FROZEN';
                return (
                  <li key={sub.id}>
                    <Card glow className="p-4 sm:p-5">
                      <div className="flex items-center gap-4">
                        <span
                          aria-hidden
                          className={`h-12 w-1.5 shrink-0 rounded-full ${
                            live ? 'bg-brand-500' : 'bg-ink-300 dark:bg-ink-500'
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <p className="font-semibold text-ink-900 dark:text-white">
                              {sub.planName}
                            </p>
                            <StatusBadge map={SUB_STATUS} status={sub.status} />
                          </div>
                          <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                            Started {formatDate(sub.startedAt)}
                          </p>
                        </div>
                        <div className="hidden text-right sm:block">
                          <p className="font-mono text-sm font-semibold text-ink-900 dark:text-white">
                            {sub.renewsAt ? `Renews ${formatDate(sub.renewsAt)}` : '—'}
                          </p>
                        </div>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          ))}

        {active === 'Bookings' &&
          (member.bookings.length === 0 ? (
            <EmptyState>No bookings yet.</EmptyState>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse">
                  <thead>
                    <tr className="border-b border-ink-200 dark:border-white/10">
                      <th className={TH_CLASS}>Date &amp; time</th>
                      <th className={TH_CLASS}>Class</th>
                      <th className={`${TH_CLASS} pr-5 text-right`}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {member.bookings.map((booking) => (
                      <tr
                        key={booking.id}
                        className="border-b border-ink-200 transition last:border-0 hover:bg-ink-50 dark:border-white/10 dark:hover:bg-white/[0.04]"
                      >
                        <td className="px-4 py-3 font-mono text-sm text-ink-600 dark:text-ink-300">
                          {formatDateTime(booking.startsAt)}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-ink-900 dark:text-white">
                          {booking.title}
                        </td>
                        <td className="px-4 py-3 pr-5 text-right">
                          <StatusBadge map={BOOKING_STATUS} status={booking.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}

        {active === 'Payments' &&
          (member.payments.length === 0 ? (
            <EmptyState>No payments yet.</EmptyState>
          ) : (
            <div className="flex flex-col gap-4">
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] border-collapse">
                    <thead>
                      <tr className="border-b border-ink-200 dark:border-white/10">
                        <th className={TH_CLASS}>Date</th>
                        <th className={`${TH_CLASS} text-right`}>Amount</th>
                        <th className={`${TH_CLASS} pr-5 text-right`}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {member.payments.map((payment) => (
                        <tr
                          key={payment.id}
                          className="border-b border-ink-200 transition last:border-0 hover:bg-ink-50 dark:border-white/10 dark:hover:bg-white/[0.04]"
                        >
                          <td className="px-4 py-3 font-mono text-sm text-ink-600 dark:text-ink-300">
                            {formatDate(payment.paidAt)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-mono text-sm font-semibold tabular-nums ${
                              payment.status === 'REFUNDED'
                                ? 'text-ink-400 dark:text-ink-500'
                                : 'text-ink-900 dark:text-white'
                            }`}
                          >
                            {payment.status === 'REFUNDED' ? '−' : ''}
                            {formatAmount(payment.amount, member.currency)}
                          </td>
                          <td className="px-4 py-3 pr-5 text-right">
                            <StatusBadge map={PAYMENT_STATUS} status={payment.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
              <div className="flex items-center justify-between px-1">
                <span className="text-sm text-ink-500 dark:text-ink-400">
                  Total collected (lifetime)
                </span>
                <span className="font-display text-xl font-extrabold tabular-nums text-ink-900 dark:text-white">
                  {formatAmount(member.lifetimeValue, member.currency)}
                </span>
              </div>
            </div>
          ))}

        {active === 'Notes' && <EmptyState>No notes yet.</EmptyState>}
      </div>
    </div>
  );
}

/**
 * Overview — one card carrying the "Recent activity" timeline over an
 * "Attendance · last 8 weeks" bar chart (the reference's combined panel), with a
 * side column carrying the "Current plan" panel and "Tags". The timeline /
 * attendance / plan are all real; Tags is an honest empty state (no backing
 * model) with a disabled "Add" affordance.
 */
function OverviewPanel({ member, canWrite }: { member: MemberDetail; canWrite: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-3">
      <Card glow className="p-5 lg:col-span-2 sm:p-6">
        <h3 className="font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
          Recent activity
        </h3>
        <ActivityList activity={member.recentActivity} />
        <AttendanceSection member={member} />
      </Card>

      <div className="flex flex-col gap-4 sm:gap-5">
        <CurrentPlanCard plan={member.currentPlan} currency={member.currency} canWrite={canWrite} />
        <TagsCard tags={member.tags} />
      </div>
    </div>
  );
}

/** The "Recent activity" timeline — merged real check-ins / bookings / payments. */
function ActivityList({ activity }: { activity: MemberActivity[] }) {
  if (activity.length === 0) {
    return <p className="mt-4 text-sm text-ink-400">No recent activity.</p>;
  }
  return (
    <ul className="mt-4 space-y-2.5">
      {activity.map((entry, i) => {
        const style = ACTIVITY_STYLE[entry.kind];
        return (
          <li
            key={`${entry.kind}-${entry.at}-${i}`}
            className={`flex items-center gap-3 rounded-card p-3 ring-1 ring-inset ${SOFT_PANEL}`}
          >
            <span className="relative grid h-9 w-9 shrink-0 place-items-center">
              <span aria-hidden className={`absolute inset-0 blur-md ${style.glow}`} />
              <Icon name={style.icon} className={`relative h-5 w-5 ${style.text}`} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink-900 dark:text-white">
                {entry.title}
                {entry.detail ? (
                  <span className="text-ink-500 dark:text-ink-400"> · {entry.detail}</span>
                ) : null}
              </p>
            </div>
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink-400 dark:text-ink-500">
              {formatDateTime(entry.at)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** The "Attendance · last 8 weeks" bar chart — real per-week check-in counts. */
function AttendanceSection({ member }: { member: MemberDetail }) {
  const weeks = member.attendance8w;
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const avg = weeks.length > 0 ? weeks.reduce((s, w) => s + w.count, 0) / weeks.length : 0;
  return (
    <div className="mt-6 border-t border-ink-200 pt-5 dark:border-white/10">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-500 dark:text-ink-400">
          Attendance · last 8 weeks
        </h4>
        <span className="font-mono text-[11px] tabular-nums text-ink-500 dark:text-ink-400">
          avg {avg.toFixed(1)} / wk
        </span>
      </div>
      <div className="flex h-24 items-end gap-2">
        {weeks.map((week, i) => (
          <div
            key={week.weekStart}
            className="flex flex-1 flex-col items-center gap-1.5 self-stretch"
          >
            <div className="flex w-full flex-1 items-end">
              <div
                className={`w-full rounded-t-[4px] ${ENGINE_GRADIENT} transition-[height] duration-700 ease-out`}
                style={{
                  height: `${(week.count / max) * 100}%`,
                  minHeight: week.count > 0 ? 6 : 2,
                }}
                title={`${week.count} ${week.count === 1 ? 'visit' : 'visits'}`}
              />
            </div>
            <span className="font-mono text-[9px] tabular-nums text-ink-400 dark:text-ink-500">
              W{i + 1}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The "Current plan" panel — plan + interval badge, price line, days-left bar. */
function CurrentPlanCard({
  plan,
  currency,
  canWrite,
}: {
  plan: MemberCurrentPlan | null;
  currency: string;
  canWrite: boolean;
}) {
  if (!plan) {
    return (
      <Card glow className="p-5">
        <h3 className="font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
          Current plan
        </h3>
        <p className="mt-3 text-sm text-ink-400">No live subscription.</p>
      </Card>
    );
  }

  const periodDays = Math.max(
    1,
    Math.round(
      (new Date(plan.currentPeriodEnd).getTime() - new Date(plan.currentPeriodStart).getTime()) /
        86_400_000,
    ),
  );
  const pct = Math.max(0, Math.min(100, (plan.daysRemaining / periodDays) * 100));
  const symbol = currency === 'GEL' ? '₾' : currency === 'USD' ? '$' : `${currency} `;
  const price = `${symbol}${(plan.priceAmount / 100).toLocaleString('en-US', {
    maximumFractionDigits: 0,
  })}`;
  const per = plan.interval === 'YEAR' ? ' / yr' : plan.interval === 'MONTH' ? ' / mo' : '';
  const intervalLabel =
    plan.interval === 'YEAR' ? 'Yearly' : plan.interval === 'MONTH' ? 'Monthly' : null;

  return (
    <Card glow className="p-5">
      <h3 className="font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
        Current plan
      </h3>
      <div className={`mt-3 rounded-card p-3.5 ring-1 ring-inset ${SOFT_PANEL}`}>
        <div className="flex items-center justify-between">
          <span className="font-semibold text-ink-900 dark:text-white">{plan.name}</span>
          {intervalLabel ? <Badge tone="iris">{intervalLabel}</Badge> : null}
        </div>
        <p className="mt-1.5 font-mono text-xs text-ink-500 dark:text-ink-400">
          {price}
          {per} · renews {formatDate(plan.currentPeriodEnd)}
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-pill bg-ink-100 dark:bg-white/10">
          <div
            className={`h-full rounded-pill ${ENGINE_GRADIENT} transition-[width] duration-700 ease-out`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-ink-400 dark:text-ink-500">
          {plan.daysRemaining} of {periodDays} days remaining
        </p>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Btn v="outline" size="sm" className="flex-1" disabled={!canWrite}>
          <Glyph name="freeze" className="h-4 w-4" />
          Freeze
        </Btn>
        <Btn v="outline" size="sm" className="flex-1" disabled={!canWrite}>
          <Glyph name="gift" className="h-4 w-4" />
          Add credit
        </Btn>
      </div>
    </Card>
  );
}

/**
 * Tags — the Prisma schema has NO member-tag / label model, so this is an honest
 * empty state: no chips are ever rendered today (nothing to read), and the "Add"
 * affordance is disabled until a tags model lands. Never fabricated.
 */
function TagsCard({ tags }: { tags: string[] }) {
  return (
    <Card glow className="p-5">
      <h3 className="font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
        Tags
      </h3>
      {tags.length === 0 ? <p className="mt-3 text-sm text-ink-400">No tags yet.</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className={`inline-flex h-7 items-center rounded-pill px-2.5 text-xs font-semibold ring-1 ring-inset ${SOFT_PANEL} text-ink-600 dark:text-ink-300`}
          >
            {tag}
          </span>
        ))}
        <button
          type="button"
          disabled
          title="Member tags aren’t modelled yet"
          className="inline-flex h-7 items-center gap-1 rounded-pill border border-dashed border-ink-300 px-2.5 text-xs font-semibold text-ink-500 opacity-70 dark:border-white/20 dark:text-ink-400"
        >
          <Icon name="plus" className="h-3 w-3" sw={2.6} />
          Add
        </button>
      </div>
    </Card>
  );
}
