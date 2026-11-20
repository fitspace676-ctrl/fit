// Online payment contracts — the hosted-checkout flow a gym's own payment
// provider (Flitt) drives, shared by the API and the web / mobile clients.
//
// A purchase that goes through a provider does not finish in the purchase
// response: the order is created PENDING and the response carries a `payment`
// block whose `checkoutUrl` the client opens. The provider then sends the buyer's
// browser back through the API, which redirects it to the member-facing result
// location (`/checkout/result?orderId=…` on the gym's portal, or
// `<scheme>://checkout/result?orderId=…` in the app). The result screen reads
// `GET /checkout/:orderId` — or `POST /checkout/:orderId/payment/sync` to ask the
// API to check with the provider right now — until `payment.status` is final.
//
// All money is integer MINOR units; nothing here is ever trusted from a client.

import { z } from 'zod';

/** Where the provider should send the buyer once they have paid (or given up). */
export const paymentReturnTargetSchema = z.enum(['web', 'app']);
export type PaymentReturnTarget = z.infer<typeof paymentReturnTargetSchema>;

/**
 * The optional fields every online purchase body accepts. `returnTo` defaults to
 * `web` server-side when omitted.
 */
export const onlinePurchaseOptionsSchema = z.object({
  returnTo: paymentReturnTargetSchema.optional(),
});

/**
 * The `payment` block a purchase (or a retry) returns when the buyer still has
 * to pay on the provider's hosted page.
 *
 * - `requires_action` — open `checkoutUrl` (a browser / in-app browser tab);
 *   it stops accepting payment at `expiresAt` (ISO-8601).
 * - `paid` — nothing left to pay (a fully discounted basket); `checkoutUrl` and
 *   `expiresAt` are `null`.
 */
export const paymentActionSchema = z.object({
  status: z.enum(['requires_action', 'paid']),
  orderId: z.string().min(1),
  checkoutUrl: z.string().url().nullable(),
  expiresAt: z.string().nullable(),
});
export type PaymentAction = z.infer<typeof paymentActionSchema>;

/**
 * The payment state of an order as the member's result / order screens show it
 * (`GET /checkout/:orderId` → `order.payment`).
 *
 * - `pending` — nothing for the member to do right now: a pay-at-pickup shop
 *   order, or a provider payment the API is still waiting to hear about.
 * - `requires_action` — an open hosted checkout; `checkoutUrl` resumes it.
 * - `paid` / `refunded` — final (a partial refund still reads `paid`).
 * - `failed` / `expired` — the last attempt did not go through; when `retry` is
 *   true, `POST /checkout/:orderId/payment/retry` opens a new one.
 */
export const orderPaymentStatusSchema = z.enum([
  'pending',
  'requires_action',
  'paid',
  'failed',
  'expired',
  'refunded',
]);
export type OrderPaymentStatus = z.infer<typeof orderPaymentStatusSchema>;

export const orderPaymentStateSchema = z.object({
  status: orderPaymentStatusSchema,
  /** `flitt`, `stub`, `pos`, … — `null` for an order with no payment record (pay at pickup). */
  provider: z.string().nullable(),
  /** Whether `POST /checkout/:orderId/payment/retry` would open a (new) checkout. */
  retry: z.boolean(),
  /** The open checkout to resume — set only while `status` is `requires_action`. */
  checkoutUrl: z.string().url().nullable(),
  expiresAt: z.string().nullable(),
});
export type OrderPaymentState = z.infer<typeof orderPaymentStateSchema>;

/** Body for `POST /checkout/:orderId/payment/retry`. */
export const retryOrderPaymentSchema = onlinePurchaseOptionsSchema;
export type RetryOrderPaymentInput = z.infer<typeof retryOrderPaymentSchema>;

/** `POST /checkout/:orderId/payment/retry` → `201`. */
export interface RetryOrderPaymentResponse {
  payment: PaymentAction;
}

/**
 * Whether a gym sells online right now, and through what. Exposed on the public
 * gym lookup so clients can hide purchase buttons a gym cannot honour.
 * `provider: 'stub'` only ever appears outside production (or where the
 * deployment deliberately enabled the stub): a purchase "succeeds" without money.
 */
export const onlinePaymentsConfigSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(['flitt', 'stub']).nullable(),
});
export type OnlinePaymentsConfig = z.infer<typeof onlinePaymentsConfigSchema>;

/** `409` — the gym has no active online payment provider (and the stub is off). */
export const ONLINE_PAYMENTS_UNAVAILABLE_CODE = 'ONLINE_PAYMENTS_UNAVAILABLE';
/** `503` — the provider could not open a checkout; nothing was charged or kept. */
export const PAYMENT_PROVIDER_UNAVAILABLE_CODE = 'PAYMENT_PROVIDER_UNAVAILABLE';
/** `409` — retry/cancel on an order that is no longer awaiting payment. */
export const ORDER_NOT_PAYABLE_CODE = 'ORDER_NOT_PAYABLE';
/** `409` — cancel refused while a provider checkout may still be paid. */
export const PAYMENT_IN_PROGRESS_CODE = 'PAYMENT_IN_PROGRESS';
/** `502` — the provider refused a refund (reversal); no refund was recorded. */
export const PROVIDER_REFUND_FAILED_CODE = 'PROVIDER_REFUND_FAILED';
/**
 * `502` — the provider could not be reached to confirm a refund. The claimed
 * amount stays reserved and the API keeps retrying the SAME reversal in the
 * background; the refund appears once the provider confirms it.
 */
export const PROVIDER_REFUND_PENDING_CODE = 'PROVIDER_REFUND_PENDING';
