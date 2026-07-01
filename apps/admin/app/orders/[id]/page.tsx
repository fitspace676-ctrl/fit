import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Permission, roleHasPermission, type AdminPayment } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchOrder } from '@/lib/api';
import { Badge, Card, Icon } from '@/components/ui';
import {
  CHANNEL_LABELS,
  FULFILLMENT_LABELS,
  ORDER_STATUS_STYLES,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_STYLES,
  formatDateTime,
  formatMoney,
} from '../format';
import { RefundForm } from './refund-form';

export const metadata: Metadata = {
  title: 'Order — Fit Admin',
};

// The detail reflects live order state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** The remaining refundable balance on a payment, in minor units. */
function refundableMinor(payment: AdminPayment | undefined): number {
  return payment ? Math.max(0, payment.amount - payment.refundedAmount) : 0;
}

/**
 * The order detail page (T7.9). Server-fetches `GET /orders/:id` and renders the
 * identity header (status + channel + totals), the items table, the payments list,
 * the refunds list, and the generated status timeline. `BillingManage` staff also
 * get the refund control while a refundable balance remains. A `404` — unknown or
 * cross-tenant id — becomes Next's `notFound()`; any other failure surfaces inline.
 */
export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let order;
  try {
    order = await fetchOrder(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    const message =
      error instanceof ApiError
        ? `Could not load this order (${error.status}): ${error.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/orders"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
        >
          <Icon name="arrowLeft" className="h-4 w-4" /> Back to orders
        </Link>
        <p className="rounded-card border border-danger-500/30 bg-danger-500/10 px-4 py-3 text-sm text-danger-700 dark:text-danger-300">
          {message}
        </p>
      </div>
    );
  }

  const status = ORDER_STATUS_STYLES[order.status];
  const payment = order.payments[0];
  const refundable = refundableMinor(payment);

  const session = await getServerSession();
  const canRefund = session !== null && roleHasPermission(session.role, Permission.BillingManage);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/orders"
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
      >
        <Icon name="arrowLeft" className="h-4 w-4" /> Back to orders
      </Link>

      {/* Identity header. */}
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-lg font-semibold text-ink-900 dark:text-white">
            {order.id}
          </h1>
          <Badge tone={status.tone}>{status.label}</Badge>
          <Badge tone="ink">{CHANNEL_LABELS[order.channel]}</Badge>
          <Badge tone="ink">{FULFILLMENT_LABELS[order.fulfillment]}</Badge>
        </div>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          {formatDateTime(order.createdAt)} ·{' '}
          {order.customerName ?? (order.memberId ? `Member ${order.memberId}` : 'Walk-in')}
        </p>
        <p className="text-sm text-ink-700 dark:text-ink-200">
          Total{' '}
          <span className="font-mono font-semibold tabular-nums">
            {formatMoney(order.total, order.currency)}
          </span>
          {order.refundedAmount > 0 && (
            <span className="font-mono tabular-nums text-danger-600 dark:text-danger-300">
              {' '}
              · {formatMoney(order.refundedAmount, order.currency)} refunded
            </span>
          )}
        </p>
        {order.fulfillment === 'DELIVERY' && order.deliveryAddress && (
          <p className="text-sm text-ink-700 dark:text-ink-200">
            <span className="text-ink-500 dark:text-ink-400">Deliver to:</span>{' '}
            <span className="whitespace-pre-line">{order.deliveryAddress}</span>
          </p>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Items. */}
        <Card className="flex flex-col gap-3 p-4">
          <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Items</h2>
          {order.items.length === 0 ? (
            <p className="text-sm text-ink-500 dark:text-ink-400">No line items.</p>
          ) : (
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-ink-100 dark:border-white/10">
                  <th className="py-1.5 pr-4 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                    Item
                  </th>
                  <th className="py-1.5 pr-4 text-right font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                    Qty
                  </th>
                  <th className="py-1.5 text-right font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-ink-50 last:border-0 dark:border-white/5"
                  >
                    <td className="py-1.5 pr-4 text-ink-700 dark:text-ink-200">{item.label}</td>
                    <td className="py-1.5 pr-4 text-right font-mono tabular-nums text-ink-700 dark:text-ink-200">
                      {item.qty}
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-ink-900 dark:text-white">
                      {formatMoney(item.amount, order.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Payments. */}
        <Card className="flex flex-col gap-3 p-4">
          <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Payments</h2>
          {order.payments.length === 0 ? (
            <p className="text-sm text-ink-500 dark:text-ink-400">No payment recorded.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {order.payments.map((pay) => {
                const pillStatus = PAYMENT_STATUS_STYLES[pay.status];
                return (
                  <li key={pay.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2">
                      <Badge tone={pillStatus.tone}>{pillStatus.label}</Badge>
                      <span className="text-ink-700 dark:text-ink-200">
                        {PAYMENT_METHOD_LABELS[pay.method]}
                      </span>
                    </span>
                    <span className="font-mono tabular-nums text-ink-900 dark:text-white">
                      {formatMoney(pay.amount, pay.currency)}
                      {pay.refundedAmount > 0 && (
                        <span className="text-danger-600 dark:text-danger-300">
                          {' '}
                          (−{formatMoney(pay.refundedAmount, pay.currency)})
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Refunds. */}
        <Card className="flex flex-col gap-3 p-4">
          <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Refunds</h2>
          {order.refunds.length === 0 ? (
            <p className="text-sm text-ink-500 dark:text-ink-400">No refunds issued.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {order.refunds.map((refund) => (
                <li
                  key={refund.id}
                  className="flex flex-col gap-0.5 border-b border-ink-50 pb-2 last:border-0 dark:border-white/5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-ink-500 dark:text-ink-400">
                      {formatDateTime(refund.createdAt)}
                    </span>
                    <span className="font-mono font-medium tabular-nums text-danger-700 dark:text-danger-300">
                      −{formatMoney(refund.amount, order.currency)}
                    </span>
                  </div>
                  <span className="text-ink-700 dark:text-ink-200">{refund.reason}</span>
                  {!refund.restockItems && (
                    <span className="text-xs text-ink-400">Items not restocked</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Status timeline. */}
        <Card className="flex flex-col gap-3 p-4">
          <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Status timeline</h2>
          <ol className="flex flex-col gap-2 text-sm">
            {order.statusTimeline.map((entry, index) => {
              const pill = ORDER_STATUS_STYLES[entry.status];
              return (
                <li
                  key={`${entry.status}-${entry.at}-${index}`}
                  className="flex items-center gap-3"
                >
                  <Badge tone={pill.tone}>{pill.label}</Badge>
                  <span className="text-ink-500 dark:text-ink-400">{formatDateTime(entry.at)}</span>
                </li>
              );
            })}
          </ol>
        </Card>
      </div>

      {/* Refund control — BillingManage staff, while a balance remains. */}
      {canRefund && refundable > 0 && payment && (
        <Card className="flex flex-col gap-3 p-4">
          <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Issue a refund</h2>
          <RefundForm orderId={order.id} currency={order.currency} refundableMinor={refundable} />
        </Card>
      )}
    </div>
  );
}
