import { ForbiddenException, Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { InvoiceDocumentService, type InvoicePdfResult } from '../billing/invoice-document.service';

/**
 * Member self-service invoice download (`GET /me/invoices/:id/pdf`, T5.10). Resolves
 * the caller's own {@link GymMember} from the session, then delegates to the shared
 * {@link InvoiceDocumentService} with a member scope so a member can only ever download
 * an invoice raised for *them* — a cross-member id resolves to `null` (a `404`), never
 * another member's document, even within the same gym.
 */
@Injectable()
export class MeInvoicesService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly documents: InvoiceDocumentService,
  ) {}

  /** The caller's invoice PDF, or `null` when it is not theirs / does not exist. */
  async getInvoicePdf(invoiceId: string): Promise<InvoicePdfResult | null> {
    const userId = this.tenant.userId;
    if (!userId) {
      throw new ForbiddenException({
        message: 'A member session is required',
        code: 'MEMBER_SESSION_REQUIRED',
      });
    }

    const member = await this.prisma.client.gymMember.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!member) return null;

    return this.documents.getPdf(invoiceId, { memberId: member.id });
  }
}
