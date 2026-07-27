import { Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { StorageService } from '../storage/storage.service';
import { InvoicePdfService } from './invoice-pdf.service';

/** The rendered document handed back to a controller for streaming. */
export interface InvoicePdfResult {
  /** The PDF bytes. */
  buffer: Buffer;
  /** The invoice reference, for the download filename. */
  number: string;
}

/** Restrict the lookup — the member surface may only reach its own invoices. */
export interface InvoicePdfScope {
  /** When set, the invoice must belong to this member; otherwise any in the gym. */
  memberId?: string;
}

/** The columns the PDF + caching path needs off an {@link Invoice}. */
const INVOICE_PDF_SELECT = {
  id: true,
  gymId: true,
  number: true,
  year: true,
  issuedAt: true,
  description: true,
  amount: true,
  currency: true,
  pdfUrl: true,
  gym: { select: { name: true } },
  member: { select: { user: { select: { name: true, email: true } } } },
} as const;

/**
 * Resolves an {@link Invoice}'s PDF for download (T5.10): load it (tenant-scoped),
 * render it once with {@link InvoicePdfService}, cache the bytes in R2, and hand back
 * the buffer. The single seam behind both the member self-service download
 * (`GET /me/invoices/:id/pdf`) and the admin one (`GET /invoices/:id/pdf`) — the only
 * difference is the {@link InvoicePdfScope} the member path passes to constrain the
 * lookup to its own invoices.
 *
 * R2 is a *cache*, not the source of truth: the first download renders and stores the
 * document (persisting the object key on {@link Invoice.pdfUrl}); later ones stream it
 * straight back. A storage outage never blocks a download — the freshly rendered bytes
 * are returned regardless, and a failed write is simply retried next time. When R2 is
 * not configured at all (dev), every download just renders on the fly.
 */
@Injectable()
export class InvoiceDocumentService {
  private readonly logger = new Logger(InvoiceDocumentService.name);

  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly pdf: InvoicePdfService,
    private readonly storage: StorageService,
  ) {}

  /**
   * The invoice's PDF bytes, or `null` when no such invoice is visible to the caller
   * (unknown id, another gym, or — under a member scope — another member's invoice),
   * which the controller turns into a `404`.
   */
  async getPdf(invoiceId: string, scope: InvoicePdfScope = {}): Promise<InvoicePdfResult | null> {
    const invoice = await this.prisma.client.invoice.findFirst({
      where: { id: invoiceId, ...(scope.memberId ? { memberId: scope.memberId } : {}) },
      select: INVOICE_PDF_SELECT,
    });
    if (!invoice) return null;

    // Serve the cached copy when one exists and R2 can read it back.
    if (invoice.pdfUrl && this.storage.isConfigured) {
      const cached = await this.storage.getObject(invoice.pdfUrl).catch((error: unknown) => {
        this.logger.warn(
          `Cached invoice ${invoice.number} unreadable, re-rendering: ${String(error)}`,
        );
        return null;
      });
      if (cached) return { buffer: cached, number: invoice.number };
    }

    const buffer = await this.pdf.render({
      number: invoice.number,
      issuedAt: invoice.issuedAt,
      description: invoice.description,
      amount: invoice.amount,
      currency: invoice.currency,
      gymName: invoice.gym.name,
      memberName: invoice.member?.user.name ?? null,
      memberEmail: invoice.member?.user.email ?? null,
    });

    // Best-effort persist so the document lives in object storage and the next
    // download is served from cache. A write failure must not break this download —
    // we already hold the rendered bytes and will simply try again next time.
    if (this.storage.isConfigured && !invoice.pdfUrl) {
      const key = invoiceObjectKey(invoice.gymId, invoice.year, invoice.number);
      try {
        await this.storage.putObject(key, buffer, 'application/pdf');
        await this.prisma.client.invoice.update({
          where: { id: invoice.id },
          data: { pdfUrl: key },
        });
      } catch (error) {
        this.logger.warn(`Failed to cache invoice ${invoice.number} in R2: ${String(error)}`);
      }
    }

    return { buffer, number: invoice.number };
  }
}

/** R2 object key for an invoice PDF: `{gymId}/invoices/{year}/{number}.pdf`. */
export function invoiceObjectKey(gymId: string, year: number, number: string): string {
  return `${gymId}/invoices/${year}/${number}.pdf`;
}
