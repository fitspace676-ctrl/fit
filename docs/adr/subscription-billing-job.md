# Recurring subscription billing job

Memberships renew themselves. A single scheduled sweep charges every gym's due
subscriptions, advances their paid period, works failed charges through a dunning
retry ladder, and expires the ones that never recover — with no per-request
trigger and no human in the loop.

| Aspect       | Choice                                                                |
| ------------ | --------------------------------------------------------------------- |
| Entry point  | `SubscriptionBillingService.runBillingCycle` (`@Cron`, daily 02:00)   |
| Charge seam  | `PaymentProvider.chargeRenewal` (see the payment-provider ADR)        |
| Policy       | `classifyDueSubscription` + `applyEvent` (pure, in `@fit/db`)         |
| Safety gates | `SUBSCRIPTION_BILLING_ENABLED` env flag + per-day Redis lock          |
| Correctness  | conditional `updateMany` on the observed `(currentPeriodEnd, status)` |

## The sweep

`SubscriptionBillingService` (`apps/api/src/subscriptions/subscription-billing.service.ts`)
runs at **02:00 server time** (`RENEWAL_CRON = '0 2 * * *'`) — a quiet hour, clear
of the report digests. It selects every subscription whose paid period has elapsed
(`currentPeriodEnd <= now`, live status) across **all** gyms and moves each to its
next state:

- **Renew** — the `chargeRenewal` succeeds: advance to the next period (`RENEW`),
  reset the freeze allowance, mint the renewal invoice.
- **Past due** — the charge is declined: flag `PAST_DUE` (`PAYMENT_FAILED`). The
  member **keeps access** while past due; they are not locked out mid-ladder.
- **Cancel** — a subscription with `cancelAtPeriodEnd` set is `CANCEL`ed at period
  end, charged nothing.
- **Trial conversion** — a `TRIAL` subscription falls due at trial end; its first
  charge auto-converts it to `ACTIVE` (`RENEW`), or `PAST_DUE` on failure. A member
  who cancelled during the trial is `CANCEL`ed at trial end instead, charged nothing.

The job is a **thin orchestrator**: it owns no billing policy. What happens to each
due subscription is decided by the pure `classifyDueSubscription` rule, and every
status change goes through the shared subscription state machine's `applyEvent`. The
same rules run in unit tests without a scheduler, a database, or a clock.

Like the report digests it is **cross-tenant** — it reads and writes every gym's
subscriptions through the unscoped `PrismaService`, because a scheduled sweep has no
request tenant context.

## Dunning: the retry ladder

A `PAST_DUE` subscription is retried on an ascending ladder of whole-day offsets from
its elapsed period end, configured by `SUBSCRIPTION_BILLING_RETRY_OFFSET_DAYS`
(default **`2,5,7`** → retry on day +2, +5, +7). `paymentRetries` advances one rung
per failed retry. The member is entitled across the **entire** ladder — the last
offset is effectively the grace window. When a retry succeeds the subscription
returns to `ACTIVE`; when the last rung fails it is expired (`EXPIRE`). An empty
value disables retries (expire on first failure).

`SUBSCRIPTION_TRIAL_ENDING_LEAD_DAYS` (default 3) governs a separate courtesy: the
same sweep warns a member their trial is about to convert, within that lead window,
at most once per subscription (see the notification-pipeline ADR).

## Why it is safe to run everywhere

The service ships in every environment but must never charge unexpectedly or twice.
Three independent guards:

1. **Feature flag.** `SUBSCRIPTION_BILLING_ENABLED` defaults to **`false`** — off in
   dev, CI, and preview. Only a production deploy that has bound a real payment
   provider turns it on. (The bundled `StubPaymentProvider` additionally _throws_ in
   production, a second line of defence against fake charges — see the
   payment-provider ADR.)

2. **Single-runner lock.** A per-day Redis `SET NX` lock (`LOCK_TTL_SECONDS = 3600`)
   means a multi-instance deployment runs the sweep **once** even though every
   replica fires the cron at the same minute.

3. **Database-level idempotency**, independent of the lock. Every transition is a
   conditional `updateMany` matched on the subscription's _observed_
   `(currentPeriodEnd, status)` — and, for a ladder step, the observed
   `paymentRetries` too. Once a period is advanced (or a status/rung moved) the same
   row can never be advanced again: a re-run, an overlapping replica, or a retry all
   no-op. The charge itself carries a per-period idempotency key
   (`<subscriptionId>:<periodEndISO>:r<retry>`) so a real gateway dedupes upstream as
   well.

The lock prevents concurrent work; the conditional writes make the work _correct_
even if the lock is somehow bypassed. Belt and braces, because the failure mode is
double-billing real members.

## Outcome accounting

`runBillingCycle` returns a `BillingCycleSummary` — `subscriptionsDue`, `renewed`,
`pastDue`, `expired`, `canceled`, `errors`, `trialEndingWarned` — for logging and
assertion. Every due subscription lands in exactly one bucket, except an `error`: an
_infrastructure_ fault (provider unreachable, DB write failed) that left the
subscription untouched for the next pass to retry. A thrown `chargeRenewal` is
treated as such a fault, **not** a decline, so a gateway outage never penalises a
member — the row is simply retried next pass.

## Related

- `docs/adr/payment-provider.md` — the charge/webhook seam this job drives.
- `docs/adr/notification-pipeline.md` — how renewal / past-due / trial-ending
  notices reach the member.
