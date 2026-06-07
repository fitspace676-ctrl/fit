import { Injectable } from '@nestjs/common';
import type { SendReceiptInput, SendReceiptResponse } from '@fit/types';
import { EmailService } from '../auth/email.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';

/**
 * Orders — the POS sale's server-side concerns (T7.4: email receipts).
 *
 * The in-person sale is settled in the admin POS client (T7.3) and is not yet
 * persisted as an Order row, so this service does not own a sale's lifecycle; it
 * takes a completed-sale snapshot and emails the customer a receipt. The gym name
 * in the receipt copy is resolved here from the request's own tenant — `Gym` is
 * keyed by id (unscoped), so it is a plain lookup by {@link TenantContext.gymId}
 * and is never trusted from the client.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly email: EmailService,
    private readonly tenant: TenantContext,
    private readonly prisma: TenantPrismaService,
  ) {}

  /**
   * Email the receipt for a completed POS sale. Resolves the gym name for the copy,
   * then delegates delivery to {@link EmailService.sendReceiptEmail}. Returns
   * `{ delivered: false }` (rather than throwing) when email delivery is
   * unconfigured, so an unconfigured dev / CI environment still completes the call.
   */
  async sendReceipt(input: SendReceiptInput): Promise<SendReceiptResponse> {
    const gym = await this.prisma.client.gym.findUnique({
      where: { id: this.tenant.gymId },
      select: { name: true },
    });

    const delivered = await this.email.sendReceiptEmail(
      input.email,
      input.receipt,
      gym?.name ?? undefined,
    );

    return { delivered };
  }
}
