import { Controller, Get, NotFoundException, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Permission } from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { streamInvoicePdf } from '../billing/invoice-pdf.stream';
import { MeInvoicesService } from './me-invoices.service';

/**
 * `GET /me/invoices/:id/pdf` — the calling member downloads one of their own invoices
 * as a PDF (T5.10). Self-service (the `/me` prefix): the caller is resolved from the
 * session and the lookup is constrained to their own invoices, so the id on the wire
 * can only ever address a document that is already theirs. Behind {@link TenantGuard} +
 * the global {@link PermissionsGuard}, gated by {@link Permission.SubscriptionManage}
 * (the member's own billing capability, as with `GET /me/subscription`).
 */
@Controller('me/invoices')
@UseGuards(TenantGuard, PermissionsGuard)
export class MeInvoicesController {
  constructor(private readonly invoices: MeInvoicesService) {}

  @Get(':invoiceId/pdf')
  @RequirePermissions(Permission.SubscriptionManage)
  async pdf(@Param('invoiceId') invoiceId: string, @Res() res: Response): Promise<void> {
    const result = await this.invoices.getInvoicePdf(invoiceId);
    if (!result) {
      throw new NotFoundException({ message: 'Invoice not found', code: 'INVOICE_NOT_FOUND' });
    }
    streamInvoicePdf(res, result);
  }
}
