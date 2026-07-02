'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AdminOrderStatus, OrderChannel } from '@fit/types';
import { Icon } from '@/components/ui';

/** Channel options offered by the filter. */
const CHANNEL_OPTIONS: ReadonlyArray<{ value: OrderChannel; label: string }> = [
  { value: 'POS', label: 'POS' },
  { value: 'ONLINE', label: 'Online' },
];

/**
 * The status pill tabs, in lifecycle order — the design's primary filter. "All"
 * clears the `status` param; the others pin one lifecycle status.
 */
const STATUS_TABS: ReadonlyArray<{ value: AdminOrderStatus | ''; label: string }> = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'PAID', label: 'Paid' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'REFUNDED', label: 'Refunded' },
];

/** The engine gradient shared by the active tab (Planflow "formacore"). */
const ENGINE_GRADIENT = 'bg-[linear-gradient(135deg,#7C3AED,#EC4899)]';

/** Debounce (ms) before a keystroke in the member box updates the URL. */
const SEARCH_DEBOUNCE_MS = 250;

/** Shared design-skin field styling (soft fill + inset ring) for inputs + selects. */
const FIELD_CLASS =
  'w-full h-11 rounded-field bg-ink-50 px-3.5 text-sm text-ink-900 ring-1 ring-inset ring-ink-200 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-white/[0.04] dark:text-white dark:ring-white/10 dark:placeholder:text-ink-500';

/** Shared label styling. */
const LABEL_CLASS = 'mb-1 block text-xs font-medium text-ink-500 dark:text-ink-400';

/**
 * The orders roster filter bar (T7.9): the status pill tabs + a debounced
 * member-id box on the first row, then the channel select and `from`/`to` date
 * range as secondary fields. Each writes its state to the URL search params (the
 * single source of truth the server page reads), resetting to page 1 on any
 * change. Navigation runs in a transition so the inputs stay responsive.
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
    <div className="flex flex-col gap-3">
      {/* Status tabs + member search. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div
          role="tablist"
          aria-label="Filter by order status"
          className="flex items-center gap-1.5 overflow-x-auto"
        >
          {STATUS_TABS.map((tab) => {
            const active = tab.value === status;
            return (
              <button
                key={tab.label}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => commit('status', tab.value)}
                className={`h-9 shrink-0 rounded-pill px-3.5 text-xs font-semibold ring-1 ring-inset transition ${
                  active
                    ? `${ENGINE_GRADIENT} text-white ring-transparent shadow-[0_6px_18px_-8px_rgba(124,58,237,0.8)]`
                    : 'bg-ink-50 text-ink-600 ring-ink-200 hover:bg-ink-100 dark:bg-white/[0.03] dark:text-ink-300 dark:ring-white/10 dark:hover:bg-white/[0.06]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="relative sm:ml-auto sm:w-64">
          <label htmlFor="order-member" className="sr-only">
            Filter by member id
          </label>
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 dark:text-ink-500">
            <Icon name="search" className="h-4 w-4" />
          </span>
          <input
            id="order-member"
            type="search"
            value={memberValue}
            onChange={(event) => onMemberChange(event.target.value)}
            placeholder="Filter by member id…"
            className={`${FIELD_CLASS} pl-9 pr-3`}
          />
        </div>
      </div>

      {/* Secondary filters: channel + date range. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="lg:w-40">
          <label htmlFor="order-channel" className={LABEL_CLASS}>
            Channel
          </label>
          <select
            id="order-channel"
            value={channel}
            onChange={(event) => commit('channel', event.target.value)}
            className={FIELD_CLASS}
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
          <label htmlFor="order-from" className={LABEL_CLASS}>
            From
          </label>
          <input
            id="order-from"
            type="date"
            value={from}
            onChange={(event) => commit('from', event.target.value)}
            className={FIELD_CLASS}
          />
        </div>

        <div className="lg:w-40">
          <label htmlFor="order-to" className={LABEL_CLASS}>
            To
          </label>
          <input
            id="order-to"
            type="date"
            value={to}
            onChange={(event) => commit('to', event.target.value)}
            className={FIELD_CLASS}
          />
        </div>
      </div>
    </div>
  );
}
