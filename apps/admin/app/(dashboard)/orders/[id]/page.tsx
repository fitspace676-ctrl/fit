import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Permission, roleHasPermission, type AdminPayment } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchOrder } from '@/lib/api';
import { Badge, Card, Icon, type IconName, type Tone } from '@/components/ui';
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

/** The status-dot fill per pill tone, for the vertical timeline rail. */
const TIMELINE_DOT: Record<Tone, string> = {
  ink: 'bg-ink-300 dark:bg-white/30',
  brand: 'bg-brand-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
  accent: 'bg-accent-500',
  iris: 'bg-iris-500',
  flame: 'bg-flame-500',
};

/** One detail KPI card — icon tile, headline value, and label. */
function DetailKpi({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: IconName;
  /** Tailwind text-colour for the icon tile, matching the formacore tiles. */
  tone: string;
}) {
  return (
    <Card glow className="flex h-full flex-col p-5">
      <span className="grid h-10 w-10 place-items-center rounded-btn bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
        <Icon name={icon} className={`h-5 w-5 ${tone}`} />
      </span>
      <p className="mt-4 font-display text-2xl font-extrabold tabular-nums tracking-tight text-ink-900 dark:text-white">
        {value}
      </p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
        {label}
      </p>
    </Card>
  );
}

/**
 * The order detail page (T4.4), reskinned to the Planflow "formacore" layout that
 * the orders roster (T4.3) established: a breadcrumb, a back link, an identity
 * header card (order id + status/channel/fulfilment badges), a four-tile KPI row
 * (total / refunded / net / items), and a two-rail body — items, payments and
 * refunds in the main column, the append-only status timeline in the side rail.
 * `BillingManage` staff also get the refund control while a refundable balance
 * remains. Every figure comes from `GET /orders/:id`; the timeline is the
 * `OrderStatusEvent` log the API returns. A `404` — unknown or cross-tenant id —
 * becomes Next's `notFound()`; any other failure surfaces inline.
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
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
        >
          <Icon name="arrowLeft" className="h-4 w-4" sw={2} /> Back to orders
        </Link>
        <Card className="flex items-start gap-3 border-danger-200 bg-danger-50 p-4 dark:border-danger-500/20 dark:bg-danger-500/10">
          <Icon
            name="info"
            className="mt-0.5 h-5 w-5 shrink-0 text-danger-600 dark:text-danger-300"
          />
          <p role="alert" className="text-sm text-danger-700 dark:text-danger-200">
            {message}
          </p>
        </Card>
      </div>
    );
  }

  const status = ORDER_STATUS_STYLES[order.status];
  const payment = order.payments[0];
  const refundable = refundableMinor(payment);

  const netMinor = Math.max(0, order.total - order.refundedAmount);
  const itemCount = order.items.reduce((sum, item) => sum + item.qty, 0);
  const shortId = order.id.slice(0, 8);

  const session = await getServerSession();
  const canRefund = session !== null && roleHasPermission(session.role, Permission.BillingManage);

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb. */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs font-medium text-ink-400 dark:text-ink-500"
      >
        <span>Iron Gym</span>
        <Icon name="chevronRight" className="h-3.5 w-3.5" />
        <Link href="/orders" className="hover:text-ink-600 dark:hover:text-ink-300">
          Orders
        </Link>
        <Icon name="chevronRight" className="h-3.5 w-3.5" />
        <span className="font-mono text-ink-600 dark:text-ink-300">{shortId}</span>
      </nav>

      <Link
        href="/orders"
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
      >
        <Icon name="arrowLeft" className="h-4 w-4" sw={2} /> Back to orders
      </Link>

      {/* Identity header card. */}
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-btn bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
            <Icon name="bag" className="h-6 w-6" />
          </span>
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-lg font-semibold text-ink-900 dark:text-white sm:text-xl">
                {order.id}
              </h1>
              <Badge tone={status.tone}>{status.label}</Badge>
              <Badge tone="ink">{CHANNEL_LABELS[order.channel]}</Badge>
              <Badge tone="ink">{FULFILLMENT_LABELS[order.fulfillment]}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500 dark:text-ink-400">
              <span>{formatDateTime(order.createdAt)}</span>
              <span aria-hidden>·</span>
              <span>
                {order.customerName ?? (order.memberId ? `Member ${order.memberId}` : 'Walk-in')}
              </span>
            </div>
            {order.fulfillment === 'DELIVERY' && order.deliveryAddress && (
              <p className="text-xs text-ink-700 dark:text-ink-200">
                <span className="text-ink-500 dark:text-ink-400">Deliver to:</span>{' '}
                <span className="whitespace-pre-line">{order.deliveryAddress}</span>
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* KPI row. */}
      <section aria-label="Order metrics" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <DetailKpi
          label="Order total"
          value={formatMoney(order.total, order.currency)}
          icon="card"
          tone="text-brand-500 dark:text-brand-300"
        />
        <DetailKpi
          label="Refunded"
          value={formatMoney(order.refundedAmount, order.currency)}
          icon="arrowLeft"
          tone="text-danger-600 dark:text-danger-300"
        />
        <DetailKpi
          label="Net kept"
          value={formatMoney(netMinor, order.currency)}
          icon="chart"
          tone="text-accent-600 dark:text-accent-300"
        />
        <DetailKpi
          label={itemCount === 1 ? 'Item' : 'Items'}
          value={itemCount.toLocaleString()}
          icon="bag"
          tone="text-success-600 dark:text-success-300"
        />
      </section>

      {/* Two-rail body: items + payments + refunds in the main column, the status
          timeline in the side rail. */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Items. */}
          <Card className="flex flex-col gap-3 p-5">
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
                      <td className="py-2 pr-4 text-ink-700 dark:text-ink-200">{item.label}</td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums text-ink-700 dark:text-ink-200">
                        {item.qty}
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums text-ink-900 dark:text-white">
                        {formatMoney(item.amount, order.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-ink-100 dark:border-white/10">
                    <td
                      colSpan={2}
                      className="py-2 pr-4 text-xs font-semibold uppercase tracking-[0.12em] text-ink-400"
                    >
                      Total
                    </td>
                    <td className="py-2 text-right font-mono font-semibold tabular-nums text-ink-900 dark:text-white">
                      {formatMoney(order.total, order.currency)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </Card>

          <div className="grid gap-6 sm:grid-cols-2">
            {/* Payments. */}
            <Card className="flex flex-col gap-3 p-5">
              <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Payments</h2>
              {order.payments.length === 0 ? (
                <p className="text-sm text-ink-500 dark:text-ink-400">No payment recorded.</p>
              ) : (
                <ul className="flex flex-col gap-2.5">
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
            <Card className="flex flex-col gap-3 p-5">
              <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Refunds</h2>
              {order.refunds.length === 0 ? (
                <p className="text-sm text-ink-500 dark:text-ink-400">No refunds issued.</p>
              ) : (
                <ul className="flex flex-col gap-2.5 text-sm">
                  {order.refunds.map((refund) => (
                    <li
                      key={refund.id}
                      className="flex flex-col gap-0.5 border-b border-ink-50 pb-2.5 last:border-0 last:pb-0 dark:border-white/5"
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
          </div>

          {/* Refund control — BillingManage staff, while a balance remains. */}
          {canRefund && refundable > 0 && payment && (
            <Card className="flex flex-col gap-3 p-5">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-sm font-semibold text-ink-900 dark:text-white">
                  Issue a refund
                </h2>
                <p className="text-xs text-ink-500 dark:text-ink-400">
                  Up to {formatMoney(refundable, order.currency)} remaining on this order.
                </p>
              </div>
              <RefundForm
                orderId={order.id}
                currency={order.currency}
                refundableMinor={refundable}
              />
            </Card>
          )}
        </div>

        {/* Status timeline (side rail). */}
        <Card className="flex h-fit flex-col gap-4 p-5">
          <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Status timeline</h2>
          {order.statusTimeline.length === 0 ? (
            <p className="text-sm text-ink-500 dark:text-ink-400">No status history.</p>
          ) : (
            <ol className="flex flex-col">
              {order.statusTimeline.map((entry, index) => {
                const pill = ORDER_STATUS_STYLES[entry.status];
                const isLast = index === order.statusTimeline.length - 1;
                return (
                  <li key={`${entry.status}-${entry.at}-${index}`} className="flex gap-3">
                    {/* Rail: dot + connector to the next entry. */}
                    <div className="flex flex-col items-center">
                      <span
                        className={`mt-1 h-3 w-3 shrink-0 rounded-full ring-4 ring-white dark:ring-ink-900 ${TIMELINE_DOT[pill.tone]}`}
                      />
                      {!isLast && (
                        <span aria-hidden className="w-px flex-1 bg-ink-100 dark:bg-white/10" />
                      )}
                    </div>
                    <div className={`flex flex-col gap-1 ${isLast ? '' : 'pb-5'}`}>
                      <Badge tone={pill.tone}>{pill.label}</Badge>
                      <span className="text-xs text-ink-500 dark:text-ink-400">
                        {formatDateTime(entry.at)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
