'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AdminOrderRow, AdminOrderStatus } from '@fit/types';
import { Badge, Btn, Card, buttonClasses } from '@/components/ui';
import {
  CHANNEL_LABELS,
  ORDER_STATUS_STYLES,
  PAYMENT_METHOD_LABELS,
  formatDateTime,
  formatMoney,
} from './format';

/** A status pill mirroring the products roster styling. */
function StatusPill({ status }: { status: AdminOrderStatus }) {
  const { label, tone } = ORDER_STATUS_STYLES[status];
  return <Badge tone={tone}>{label}</Badge>;
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
        <a href={`/orders/export${exportQuery}`} className={buttonClasses('outline', 'sm')}>
          Export CSV
        </a>
      </div>

      {orders.length === 0 ? (
        <Card className="px-4 py-10 text-center text-sm text-ink-500 dark:text-ink-400">
          No orders match your filters yet.
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-ink-100 dark:border-white/10">
                <th className="px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                  Order
                </th>
                <th className="px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                  Date
                </th>
                <th className="px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                  Channel
                </th>
                <th className="px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                  Status
                </th>
                <th className="px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                  Customer
                </th>
                <th className="px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                  Method
                </th>
                <th className="px-4 py-3 text-right font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                  Total
                </th>
                <th className="px-4 py-3 text-right font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                  Items
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr
                  key={order.id}
                  className="border-b border-ink-50 last:border-0 hover:bg-ink-50 dark:border-white/5 dark:hover:bg-white/[0.04]"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/orders/${order.id}`}
                      className="font-mono text-xs font-medium text-ink-900 hover:text-brand-600 dark:text-white dark:hover:text-brand-300"
                    >
                      {order.id.slice(-8)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-700 dark:text-ink-200">
                    {formatDateTime(order.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-ink-700 dark:text-ink-200">
                    {CHANNEL_LABELS[order.channel]}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={order.status} />
                  </td>
                  <td className="px-4 py-3 text-ink-700 dark:text-ink-200">
                    {order.customerName ?? (order.memberId ? 'Member' : 'Walk-in')}
                  </td>
                  <td className="px-4 py-3 text-ink-700 dark:text-ink-200">
                    {order.paymentMethod ? PAYMENT_METHOD_LABELS[order.paymentMethod] : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-ink-900 dark:text-white">
                    {formatMoney(order.total, order.currency)}
                    {order.refundedAmount > 0 && (
                      <span className="block text-xs font-normal text-danger-600 dark:text-danger-300">
                        −{formatMoney(order.refundedAmount, order.currency)} refunded
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-ink-700 dark:text-ink-200">
                    {order.itemCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Pager. */}
      <div className="flex items-center justify-between text-sm text-ink-500 dark:text-ink-400">
        <span className="font-mono tabular-nums">
          {from}–{to} of {total}
        </span>
        <div className="flex gap-2">
          <Btn
            v="outline"
            size="sm"
            disabled={!hasPrev}
            onClick={() =>
              startTransition(() => router.replace(hrefWith({ page: String(page - 1) })))
            }
          >
            Previous
          </Btn>
          <Btn
            v="outline"
            size="sm"
            disabled={!hasNext}
            onClick={() =>
              startTransition(() => router.replace(hrefWith({ page: String(page + 1) })))
            }
          >
            Next
          </Btn>
        </div>
      </div>
    </div>
  );
}
