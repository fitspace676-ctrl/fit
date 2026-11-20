import { All, Controller, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { OnlinePaymentsService } from './online-payments.service';

/**
 * `GET|POST /payments/flitt/return/:attemptId` — Flitt's `response_url`, where the
 * buyer's browser lands after the hosted page (Flitt may deliver it as a form
 * POST). Public and tokenless (excluded from the JWT middleware in `AppModule`).
 *
 * Nothing the browser sends is read: the attempt id in the path only names which
 * attempt to settle, and settling re-reads the status from Flitt. The browser is
 * then `303`-redirected to the member-facing result location — the gym's portal
 * (`https://<slug>.<root>/checkout/result?orderId=…`) or the app
 * (`<MOBILE_APP_SCHEME>://checkout/result?orderId=…`), as the purchase asked.
 */
@Controller('payments/flitt')
export class FlittReturnController {
  constructor(private readonly payments: OnlinePaymentsService) {}

  @All('return/:attemptId')
  @Public()
  async return(@Param('attemptId') attemptId: string, @Res() res: Response): Promise<void> {
    const target = await this.payments.handleReturn(attemptId);
    if (!target) throw new NotFoundException({ message: 'Not found', code: 'NOT_FOUND' });
    res.redirect(303, target);
  }
}
