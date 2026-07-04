import { Module } from '@nestjs/common';
import { AdminCreditPacksController } from './admin-credit-packs.controller';
import { CreditPacksController } from './credit-packs.controller';
import { CreditPacksService } from './credit-packs.service';
import { InvoiceDocumentService } from './invoice-document.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { InvoicesController } from './invoices.controller';
import { MemberCreditPacksController } from './member-credit-packs.controller';

/**
 * Billing — the member-facing credit pack / class pass surface (T8.5).
 *
 * {@link CreditPacksController} (`POST /credit-packs/purchase`, `GET
 * /credit-packs/catalogue`) buys a pass / lists the buyable packs and
 * {@link MemberCreditPacksController} (`GET /members/me/credit-packs`) lists the
 * member's remaining credits — all member self-service behind the `TenantGuard` +
 * global `PermissionsGuard` (`CreditPackManage`). {@link AdminCreditPacksController}
 * (`/admin/members/:id/credit-packs`, `/admin/credit-packs/catalogue`) is the
 * desk-side surface (T5.8) — staff read a member's balance and sell / grant a pack,
 * gated by `BillingRead` / `BillingManage`. {@link CreditPacksService} is
 * **exported** so `BookingsService` (in {@link ClassesModule}) can draw / refund a
 * class credit inside the booking transaction. The tenant-scoped Prisma client,
 * the guards, and the tenant context all come from the app-wide `TenantModule` /
 * `RbacModule`.
 *
 * Invoice documents (T5.10): {@link InvoicesController} (`GET /invoices/:id/pdf`) is
 * the desk-side download, and {@link InvoiceDocumentService} — the shared load →
 * render ({@link InvoicePdfService}) → cache-in-R2 seam — is **exported** so the member
 * self-service route (`MeInvoicesController` in {@link MeModule}) reuses it.
 */
@Module({
  controllers: [
    CreditPacksController,
    MemberCreditPacksController,
    AdminCreditPacksController,
    InvoicesController,
  ],
  providers: [CreditPacksService, InvoicePdfService, InvoiceDocumentService],
  exports: [CreditPacksService, InvoiceDocumentService],
})
export class BillingModule {}
