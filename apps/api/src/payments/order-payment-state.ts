import { OrderStatus, PaymentAttemptStatus, PaymentStatus } from '@fit/db';
import type { OrderPaymentState } from '@fit/types';

/** A hosted checkout this close to its expiry is not handed out again. */
export const LIVE_CHECKOUT_MARGIN_MS = 60_000;

export interface PaymentStateInput {
  orderStatus: OrderStatus;
  payment: { provider: string; status: PaymentStatus } | null;
  latestAttempt: {
    status: PaymentAttemptStatus;
    checkoutUrl: string | null;
    expiresAt: Date;
  } | null;
  now?: Date;
}

/** Whether an attempt's hosted checkout can still be opened and paid. */
export function isLiveAttempt(
  attempt: { status: PaymentAttemptStatus; checkoutUrl: string | null; expiresAt: Date },
  now: Date = new Date(),
): boolean {
  return (
    attempt.status === PaymentAttemptStatus.PENDING &&
    attempt.checkoutUrl !== null &&
    attempt.expiresAt.getTime() > now.getTime() + LIVE_CHECKOUT_MARGIN_MS
  );
}

/**
 * The member-facing payment state of an order (`order.payment` on
 * `GET /checkout/:orderId`). Pure, so the mapping is pinned by a unit spec rather
 * than re-derived by each client.
 */
export function toOrderPaymentState(input: PaymentStateInput): OrderPaymentState {
  const now = input.now ?? new Date();
  const provider = input.payment?.provider ?? null;
  const base = { provider, retry: false, checkoutUrl: null, expiresAt: null };

  if (
    input.orderStatus === OrderStatus.REFUNDED ||
    input.payment?.status === PaymentStatus.REFUNDED
  ) {
    return { ...base, status: 'refunded' };
  }
  if (input.orderStatus === OrderStatus.PAID) {
    return { ...base, status: 'paid' };
  }

  const attempt = input.latestAttempt;
  if (provider !== 'flitt') {
    // Pay at pickup (no payment row) or a legacy pending order: nothing to do online.
    return {
      ...base,
      status: input.orderStatus === OrderStatus.CANCELLED ? 'failed' : 'pending',
    };
  }

  const pending = input.orderStatus === OrderStatus.PENDING;
  if (!attempt) {
    return { ...base, status: 'failed', retry: pending };
  }
  switch (attempt.status) {
    case PaymentAttemptStatus.PENDING:
      if (pending && isLiveAttempt(attempt, now)) {
        return {
          ...base,
          status: 'requires_action',
          retry: true,
          checkoutUrl: attempt.checkoutUrl,
          expiresAt: attempt.expiresAt.toISOString(),
        };
      }
      // Past its lifetime or never opened: waiting on the provider's final word.
      return { ...base, status: 'pending' };
    case PaymentAttemptStatus.EXPIRED:
      return { ...base, status: 'expired', retry: pending };
    case PaymentAttemptStatus.FAILED:
    case PaymentAttemptStatus.CANCELLED:
      return { ...base, status: 'failed', retry: pending };
    case PaymentAttemptStatus.NEEDS_REVIEW:
      // Money may have moved; a retry could charge twice. Staff resolve it.
      return { ...base, status: 'pending' };
    case PaymentAttemptStatus.CAPTURED:
      return { ...base, status: 'pending' };
  }
}
