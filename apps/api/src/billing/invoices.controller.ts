import { Controller, Get, NotFoundException, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Permission } from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { InvoiceDocumentService } from './invoice-document.service';
import { streamInvoicePdf } from './invoice-pdf.stream';

/**
 * Admin invoice endpoints (`/invoices`, T5.10) — the staff-side counterpart to the
 * member's own download. Today just the PDF: the desk pulls any of the gym's invoices
 * (surfaced on the member-detail "Invoices" tab) as a document. Tenant-scoped so an
 * admin only ever reaches their own gym's invoices ({@link TenantGuard} + the scoped
 * Prisma client behind {@link InvoiceDocumentService}), gated on `BillingRead`.
 */
@Controller('invoices')
@UseGuards(TenantGuard, PermissionsGuard)
export class InvoicesController {
  constructor(private readonly documents: InvoiceDocumentService) {}

  /**
   * `GET /invoices/:id/pdf` — stream the invoice's PDF as an attachment. Renders (and
   * caches to R2) on first access. An unknown / cross-tenant id is a `404`.
   */
  @Get(':id/pdf')
  @RequirePermissions(Permission.BillingRead)
  async pdf(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const result = await this.documents.getPdf(id);
    if (!result) {
      throw new NotFoundException({ message: 'Invoice not found', code: 'INVOICE_NOT_FOUND' });
    }
    streamInvoicePdf(res, result);
  }
}
