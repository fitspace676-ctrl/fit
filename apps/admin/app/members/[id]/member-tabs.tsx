'use client';

import { useState } from 'react';
import type { MemberDetail } from '@fit/types';

/** The detail page's history tabs, in display order. */
const TABS = ['Subscriptions', 'Bookings', 'Payments', 'Notes'] as const;
type Tab = (typeof TABS)[number];

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
    <p className="rounded-card border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
      {children}
    </p>
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
      <div role="tablist" className="flex gap-1 border-b border-slate-200">
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
                  ? 'border-brand-500 text-brand-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
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
                <li
                  key={sub.id}
                  className="flex items-center justify-between rounded-card border border-slate-100 px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-slate-900">{sub.planName}</p>
                    <p className="text-xs text-slate-500">
                      Started {formatDate(sub.startedAt)}
                      {sub.renewsAt ? ` · renews ${formatDate(sub.renewsAt)}` : ''}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-slate-600">{sub.status}</span>
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
                <li
                  key={booking.id}
                  className="flex items-center justify-between rounded-card border border-slate-100 px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-slate-900">{booking.title}</p>
                    <p className="text-xs text-slate-500">{formatDate(booking.startsAt)}</p>
                  </div>
                  <span className="text-xs font-medium text-slate-600">{booking.status}</span>
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
                <li
                  key={payment.id}
                  className="flex items-center justify-between rounded-card border border-slate-100 px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-slate-900">{formatAmount(payment.amount)}</p>
                    <p className="text-xs text-slate-500">{formatDate(payment.paidAt)}</p>
                  </div>
                  <span className="text-xs font-medium text-slate-600">{payment.status}</span>
                </li>
              ))}
            </ul>
          ))}

        {active === 'Notes' &&
          (member.notes.trim().length === 0 ? (
            <EmptyState>No notes yet.</EmptyState>
          ) : (
            <p className="whitespace-pre-wrap rounded-card border border-slate-100 px-4 py-3 text-sm text-slate-700">
              {member.notes}
            </p>
          ))}
      </div>
    </div>
  );
}
