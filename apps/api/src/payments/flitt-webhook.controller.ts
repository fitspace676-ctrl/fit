import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { OnlinePaymentsService } from './online-payments.service';

/**
 * `POST /webhooks/flitt` — Flitt's server callback (`server_callback_url`).
 *
 * Public and tokenless (`webhooks/*` is excluded from the JWT middleware in
 * `AppModule`). Authenticity is the signature over the flat JSON body, verified
 * with the secret of the gym that owns the named `order_id`; the callback's own
 * status is never applied — {@link OnlinePaymentsService.settleAttempt} re-reads
 * it from Flitt. Replies `200 { received: true }` for anything authentic
 * (including attempts already settled), `400` for a bad signature or malformed
 * body and `404` for an unknown order. The body is never logged: it carries the
 * masked card and the payer's email.
 */
@Controller('webhooks/flitt')
export class FlittWebhookController {
  constructor(private readonly payments: OnlinePaymentsService) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.OK)
  async receive(@Body() body: unknown): Promise<{ received: true }> {
    const verdict = await this.payments.handleCallback(body);
    if (verdict === 'unknown_order') {
      throw new NotFoundException({ message: 'Not found', code: 'NOT_FOUND' });
    }
    if (verdict === 'bad_request') {
      throw new BadRequestException({ message: 'Invalid callback', code: 'INVALID_CALLBACK' });
    }
    return { received: true };
  }
}
