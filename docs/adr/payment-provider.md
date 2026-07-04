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
