'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AdminOrderRow, AdminOrderStatus } from '@fit/types';
import { Badge, Btn, Card, Dot } from '@/components/ui';
import {
  CHANNEL_LABELS,
  ORDER_STATUS_STYLES,
  TONE_DOTS,
  formatDateTime,
  formatMoney,
} from './format';
import { OrderGlyph } from './icons';

/** Column headers, in render order (design: Order · Customer · Items · Channel · Total · Status · ⋯). */
const HEADERS: ReadonlyArray<{ label: string; align?: 'right' }> = [
  { label: 'Order' },
  { label: 'Customer' },
  { label: 'Items' },
  { label: 'Channel' },
  { label: 'Total', align: 'right' },
  { label: 'Status' },
  { label: '', align: 'right' },
];

/** A status pill mirroring the reference styling — leading tone dot + label. */
function StatusPill({ status }: { status: AdminOrderStatus }) {
  const { label, tone } = ORDER_STATUS_STYLES[status];
  return (
    <Badge tone={tone}>
      <span className="inline-flex items-center gap-1.5">
        <Dot c={TONE_DOTS[tone]} />
        {label}
      </span>
    </Badge>
  );
}

/** Render a customer's initials for the avatar placeholder. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** The staff-facing customer label — the name, or who the order was rung up for. */
function customerLabel(order: AdminOrderRow): string {
  return order.customerName ?? (order.memberId ? 'Member' : 'Walk-in');
}

/**
 * The orders roster table (T7.9). Server-rendered data, client-side interaction:
 * row navigation into the detail page plus pagination, reading the URL search
 * params so the server page stays the single source of truth. Each row shows the
 * order id + date, who it's for, the item count, the sales channel, the total
 * (with the refunded amount called out), and the status pill. The data never
 * mutates here — refunds happen on the detail page.
 */
export function OrdersTable({
  orders,
  total,
  page,
  limit,
}: {
  orders: AdminOrderRow[];
  total: number;
  page: number;
  limit: number;
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
      <Card glow className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-ink-200 dark:border-white/10">
                {HEADERS.map((header, index) => (
                  <th
                    key={index}
                    className={`px-5 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400 ${
                      header.align === 'right' ? 'text-right' : ''
                    }`}
                  >
                    {header.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr
                  key={order.id}
                  onClick={() => router.push(`/orders/${order.id}`)}
                  className="cursor-pointer border-b border-ink-200 transition last:border-0 hover:bg-ink-50 dark:border-white/10 dark:hover:bg-white/[0.025]"
                >
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/orders/${order.id}`}
                      onClick={(event) => event.stopPropagation()}
                      className="font-mono text-xs font-semibold text-ink-900 hover:text-brand-600 dark:text-white dark:hover:text-brand-300"
                    >
                      {order.id.slice(-8)}
                    </Link>
                    <p className="text-xs text-ink-400 dark:text-ink-500">
                      {formatDateTime(order.createdAt)}
                    </p>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700 ring-1 ring-brand-500/20 dark:bg-brand-500/15 dark:text-brand-200">
                        {initialsOf(customerLabel(order))}
                      </span>
                      <span className="font-medium text-ink-600 dark:text-ink-300">
                        {customerLabel(order)}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-ink-600 dark:text-ink-300">
                    {order.itemCount} item{order.itemCount === 1 ? '' : 's'}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-600 dark:text-ink-300">
                      <OrderGlyph
                        name={order.channel === 'POS' ? 'pos' : 'globe'}
                        className="h-3.5 w-3.5 text-ink-500 dark:text-ink-400"
                        sw={2}
                      />
                      {CHANNEL_LABELS[order.channel]}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-ink-900 dark:text-white">
                    {formatMoney(order.total, order.currency)}
                    {order.refundedAmount > 0 && (
                      <span className="block text-xs font-normal text-danger-600 dark:text-danger-300">
                        −{formatMoney(order.refundedAmount, order.currency)} refunded
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusPill status={order.status} />
                  </td>
                  <td className="px-5 py-3.5" onClick={(event) => event.stopPropagation()}>
                    <div className="flex justify-end">
                      <Link
                        href={`/orders/${order.id}`}
                        aria-label={`Open order ${order.id.slice(-8)}`}
                        className="grid h-9 w-9 place-items-center rounded-btn text-ink-500 transition hover:bg-ink-100 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
                      >
                        <OrderGlyph name="dots" className="h-5 w-5" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && (
            <div className="py-16 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-card bg-ink-50 ring-1 ring-inset ring-ink-200 dark:bg-white/[0.03] dark:ring-white/10">
                <OrderGlyph name="box" className="h-6 w-6 text-ink-400 dark:text-ink-500" />
              </div>
              <p className="mt-3 font-semibold text-ink-900 dark:text-white">No orders here</p>
              <p className="text-sm text-ink-500 dark:text-ink-400">
                Try a different status or search.
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Pager. */}
      <div className="flex items-center justify-between text-sm text-ink-500 dark:text-ink-400">
        <span className="font-mono tabular-nums">
          {from}–{to} of {total}
        </span>
        <div className="flex gap-2">
          <Btn
            v="outline"
            size="sm"
            icon="chevronLeft"
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
            iconRight="chevronRight"
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
