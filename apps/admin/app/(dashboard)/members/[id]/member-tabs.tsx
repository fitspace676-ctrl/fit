'use client';

import { useState } from 'react';
import type {
  MemberActivity,
  MemberActivityKind,
  MemberCurrentPlan,
  MemberDetail,
} from '@fit/types';
import { Btn, Card, Icon, Progress, type IconName } from '@/components/ui';

/** The detail page's tabs, matching the Planflow "formacore" reference order. */
const TABS = ['Overview', 'Subscriptions', 'Bookings', 'Payments', 'Notes'] as const;
type Tab = (typeof TABS)[number];

/** Shared list-row surface, matching the formacore card treatment. */
const ROW_CLASS =
  'flex items-center justify-between rounded-card border border-ink-200 bg-white px-4 py-3 text-sm dark:border-white/10 dark:bg-white/[0.035]';

/** Icon + tint per activity kind. */
const ACTIVITY_ICON: Record<MemberActivityKind, IconName> = {
  checkin: 'check',
  booking: 'calendar',
  payment: 'card',
  milestone: 'star',
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

/**
 * The member detail page's tabbed history (Overview / Subscriptions / Bookings /
 * Payments / Notes). The data is fetched server-side and passed in; this component
 * owns only the active-tab selection. Every populated surface is a real,
 * tenant-scoped fact; empty collections render honest empty states. Tags + notes
 * have no backing model, so they show a disabled affordance / "No notes yet".
 */
export function MemberTabs({ member, canWrite }: { member: MemberDetail; canWrite: boolean }) {
  const [active, setActive] = useState<Tab>('Overview');

  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        className="flex gap-1 overflow-x-auto border-b border-ink-200 dark:border-white/10"
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
              className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium ${
                isActive
                  ? 'border-brand-500 text-brand-700 dark:text-brand-300'
                  : 'border-transparent text-ink-500 hover:text-ink-700 dark:text-ink-400 dark:hover:text-ink-200'
              }`}
            >
              {tab}
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
            <ul className="flex flex-col gap-2">
              {member.subscriptions.map((sub) => (
                <li key={sub.id} className={ROW_CLASS}>
                  <div>
                    <p className="font-medium text-ink-900 dark:text-white">{sub.planName}</p>
                    <p className="text-xs text-ink-500 dark:text-ink-400">
                      Started {formatDate(sub.startedAt)}
                      {sub.renewsAt ? ` · renews ${formatDate(sub.renewsAt)}` : ''}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-ink-600 dark:text-ink-300">
                    {sub.status}
                  </span>
                </li>
              ))}
            </ul>
          ))}

        {active === 'Bookings' &&
          (member.bookings.length === 0 ? (
            <EmptyState>No bookings yet.</EmptyState>
          ) : (
            <ul className="flex flex-col gap-2">
              {member.bookings.map((booking) => (
                <li key={booking.id} className={ROW_CLASS}>
                  <div>
                    <p className="font-medium text-ink-900 dark:text-white">{booking.title}</p>
                    <p className="text-xs text-ink-500 dark:text-ink-400">
                      {formatDateTime(booking.startsAt)}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-ink-600 dark:text-ink-300">
                    {booking.status}
                  </span>
                </li>
              ))}
            </ul>
          ))}

        {active === 'Payments' &&
          (member.payments.length === 0 ? (
            <EmptyState>No payments yet.</EmptyState>
          ) : (
            <ul className="flex flex-col gap-2">
              {member.payments.map((payment) => (
                <li key={payment.id} className={ROW_CLASS}>
                  <div>
                    <p className="font-mono font-medium tabular-nums text-ink-900 dark:text-white">
                      {formatAmount(payment.amount, member.currency)}
                    </p>
                    <p className="text-xs text-ink-500 dark:text-ink-400">
                      {formatDate(payment.paidAt)}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-ink-600 dark:text-ink-300">
                    {payment.status}
                  </span>
                </li>
              ))}
            </ul>
          ))}

        {active === 'Notes' && <EmptyState>No notes yet.</EmptyState>}
      </div>
    </div>
  );
}

/**
 * Overview — the "Recent activity" timeline + an "Attendance · last 8 weeks" bar
 * chart, with a side column carrying the "Current plan" panel and "Tags". The
 * timeline / attendance / plan are all real; Tags is an honest empty state (no
 * backing model) with a disabled "Add" affordance.
 */
function OverviewPanel({ member, canWrite }: { member: MemberDetail; canWrite: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <ActivityCard activity={member.recentActivity} />
        <AttendanceCard member={member} />
      </div>

      <div className="flex flex-col gap-4">
        <CurrentPlanCard plan={member.currentPlan} currency={member.currency} canWrite={canWrite} />
        <TagsCard tags={member.tags} />
      </div>
    </div>
  );
}

/** The "Recent activity" timeline — merged real check-ins / bookings / payments. */
function ActivityCard({ activity }: { activity: MemberActivity[] }) {
  return (
    <Card glow className="flex flex-col gap-4 p-5">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
        Recent activity
      </h3>
      {activity.length === 0 ? (
        <p className="text-sm text-ink-400">No recent activity.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {activity.map((entry, i) => (
            <li key={`${entry.kind}-${entry.at}-${i}`} className="flex items-start gap-3">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-btn bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                <Icon name={ACTIVITY_ICON[entry.kind]} className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-medium text-ink-900 dark:text-white">
                    {entry.title}
                  </p>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-ink-400">
                    {formatDateTime(entry.at)}
                  </span>
                </div>
                <p className="truncate text-xs text-ink-500 dark:text-ink-400">{entry.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** The "Attendance · last 8 weeks" bar chart — real per-week check-in counts. */
function AttendanceCard({ member }: { member: MemberDetail }) {
  const weeks = member.attendance8w;
  const max = Math.max(1, ...weeks.map((w) => w.count));
  return (
    <Card glow className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
          Attendance · last 8 weeks
        </h3>
        <span className="font-mono text-xs tabular-nums text-ink-400">
          {member.totalVisits} total
        </span>
      </div>
      <div className="flex h-32 items-end justify-between gap-2">
        {weeks.map((week) => {
          const label = new Date(week.weekStart).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          });
          return (
            <div key={week.weekStart} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t-btn bg-[linear-gradient(135deg,#7C3AED,#EC4899)] transition-[height] duration-700 ease-out"
                  style={{
                    height: `${(week.count / max) * 100}%`,
                    minHeight: week.count > 0 ? 6 : 2,
                  }}
                  title={`${week.count} ${week.count === 1 ? 'visit' : 'visits'}`}
                />
              </div>
              <span className="font-mono text-[10px] tabular-nums text-ink-400">{label}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** The "Current plan" panel — name / interval / price / renews + days-remaining. */
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
      <Card glow className="flex flex-col gap-3 p-5">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
          Current plan
        </h3>
        <p className="text-sm text-ink-400">No live subscription.</p>
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
  const interval =
    plan.interval === 'YEAR' ? 'year' : plan.interval === 'MONTH' ? 'month' : 'period';

  return (
    <Card glow className="flex flex-col gap-4 p-5">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
        Current plan
      </h3>

      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: plan.color ?? '#7C3AED' }}
        />
        <span className="font-display text-lg font-extrabold text-ink-900 dark:text-white">
          {plan.name}
        </span>
      </div>

      <div className="flex items-baseline gap-1">
        <span className="font-mono text-2xl font-bold tabular-nums text-ink-900 dark:text-white">
          {currency === 'GEL' ? '₾' : currency === 'USD' ? '$' : `${currency} `}
          {(plan.priceAmount / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}
        </span>
        <span className="text-sm text-ink-500 dark:text-ink-400">/{interval}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-ink-500 dark:text-ink-400">
          <span>Renews {formatDate(plan.currentPeriodEnd)}</span>
          <span className="font-mono tabular-nums">
            {plan.daysRemaining} {plan.daysRemaining === 1 ? 'day' : 'days'} left
          </span>
        </div>
        <Progress value={pct} />
      </div>

      <div className="flex gap-2">
        <Btn v="outline" size="sm" icon="clock" disabled={!canWrite}>
          Freeze
        </Btn>
        <Btn v="outline" size="sm" icon="plus" disabled={!canWrite}>
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
    <Card glow className="flex flex-col gap-3 p-5">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">Tags</h3>
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-pill bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-600 dark:bg-white/10 dark:text-ink-300"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-400">No tags yet.</p>
      )}
      <Btn v="outline" size="sm" icon="tag" disabled title="Member tags aren’t modelled yet">
        Add
      </Btn>
    </Card>
  );
}
