import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Permission, roleHasPermission, type AdminPayment } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchOrder } from '@/lib/api';
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
        <Link href="/orders" className="text-sm text-brand-700 hover:underline">
          ← Back to orders
        </Link>
        <p className="rounded-card border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
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
      <Link href="/orders" className="text-sm text-brand-700 hover:underline">
        ← Back to orders
      </Link>

      {/* Identity header. */}
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-lg font-semibold text-slate-900">{order.id}</h1>
          <span className={`rounded-card px-2 py-0.5 text-xs font-medium ${status.className}`}>
            {status.label}
          </span>
          <span className="rounded-card bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {CHANNEL_LABELS[order.channel]}
          </span>
          <span className="rounded-card bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {FULFILLMENT_LABELS[order.fulfillment]}
          </span>
        </div>
        <p className="text-sm text-slate-500">
          {formatDateTime(order.createdAt)} ·{' '}
          {order.customerName ?? (order.memberId ? `Member ${order.memberId}` : 'Walk-in')}
        </p>
        <p className="text-sm text-slate-700">
          Total <span className="font-semibold">{formatMoney(order.total, order.currency)}</span>
          {order.refundedAmount > 0 && (
            <span className="text-rose-600">
              {' '}
              · {formatMoney(order.refundedAmount, order.currency)} refunded
            </span>
          )}
        </p>
        {order.fulfillment === 'DELIVERY' && order.deliveryAddress && (
          <p className="text-sm text-slate-700">
            <span className="text-slate-500">Deliver to:</span>{' '}
            <span className="whitespace-pre-line">{order.deliveryAddress}</span>
          </p>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Items. */}
        <section className="flex flex-col gap-3 rounded-card border border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-900">Items</h2>
          {order.items.length === 0 ? (
            <p className="text-sm text-slate-500">No line items.</p>
          ) : (
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-1.5 pr-4 font-medium">Item</th>
                  <th className="py-1.5 pr-4 text-right font-medium">Qty</th>
                  <th className="py-1.5 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100">
                    <td className="py-1.5 pr-4 text-slate-700">{item.label}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums text-slate-700">
                      {item.qty}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-slate-900">
                      {formatMoney(item.amount, order.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Payments. */}
        <section className="flex flex-col gap-3 rounded-card border border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-900">Payments</h2>
          {order.payments.length === 0 ? (
            <p className="text-sm text-slate-500">No payment recorded.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {order.payments.map((pay) => {
                const pillStatus = PAYMENT_STATUS_STYLES[pay.status];
                return (
                  <li key={pay.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2">
                      <span
                        className={`rounded-card px-2 py-0.5 text-xs font-medium ${pillStatus.className}`}
                      >
                        {pillStatus.label}
                      </span>
                      <span className="text-slate-700">{PAYMENT_METHOD_LABELS[pay.method]}</span>
                    </span>
                    <span className="tabular-nums text-slate-900">
                      {formatMoney(pay.amount, pay.currency)}
                      {pay.refundedAmount > 0 && (
                        <span className="text-rose-600">
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
        </section>

        {/* Refunds. */}
        <section className="flex flex-col gap-3 rounded-card border border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-900">Refunds</h2>
          {order.refunds.length === 0 ? (
            <p className="text-sm text-slate-500">No refunds issued.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {order.refunds.map((refund) => (
                <li
                  key={refund.id}
                  className="flex flex-col gap-0.5 border-b border-slate-100 pb-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">{formatDateTime(refund.createdAt)}</span>
                    <span className="tabular-nums font-medium text-rose-700">
                      −{formatMoney(refund.amount, order.currency)}
                    </span>
                  </div>
                  <span className="text-slate-700">{refund.reason}</span>
                  {!refund.restockItems && (
                    <span className="text-xs text-slate-400">Items not restocked</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Status timeline. */}
        <section className="flex flex-col gap-3 rounded-card border border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-900">Status timeline</h2>
          <ol className="flex flex-col gap-2 text-sm">
            {order.statusTimeline.map((entry, index) => {
              const pill = ORDER_STATUS_STYLES[entry.status];
              return (
                <li
                  key={`${entry.status}-${entry.at}-${index}`}
                  className="flex items-center gap-3"
                >
                  <span
                    className={`rounded-card px-2 py-0.5 text-xs font-medium ${pill.className}`}
                  >
                    {pill.label}
                  </span>
                  <span className="text-slate-500">{formatDateTime(entry.at)}</span>
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      {/* Refund control — BillingManage staff, while a balance remains. */}
      {canRefund && refundable > 0 && payment && (
        <section className="flex flex-col gap-3 rounded-card border border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-900">Issue a refund</h2>
          <RefundForm orderId={order.id} currency={order.currency} refundableMinor={refundable} />
        </section>
      )}
    </div>
  );
}
