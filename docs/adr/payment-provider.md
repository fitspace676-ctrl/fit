# Payment provider abstraction

Renewal charges and inbound gateway events flow through **one seam**, so a real
payment gateway (Stripe, or a Georgian acquirer — TBC / Bank of Georgia) plugs in
without touching the billing job, the enrolment flow, or the controllers.

| Direction | Entry point                                        | Seam method                     |
| --------- | -------------------------------------------------- | ------------------------------- |
| Outbound  | `SubscriptionBillingService` (daily renewal cron)  | `PaymentProvider.chargeRenewal` |
| Inbound   | `POST /webhooks/payments/:provider` (public route) | `PaymentProvider.handleWebhook` |

## The seam

`PaymentProvider` (`apps/api/src/subscriptions/payment-provider.ts`) is a plain
interface bound under the `PAYMENT_PROVIDER` DI token. An interface has no runtime
value, so the token is a `Symbol` and consumers inject it with
`@Inject(PAYMENT_PROVIDER)`. Exactly **one** provider is bound at a time, in
`SubscriptionsModule`:

```ts
{ provide: PAYMENT_PROVIDER, useClass: StubPaymentProvider }
```

Swapping in a real gateway is that one line. Nothing else — the cron, the webhook
controller, the enrolment service — references a concrete provider.

The contract is deliberately minimal:

- **`key`** — the string persisted to `Subscription.provider` (and, for shop sales,
  `Payment.provider`), recording which gateway last settled a row. Today the tag is
  `"stub"` / `"pos"`; a real provider stamps its own (`"stripe"`, `"tbc"`, …).
- **`chargeRenewal(input)`** — charge one subscription's next period, **idempotently**
  on `input.idempotencyKey` (`<subscriptionId>:<periodEndISO>:r<retry>`), so a
  re-run or a second replica presents the same key and the gateway dedupes rather
  than double-billing. Returns a typed `succeeded` / `failed`; a **thrown** error is
  an _infrastructure_ fault (gateway unreachable) that leaves the subscription
  untouched to retry next pass, **not** a decline.
- **`handleWebhook(input)?`** — optional. Verify the gateway signature (from the
  request headers) and reconcile the event. A provider with no gateway omits it.

## The stub, and why it is hard-disabled in production

`StubPaymentProvider` settles every renewal without a gateway so the billing job
runs end-to-end in dev / CI — advancing the period, resetting the freeze allowance,
minting the invoice. It always _succeeds_ there, because with no gateway nothing can
decline and a member's membership must not silently lapse to `PAST_DUE`. (The job's
real failure / grace / expiry paths are exercised by tests that inject a _failing_
provider.)

The one thing that must never happen is the stub "charging" real members for real
money. So `chargeRenewal` **throws** when `NODE_ENV === 'production'` instead of
faking a success. Because the job treats a throw as an infra fault, the subscription
is left untouched to retry — the member is not penalised — while the loud error
flags the actual misconfiguration: billing was enabled in production with no real
provider bound. It is a second line of defence; the first is
`SUBSCRIPTION_BILLING_ENABLED`, which stays off until a production deploy sets it.

## Webhooks

`PaymentWebhookController` (`POST /webhooks/payments/:provider`) is the public entry
point a gateway posts asynchronous events to (charge settled, dispute opened,
subscription cancelled upstream):

- **`@Public()`** — a gateway has no session, so the route is exempt from the global
  deny-by-default `PermissionsGuard`.
- **Excluded from `TenantMiddleware`** — `webhooks/*` is in the JWT-middleware
  exclusion list in `AppModule`, so a tokenless post is not a `401`.
- **No `TenantGuard`** — the event names its own gym inside the _verified_ payload;
  the URL never authorises. Authenticity is the provider's job, from the signature
  in the request headers.
- **Dispatch** — the `:provider` segment must match the bound provider's `key`
  (else `404`, so an unauthenticated caller can't probe which providers exist). If
  the provider declares no `handleWebhook` (the stub), the route answers `501`: it
  exists, but this deployment has no gateway to reconcile against.

## Plugging in a real gateway (Stripe / TBC / BOG)

1. Implement `PaymentProvider` — `key`, `chargeRenewal`, `handleWebhook`.
2. Change the one binding in `SubscriptionsModule` to `useClass: YourProvider`
   (keep the stub as the dev / test default, e.g. select on `NODE_ENV` or a
   `PAYMENT_PROVIDER` env tag).
3. Add the gateway secrets to `apps/api/src/config/env.ts` (mirror the optional-secret
   pattern: unset → the provider degrades rather than crashing the boot).
4. **Raw body for signature verification.** Signature checks (`stripe-signature`,
   the acquirer's HMAC) run over the _exact_ received bytes, not the re-serialised
   JSON. Enable `rawBody` on the Nest app in `main.ts` and read `req.rawBody` for the
   `/webhooks/*` route; thread it into `PaymentWebhookInput` alongside the parsed
   `payload`. This is the only wiring change beyond the provider class itself.

No change is needed to `SubscriptionBillingService`, the enrolment flow, the invoice
generation, or the webhook controller — that is the point of the seam.

## Per-gym Flitt flow (one-off purchases)

The seam above binds ONE provider for the whole deployment and was built for
subscription renewals. One-off online purchases are different: every gym connects
its **own** Flitt merchant (`GymIntegration`, owner-managed), so credentials belong
to the call, not to a singleton. That flow lives in `apps/api/src/payments/` and
leaves the renewal seam and job untouched (subscriptions still enrol as before).

- **Policy.** Packages and credit packs (`POST /checkout`, `POST /credit-packs/purchase`)
  go through Flitt when the gym has an active, verified integration. Without one they
  are refused with `409 ONLINE_PAYMENTS_UNAVAILABLE`, unless `ONLINE_PAYMENTS_STUB` is
  on — then the old instant stub (order `PAID`, payment `CAPTURED`, provider `stub`)
  runs unchanged. The flag defaults to on outside production and off in production.
  The shop basket without Flitt keeps pay-at-pickup (never stamped paid). The public
  gym lookup exposes `onlinePayments: { enabled, provider }` so clients hide buttons.
- **Attempts.** A purchase creates the order `PENDING`, its single `Payment`
  `PENDING` (provider `flitt`) and a `PaymentAttempt`; nothing is granted. Flitt's
  `order_id` must be unique per try and a member may retry, so each try is its own
  attempt — its id is the `order_id`. The attempt snapshots the amount, currency,
  merchant id and the grant (`fulfilment` JSON). Promo codes are consumed (reserved)
  with the order and released if it is abandoned, so the usage cap is decided before
  anyone is charged; shop stock is drawn down at checkout as before. If Flitt cannot
  open the checkout the order is abandoned at once and the purchase fails with
  `503 PAYMENT_PROVIDER_UNAVAILABLE`.
- **Settle authority.** `OnlinePaymentsService.settleAttempt` is the only place state
  changes. It re-reads the status from Flitt with the gym's credentials (never trusts
  a caller), checks order id, merchant, amount and currency, and applies it: approved
  → attempt + payment `CAPTURED`, order `PAID` + status event, fulfilment (credit-pack
  mint — the same `mintCreditPack` the stub path calls) and, after commit, the sale
  automations; declined / expired → attempt `FAILED` / `EXPIRED`, payment `FAILED`,
  order stays `PENDING` for a retry; anything that does not match, or money for an
  order that is no longer pending, → `NEEDS_REVIEW` (nothing granted, logged). The
  state change is guarded by a conditional `PENDING → …` update on the attempt row
  (see `atomic-counters.md`): concurrent settlers block on the row lock and the losers
  match nothing, so the product is granted exactly once.
- **Callers.** `POST /webhooks/flitt` (signature verified with the owning gym's
  secret; `200` for anything authentic, `400` bad signature, `404` unknown order),
  the browser return `GET|POST /payments/flitt/return/:attemptId` (`response_url`;
  reads nothing from the browser, settles, then `303` to
  `https://<slug>.<PLATFORM_ROOT_DOMAIN>/checkout/result?orderId=…` or
  `<MOBILE_APP_SCHEME>://checkout/result?orderId=…`), the member's
  `POST /checkout/:orderId/payment/sync` (what makes local development work, where
  Flitt's callback cannot reach the API) and a five-minute sweep.
- **Sweep.** `PaymentSweepService` (Redis-locked like the booking reminders) settles
  attempts past their lifetime, abandons unpaid online orders with no open attempt
  after an hour (order `CANCELLED`, stock back through `applyOrderStockMovements`
  with `REFUND_RESTOCK`, promo released) and re-sends refunds whose outcome is unknown.
- **Refund ordering.** For a Flitt payment `refundOrder` delegates to
  `ProviderRefundService`: (1) one transaction claims the headroom on
  `Payment.refundedAmount` (the same bounded increment) and records a
  `PaymentReversal` `PENDING`; (2) Flitt's reverse is called with the reversal id as
  the idempotent `reverse_id`; (3) approved → the `Refund` is written once
  (conditional `PENDING → SUCCEEDED`), with the full-refund status flips and restock;
  refused → reversal `FAILED` and the claim released in one transaction, no refund,
  `502 PROVIDER_REFUND_FAILED`; unknown (timeout, crash) → the claim stays held and the
  sweep re-sends the SAME `reverse_id` until Flitt answers (`502
  PROVIDER_REFUND_PENDING` to the caller). A failed reversal therefore never keeps
  the claim, and a succeeded one is never lost.
