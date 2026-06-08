// @fit/admin — shared formatting + label maps for the order management UI.
//
// One place the roster, detail page, and refund form agree on how money, dates,
// and the order/payment enums render, so the order surfaces never drift. Money is
// an integer in the currency's MINOR units (cents/tetri) everywhere on the wire.

import type { AdminOrderStatus, AdminPaymentStatus, OrderChannel, PaymentMethod } from '@fit/types';

/** Assumed minor units per major unit (USD/EUR/GEL — all two-decimal). */
const MINOR_PER_MAJOR = 100;

/**
 * Format a minor-unit amount as a localized currency string, e.g. `$29.99`. Falls
 * back to a plain `29.99 USD` when the currency code isn't one `Intl` recognises.
 */
export function formatMoney(amountMinor: number, currency: string): string {
  const major = amountMinor / MINOR_PER_MAJOR;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(major);
  } catch {
    return `${major.toFixed(2)} ${currency}`;
  }
}

/** Render an ISO instant as a short local date, or an em dash when absent/invalid. */
export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Render an ISO instant as a short local date + time, or an em dash when absent. */
export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

/** Channel label — `POS` reads as the desk sale, `ONLINE` as the shop. */
export const CHANNEL_LABELS: Record<OrderChannel, string> = {
  POS: 'POS',
  ONLINE: 'Online',
};

/** Visual treatment + label per order status, matching the roster pills. */
export const ORDER_STATUS_STYLES: Record<AdminOrderStatus, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-amber-50 text-amber-700' },
  PAID: { label: 'Paid', className: 'bg-emerald-50 text-emerald-700' },
  CANCELLED: { label: 'Cancelled', className: 'bg-slate-100 text-slate-600' },
  REFUNDED: { label: 'Refunded', className: 'bg-rose-50 text-rose-700' },
};

/** Visual treatment + label per payment status. */
export const PAYMENT_STATUS_STYLES: Record<
  AdminPaymentStatus,
  { label: string; className: string }
> = {
  PENDING: { label: 'Pending', className: 'bg-amber-50 text-amber-700' },
  CAPTURED: { label: 'Captured', className: 'bg-emerald-50 text-emerald-700' },
  FAILED: { label: 'Failed', className: 'bg-rose-50 text-rose-700' },
  REFUNDED: { label: 'Refunded', className: 'bg-rose-50 text-rose-700' },
};

/** Settlement-method label — the staff-facing channel a sale was settled through. */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  member_account: 'Member account',
};
