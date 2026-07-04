import { Injectable, Logger } from '@nestjs/common';
import type { PaymentProvider, RenewalChargeInput, RenewalChargeResult } from './payment-provider';

/**
 * The MVP payment provider (T5.4): a stub that "settles" every renewal charge
 * without a real gateway, mirroring the `provider = "stub"` the enrolment and shop
 * flows already stamp. It exists so the recurring-billing job renews live
 * subscriptions end-to-end today — advancing the period, resetting the freeze
 * allowance, keeping memberships `ACTIVE` — with the real integration (T8.8)
 * dropping in behind the same {@link PaymentProvider} seam later.
 *
 * The stub always *succeeds*: with no gateway there is nothing that can decline, so
 * a member's membership must not silently lapse into `PAST_DUE`. The job's
 * failure/grace/expiry paths are real and covered by tests that inject a failing
 * provider; they simply never fire with this provider bound. It carries no upstream
 * record, so it returns no `providerRef` (the subscription keeps its null ref).
 */
@Injectable()
export class StubPaymentProvider implements PaymentProvider {
  readonly key = 'stub';
  private readonly logger = new Logger(StubPaymentProvider.name);

  chargeRenewal(input: RenewalChargeInput): Promise<RenewalChargeResult> {
    this.logger.debug(
      `Stub renewal charge: subscription=${input.subscriptionId} ` +
        `amount=${input.amount} ${input.currency} key=${input.idempotencyKey}`,
    );
    return Promise.resolve({ outcome: 'succeeded', providerRef: null });
  }
}
