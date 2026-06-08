'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AdminOrderRow, AdminOrderStatus } from '@fit/types';
import {
  CHANNEL_LABELS,
  ORDER_STATUS_STYLES,
  PAYMENT_METHOD_LABELS,
  formatDateTime,
  formatMoney,
} from './format';

/** A status pill mirroring the products roster styling. */
function StatusPill({ status }: { status: AdminOrderStatus }) {
  const { label, className } = ORDER_STATUS_STYLES[status];
  return (
    <span className={`rounded-card px-2 py-0.5 text-xs font-medium ${className}`}>{label}</span>
  );
}

/**
 * The orders roster table (T7.9). Server-rendered data, client-side interaction:
 * pagination and a CSV-export link, both reading the URL search params so the
 * server page stays the single source of truth. Each row shows the order's date,
 * channel, status, who it's for, the settlement method, the net total (with the
 * refunded amount called out), and the item count. The data never mutates here —
 * refunds happen on the detail page.
 */
export function OrdersTable({
  orders,
  total,
  page,
  limit,
  exportQuery,
}: {
  orders: AdminOrderRow[];
  total: number;
  page: number;
  limit: number;
  /** The active filters as a `?key=value` string, forwarded to the export link. */
  exportQuery: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function hrefWith(overrides: Record<string, string>): string {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(overrides)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const hasPrev = page > 1;
  const hasNext = page * limit < total;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <a
          href={`/orders/export${exportQuery}`}
          className="rounded-card border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Export CSV
        </a>
      </div>

      {orders.length === 0 ? (
        <p className="rounded-card border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
          No orders match your filters yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4 font-medium">Order</th>
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Channel</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Customer</th>
                <th className="py-2 pr-4 font-medium">Method</th>
                <th className="py-2 pr-4 text-right font-medium">Total</th>
                <th className="py-2 pr-4 text-right font-medium">Items</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                  <td className="py-2 pr-4">
                    <Link
                      href={`/orders/${order.id}`}
                      className="font-mono text-xs font-medium text-slate-900 hover:text-brand-700"
                    >
                      {order.id.slice(-8)}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-slate-700">{formatDateTime(order.createdAt)}</td>
                  <td className="py-2 pr-4 text-slate-700">{CHANNEL_LABELS[order.channel]}</td>
                  <td className="py-2 pr-4">
                    <StatusPill status={order.status} />
                  </td>
                  <td className="py-2 pr-4 text-slate-700">
                    {order.customerName ?? (order.memberId ? 'Member' : 'Walk-in')}
                  </td>
                  <td className="py-2 pr-4 text-slate-700">
                    {order.paymentMethod ? PAYMENT_METHOD_LABELS[order.paymentMethod] : '—'}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-slate-900">
                    {formatMoney(order.total, order.currency)}
                    {order.refundedAmount > 0 && (
                      <span className="block text-xs font-normal text-rose-600">
                        −{formatMoney(order.refundedAmount, order.currency)} refunded
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-slate-700">
                    {order.itemCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pager. */}
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span className="tabular-nums">
          {from}–{to} of {total}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!hasPrev}
            onClick={() =>
              startTransition(() => router.replace(hrefWith({ page: String(page - 1) })))
            }
            className="rounded-card border border-slate-200 px-3 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={!hasNext}
            onClick={() =>
              startTransition(() => router.replace(hrefWith({ page: String(page + 1) })))
            }
            className="rounded-card border border-slate-200 px-3 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
