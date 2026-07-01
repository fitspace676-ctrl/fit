'use client';

import { useState } from 'react';
import type { MemberDetail } from '@fit/types';
import { Card, Icon } from '@/components/ui';

/** The detail page's history tabs, in display order. */
const TABS = ['Subscriptions', 'Bookings', 'Payments', 'Notes'] as const;
type Tab = (typeof TABS)[number];

/** Shared list-row surface, matching the formacore card treatment. */
const ROW_CLASS =
  'flex items-center justify-between rounded-card border border-ink-200 bg-white px-4 py-3 text-sm dark:border-white/10 dark:bg-white/[0.035]';

/** Format minor currency units (tetri) as a Georgian Lari amount. */
function formatAmount(minorUnits: number): string {
  return `₾${(minorUnits / 100).toLocaleString('en-US', {
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
 * The member detail page's tabbed history (Subscriptions / Bookings / Payments /
 * Notes). The data is fetched server-side and passed in; this component owns only
 * the active-tab selection. Each collection is empty until its backing model
 * lands (billing + attendance in Phase 5/6, notes in T4.3+), so every tab renders
 * its own empty state today — the final shape is already wired.
 */
export function MemberTabs({ member }: { member: MemberDetail }) {
  const [active, setActive] = useState<Tab>('Subscriptions');

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" className="flex gap-1 border-b border-ink-200 dark:border-white/10">
        {TABS.map((tab) => {
          const isActive = tab === active;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(tab)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
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
                      {formatDate(booking.startsAt)}
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
                      {formatAmount(payment.amount)}
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

        {active === 'Notes' &&
          (member.notes.trim().length === 0 ? (
            <EmptyState>No notes yet.</EmptyState>
          ) : (
            <p className="whitespace-pre-wrap rounded-card border border-ink-200 bg-white px-4 py-3 text-sm text-ink-700 dark:border-white/10 dark:bg-white/[0.035] dark:text-ink-200">
              {member.notes}
            </p>
          ))}
      </div>
    </div>
  );
}
