// @fit/admin — shared formatting + label maps for the order management UI.
//
// One place the roster, detail page, and refund form agree on how money, dates,
// and the order/payment enums render, so the order surfaces never drift. Money is
// an integer in the currency's MINOR units (cents/tetri) everywhere on the wire.

import type {
  AdminOrderStatus,
  AdminPaymentStatus,
  Fulfillment,
  OrderChannel,
  PaymentMethod,
} from '@fit/types';
import type { Tone } from '@/components/ui';

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
export const ORDER_STATUS_STYLES: Record<AdminOrderStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Pending', tone: 'warning' },
  PAID: { label: 'Paid', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'ink' },
  REFUNDED: { label: 'Refunded', tone: 'danger' },
};

/**
 * The 6px status-dot colour paired with each badge tone — the reference design
 * leads every status pill with a `*-400` dot in the pill's own hue.
 */
export const TONE_DOTS: Record<Tone, string> = {
  ink: 'bg-ink-400',
  brand: 'bg-brand-400',
  success: 'bg-success-400',
  warning: 'bg-warning-400',
  danger: 'bg-danger-400',
  accent: 'bg-accent-400',
  iris: 'bg-iris-400',
  flame: 'bg-flame-400',
};

/** Visual treatment + label per payment status. */
export const PAYMENT_STATUS_STYLES: Record<AdminPaymentStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Pending', tone: 'warning' },
  CAPTURED: { label: 'Captured', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
  REFUNDED: { label: 'Refunded', tone: 'danger' },
};

/** Settlement-method label — the staff-facing channel a sale was settled through. */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  member_account: 'Member account',
};

/** Fulfilment-mode label (T7.10) — collected at the gym vs delivered in-house. */
export const FULFILLMENT_LABELS: Record<Fulfillment, string> = {
  PICKUP: 'Pickup',
  DELIVERY: 'Delivery',
};
