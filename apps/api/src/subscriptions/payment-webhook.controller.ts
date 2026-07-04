import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  NotImplementedException,
  Param,
  Post,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider';

/**
 * Inbound payment-gateway webhook entry point (`POST /webhooks/payments/:provider`).
 *
 * The seam a real gateway (Stripe / TBC / BOG, T8.8) posts asynchronous events to —
 * charge settled, dispute opened, subscription cancelled upstream — so the API
 * reconciles them without polling. It is the counterpart of the outbound
 * {@link import('./payment-provider').PaymentProvider} `chargeRenewal`: the same
 * provider that charges also verifies and applies what the gateway reports back.
 *
 * A gateway posts without a session, so the route is `@Public()` (exempt from the
 * global deny-by-default {@link import('../common/rbac/permissions.guard').PermissionsGuard})
 * and `webhooks` is excluded from the JWT `TenantMiddleware` in `AppModule` — a
 * tokenless webhook would otherwise be a `401`. Authenticity is the *provider's*
 * job, from the gateway signature in the request headers, not a session: the
 * `:provider` segment only *routes* to a provider, it never authorises. There is no
 * `TenantGuard`; the event names its own gym inside the verified payload.
 *
 * Only one provider is bound at a time ({@link PAYMENT_PROVIDER}). Today that is the
 * {@link import('./stub-payment-provider').StubPaymentProvider}, which has no
 * gateway and so does not implement `handleWebhook`; its route therefore answers
 * `501` — a stray webhook is refused, not silently swallowed. A concrete provider
 * implementing `handleWebhook` lights this endpoint up with no controller change.
 */
@Controller('webhooks/payments')
export class PaymentWebhookController {
  constructor(@Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider) {}

  /**
   * `POST /webhooks/payments/:provider` — receive one gateway event. Returns
   * `200 { received: true, handled }` once the bound provider has processed it.
   *
   * - `404` when `:provider` does not match the bound provider's `key`: the event is
   *   for a gateway this deployment is not wired to (a stale endpoint, or a
   *   misdirected post). Reported absent rather than `400` so we don't confirm which
   *   providers exist to an unauthenticated caller.
   * - `501` when the bound provider declares no `handleWebhook` (the stub): the route
   *   exists but this deployment has no gateway to reconcile against.
   * - `400` when the provider rejects the event (bad/absent signature), left for the
   *   provider to raise from inside `handleWebhook`.
   */
  @Post(':provider')
  @HttpCode(HttpStatus.OK)
  @Public()
  async receive(
    @Param('provider') providerKey: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() payload: unknown,
  ): Promise<{ received: true; handled: boolean; note?: string }> {
    if (providerKey !== this.provider.key) {
      throw new NotFoundException({ message: 'Not found', code: 'NOT_FOUND' });
    }

    if (!this.provider.handleWebhook) {
      throw new NotImplementedException({
        message: `Provider "${this.provider.key}" does not accept webhooks`,
        code: 'WEBHOOK_NOT_SUPPORTED',
      });
    }

    const result = await this.provider.handleWebhook({ providerKey, headers, payload });
    if (result === undefined || result === null) {
      // A provider that resolves nothing is a contract violation, not a gateway
      // error — surface it as a 400 rather than replying an ambiguous 200.
      throw new BadRequestException({ message: 'Webhook not processed', code: 'WEBHOOK_FAILED' });
    }
    return { received: true, handled: result.handled, note: result.note };
  }
}
