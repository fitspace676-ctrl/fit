import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Permission, roleHasPermission, type AdminPayment } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchOrder } from '@/lib/api';
import { Badge, Card, Dot, Icon, type Tone } from '@/components/ui';
import {
  CHANNEL_LABELS,
  FULFILLMENT_LABELS,
  ORDER_STATUS_STYLES,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_STYLES,
  TONE_DOTS,
  formatDateTime,
  formatMoney,
} from '../format';
import { OrderGlyph } from '../icons';
import { RefundForm } from './refund-form';

export const metadata: Metadata = {
  title: 'Order — Fit Admin',
};

// The detail reflects live order state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** The design drawer's section micro-label. */
const SECTION_LABEL =
  'text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500 dark:text-ink-400';

/** The design's soft inset panel (customer strip + item rows). */
const SOFT_PANEL =
  'rounded-card bg-ink-50 ring-1 ring-inset ring-ink-200 dark:bg-white/[0.03] dark:ring-white/10';

/** The remaining refundable balance on a payment, in minor units. */
function refundableMinor(payment: AdminPayment | undefined): number {
  return payment ? Math.max(0, payment.amount - payment.refundedAmount) : 0;
}

/** A status pill mirroring the roster styling — leading tone dot + label. */
function StatusBadge({ label, tone }: { label: string; tone: Tone }) {
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

/**
 * The order detail page (T7.9). Server-fetches `GET /orders/:id` and renders the
 * identity header (gradient order tile + customer strip), the items card with its
 * totals block, the payments list, the refunds list, and the generated status
 * timeline. `BillingManage` staff also get the refund control while a refundable
 * balance remains. A `404` — unknown or cross-tenant id — becomes Next's
 * `notFound()`; any other failure surfaces inline.
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
  const customer = order.customerName ?? (order.memberId ? 'Member' : 'Walk-in');
  const netTotal = order.total - order.refundedAmount;

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

      {/* Identity header — the drawer's gradient order tile + id + date. */}
      <header className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-btn bg-[linear-gradient(135deg,#7C3AED,#EC4899)] text-white">
          <OrderGlyph name="box" className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate font-display text-lg font-extrabold tracking-tight text-ink-900 dark:text-white">
            {order.id}
          </h1>
          <p className="text-xs text-ink-500 dark:text-ink-400">
            {formatDateTime(order.createdAt)}
          </p>
        </div>
      </header>

      {/* Customer strip — who the order is for, its channel/fulfilment, and status. */}
      <div className={`flex items-center gap-3 p-3 ${SOFT_PANEL}`}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 ring-1 ring-brand-500/20 dark:bg-brand-500/15 dark:text-brand-200">
          {initialsOf(customer)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink-900 dark:text-white">{customer}</p>
          <p className="truncate text-xs text-ink-400 dark:text-ink-500">
            {CHANNEL_LABELS[order.channel]} · {FULFILLMENT_LABELS[order.fulfillment]}
            {order.memberId ? ` · Member ${order.memberId}` : ''}
          </p>
        </div>
        <StatusBadge label={status.label} tone={status.tone} />
      </div>

      {order.fulfillment === 'DELIVERY' && order.deliveryAddress && (
        <p className="text-sm text-ink-700 dark:text-ink-200">
          <span className="text-ink-500 dark:text-ink-400">Deliver to:</span>{' '}
          <span className="whitespace-pre-line">{order.deliveryAddress}</span>
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Items + totals. */}
        <Card glow className="flex flex-col gap-3 p-5">
          <h2 className={SECTION_LABEL}>Items</h2>
          {order.items.length === 0 ? (
            <p className="text-sm text-ink-500 dark:text-ink-400">No line items.</p>
          ) : (
            <div className="space-y-2">
              {order.items.map((item) => (
                <div key={item.id} className={`flex items-center gap-3 p-3 ${SOFT_PANEL}`}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-btn bg-white ring-1 ring-inset ring-ink-200 dark:bg-white/[0.06] dark:ring-white/10">
                    <OrderGlyph name="bag" className="h-4 w-4 text-ink-500 dark:text-ink-400" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900 dark:text-white">
                      {item.label}
                    </p>
                    <p className="text-xs text-ink-400 dark:text-ink-500">Qty {item.qty}</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-ink-900 dark:text-white">
                    {formatMoney(item.amount, order.currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {/* Totals block — the real total and the running refunded amount. */}
          <div className="space-y-1.5 pt-1">
            {order.refundedAmount > 0 && (
              <>
                <div className="flex justify-between text-sm text-ink-600 dark:text-ink-300">
                  <span>Total</span>
                  <span className="tabular-nums">{formatMoney(order.total, order.currency)}</span>
                </div>
                <div className="flex justify-between text-sm text-danger-600 dark:text-danger-300">
                  <span>Refunded</span>
                  <span className="tabular-nums">
                    −{formatMoney(order.refundedAmount, order.currency)}
                  </span>
                </div>
              </>
            )}
            <div className="mt-1.5 flex justify-between border-t border-ink-200 pt-1.5 font-display text-lg font-extrabold text-ink-900 dark:border-white/10 dark:text-white">
              <span>{order.refundedAmount > 0 ? 'Net total' : 'Total'}</span>
              <span className="tabular-nums">{formatMoney(netTotal, order.currency)}</span>
            </div>
          </div>
        </Card>

        {/* Payments. */}
        <Card glow className="flex flex-col gap-3 p-5">
          <h2 className={SECTION_LABEL}>Payments</h2>
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
        <Card glow className="flex flex-col gap-3 p-5">
          <h2 className={SECTION_LABEL}>Refunds</h2>
          {order.refunds.length === 0 ? (
            <p className="text-sm text-ink-500 dark:text-ink-400">No refunds issued.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {order.refunds.map((refund) => (
                <li
                  key={refund.id}
                  className="flex flex-col gap-0.5 border-b border-ink-100 pb-2 last:border-0 dark:border-white/5"
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
        <Card glow className="flex flex-col gap-3 p-5">
          <h2 className={SECTION_LABEL}>Status timeline</h2>
          <ol className="flex flex-col gap-2 text-sm">
            {order.statusTimeline.map((entry, index) => {
              const pill = ORDER_STATUS_STYLES[entry.status];
              return (
                <li
                  key={`${entry.status}-${entry.at}-${index}`}
                  className="flex items-center gap-3"
                >
                  <StatusBadge label={pill.label} tone={pill.tone} />
                  <span className="text-ink-500 dark:text-ink-400">{formatDateTime(entry.at)}</span>
                </li>
              );
            })}
          </ol>
        </Card>
      </div>

      {/* Refund control — BillingManage staff, while a balance remains. */}
      {canRefund && refundable > 0 && payment && (
        <Card glow className="flex flex-col gap-3 p-5">
          <h2 className={SECTION_LABEL}>Issue a refund</h2>
          <RefundForm orderId={order.id} currency={order.currency} refundableMinor={refundable} />
        </Card>
      )}
    </div>
  );
}
