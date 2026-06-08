'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AdminOrderStatus, OrderChannel } from '@fit/types';

/** Channel options offered by the filter. */
const CHANNEL_OPTIONS: ReadonlyArray<{ value: OrderChannel; label: string }> = [
  { value: 'POS', label: 'POS' },
  { value: 'ONLINE', label: 'Online' },
];

/** Status options offered by the filter, in lifecycle order. */
const STATUS_OPTIONS: ReadonlyArray<{ value: AdminOrderStatus; label: string }> = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'PAID', label: 'Paid' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'REFUNDED', label: 'Refunded' },
];

/** Debounce (ms) before a keystroke in the member box updates the URL. */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * The orders roster filter bar (T7.9): channel + status selects, a debounced
 * member-id box, and a `from`/`to` date range. Each writes its state to the URL
 * search params (the single source of truth the server page reads), resetting to
 * page 1 on any change. Navigation runs in a transition so the inputs stay
 * responsive.
 */
export function OrdersFilters({
  channel,
  status,
  memberId,
  from,
  to,
}: {
  channel: string;
  status: string;
  memberId: string;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [memberValue, setMemberValue] = useState(memberId);

  useEffect(() => setMemberValue(memberId), [memberId]);

  function commit(key: string, value: string): void {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page');
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname));
  }

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onMemberChange(value: string): void {
    setMemberValue(value);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => commit('memberId', value.trim()), SEARCH_DEBOUNCE_MS);
  }

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
      <div className="lg:w-40">
        <label htmlFor="order-channel" className="mb-1 block text-xs font-medium text-slate-500">
          Channel
        </label>
        <select
          id="order-channel"
          value={channel}
          onChange={(event) => commit('channel', event.target.value)}
          className="w-full rounded-card border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
        >
          <option value="">All channels</option>
          {CHANNEL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="lg:w-40">
        <label htmlFor="order-status" className="mb-1 block text-xs font-medium text-slate-500">
          Status
        </label>
        <select
          id="order-status"
          value={status}
          onChange={(event) => commit('status', event.target.value)}
          className="w-full rounded-card border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 lg:min-w-48">
        <label htmlFor="order-member" className="mb-1 block text-xs font-medium text-slate-500">
          Member ID
        </label>
        <input
          id="order-member"
          type="search"
          value={memberValue}
          onChange={(event) => onMemberChange(event.target.value)}
          placeholder="Filter by member id…"
          className="w-full rounded-card border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
      </div>

      <div className="lg:w-40">
        <label htmlFor="order-from" className="mb-1 block text-xs font-medium text-slate-500">
          From
        </label>
        <input
          id="order-from"
          type="date"
          value={from}
          onChange={(event) => commit('from', event.target.value)}
          className="w-full rounded-card border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
      </div>

      <div className="lg:w-40">
        <label htmlFor="order-to" className="mb-1 block text-xs font-medium text-slate-500">
          To
        </label>
        <input
          id="order-to"
          type="date"
          value={to}
          onChange={(event) => commit('to', event.target.value)}
          className="w-full rounded-card border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
      </div>
    </div>
  );
}
