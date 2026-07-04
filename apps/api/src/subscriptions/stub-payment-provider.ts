import { Injectable, Logger } from '@nestjs/common';
import { env } from '../config/env';
import type { PaymentProvider, RenewalChargeInput, RenewalChargeResult } from './payment-provider';

/**
 * The MVP payment provider (T5.4): a stub that "settles" every renewal charge
 * without a real gateway, mirroring the `provider = "stub"` the enrolment and shop
 * flows already stamp. It exists so the recurring-billing job renews live
 * subscriptions end-to-end today — advancing the period, resetting the freeze
 * allowance, keeping memberships `ACTIVE` — with the real integration (T8.8)
 * dropping in behind the same {@link PaymentProvider} seam later.
 *
 * The stub always *succeeds* outside production: with no gateway there is nothing
 * that can decline, so a member's membership must not silently lapse into
 * `PAST_DUE`. The job's failure/grace/expiry paths are real and covered by tests
 * that inject a failing provider; they simply never fire with this provider bound.
 * It carries no upstream record, so it returns no `providerRef` (the subscription
 * keeps its null ref).
 *
 * **Hard-disabled in production.** A stub that "charges" real members without a
 * gateway is the one thing that must never run for real money, so `chargeRenewal`
 * *throws* when `NODE_ENV === 'production'` instead of faking a success. A thrown
 * error is an infrastructure fault to the billing job (see
 * {@link import('./payment-provider').RenewalChargeResult}): the subscription is
 * left untouched to retry next pass — the member is not penalised — while the loud
 * error flags the real misconfiguration, that billing was enabled in production
 * with no concrete provider bound. Prod deploys are expected to bind a real
 * provider under {@link import('./payment-provider').PAYMENT_PROVIDER}; until then
 * `SUBSCRIPTION_BILLING_ENABLED` also stays off, so this guard is the second line
 * of defence rather than the first.
 */
@Injectable()
export class StubPaymentProvider implements PaymentProvider {
  readonly key = 'stub';
  private readonly logger = new Logger(StubPaymentProvider.name);

  chargeRenewal(input: RenewalChargeInput): Promise<RenewalChargeResult> {
    if (env.NODE_ENV === 'production') {
      // Fail loud rather than fake a charge: this can only mean billing was enabled
      // in production without a real provider bound. Rejected (not a `failed`
      // result), so the billing job treats it as an infra fault and retries the
      // subscription untouched instead of penalising the member.
      return Promise.reject(
        new Error(
          'StubPaymentProvider must not settle charges in production — bind a real ' +
            'PaymentProvider under PAYMENT_PROVIDER before enabling SUBSCRIPTION_BILLING_ENABLED.',
        ),
      );
    }
    this.logger.debug(
      `Stub renewal charge: subscription=${input.subscriptionId} ` +
        `amount=${input.amount} ${input.currency} key=${input.idempotencyKey}`,
    );
    return Promise.resolve({ outcome: 'succeeded', providerRef: null });
  }
}
