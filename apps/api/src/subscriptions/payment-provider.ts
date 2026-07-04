/**
 * The payment-provider abstraction the recurring-billing job (T5.4) charges
 * renewals through — the seam a real gateway integration (T8.8) slots into without
 * the job ever changing.
 *
 * Today the only implementation is the {@link StubPaymentProvider} (mirroring the
 * `provider = "stub"` the enrolment and shop flows already stamp), but the job
 * depends on this interface rather than the stub, so swapping in a Stripe/Adyen
 * provider later is a one-line binding change in {@link SubscriptionsModule}. The
 * contract is intentionally minimal: charge a fixed amount for one subscription's
 * next period, idempotently, and report success or a typed failure.
 */

/** DI token the job injects the active provider under (an interface has no runtime value to bind). */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

/**
 * One renewal charge request. `amount` is in the currency's MINOR units
 * (cents/tetri), snapshotted onto the subscription at enrolment. `idempotencyKey`
 * is stable per subscription *per period* (`<subscriptionId>:<periodEndISO>`), so a
 * retried pass — or a second replica — presents the same key and a real gateway
 * dedupes the charge instead of billing the member twice. `providerRef` carries the
 * subscription's existing external id (null for the stub / a never-charged sub) for
 * providers that renew an upstream subscription object.
 */
export interface RenewalChargeInput {
  subscriptionId: string;
  gymId: string;
  memberId: string;
  amount: number;
  currency: string;
  idempotencyKey: string;
  providerRef: string | null;
}

/**
 * The outcome of a renewal charge. `succeeded` optionally returns a fresh
 * `providerRef` to persist (an upstream charge/subscription id); `failed` carries a
 * short `reason` for the log/audit trail. A provider signals a declined card by
 * returning `{ outcome: 'failed' }`, not by throwing — a thrown error is treated as
 * an *infrastructure* fault (provider unreachable) and leaves the subscription
 * untouched for the next pass to retry, rather than pushing it to `PAST_DUE`.
 */
export type RenewalChargeResult =
  | { outcome: 'succeeded'; providerRef?: string | null }
  | { outcome: 'failed'; reason: string };

/**
 * One inbound gateway webhook, as received by `PaymentWebhookController`
 * (`POST /webhooks/payments/:provider`) before it reaches a provider. `providerKey`
 * is the matched `:provider` path segment; `headers` carry the gateway's signature
 * (e.g. `stripe-signature`, TBC / BOG callback auth); `payload` is the parsed JSON
 * body. A signature-verifying provider needs the *raw* request bytes rather than the
 * re-serialised `payload` — enabling `rawBody` on the Nest app and threading it here
 * is the one wiring change the real integration adds (see the ADR).
 */
export interface PaymentWebhookInput {
  providerKey: string;
  headers: Record<string, string | string[] | undefined>;
  payload: unknown;
}

/**
 * The outcome of handling a webhook. `handled` reports whether the event moved any
 * state — an unrecognised or duplicate event is a legitimate `handled: false`, still
 * a `200` so the gateway stops retrying — and `note` is a short line for the
 * log / audit trail. A provider throws only on a *rejected* event (bad signature),
 * which the controller maps to `400`; a genuinely transient failure is left to the
 * gateway to redeliver.
 */
export type PaymentWebhookResult = { handled: boolean; note?: string };

/**
 * The provider seam. Named `PaymentProvider` and bound under {@link PAYMENT_PROVIDER}.
 * `key` is the value persisted to `Subscription.provider` so a subscription records
 * which provider last settled it.
 */
export interface PaymentProvider {
  /** Provider identifier persisted to `Subscription.provider` (e.g. `"stub"`). */
  readonly key: string;

  /** Attempt to charge one subscription's renewal. Must be idempotent on `idempotencyKey`. */
  chargeRenewal(input: RenewalChargeInput): Promise<RenewalChargeResult>;

  /**
   * Handle one inbound gateway webhook. Optional: a provider with no upstream
   * gateway (the stub) omits it, and `PaymentWebhookController` then answers `501`
   * for its route so a stray webhook is refused rather than silently swallowed. A
   * real gateway implements it to verify the signature and reconcile the event
   * (charge settled, dispute opened, subscription cancelled upstream). Must be
   * idempotent on the gateway's event id — gateways redeliver.
   */
  handleWebhook?(input: PaymentWebhookInput): Promise<PaymentWebhookResult>;
}
