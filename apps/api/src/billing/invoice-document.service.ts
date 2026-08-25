import { Injectable, Logger } from '@nestjs/common';
import { gymPublicBrand, gymPublicContact } from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { toObjectKey } from '../storage/media-key';
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
  gym: { select: { name: true, settings: true } },
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

    // Serve the cached copy when one exists, was rendered by the CURRENT template,
    // and R2 can read it back. A key from an older template version is simply
    // ignored — the invoice is re-rendered and cached again under the new key.
    const key = invoiceObjectKey(invoice.gymId, invoice.year, invoice.number);
    if (invoice.pdfUrl === key && this.storage.isConfigured) {
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
      // Settings → Business info, printed under the gym name. Read at render time
      // and then frozen into the cached PDF, which is right: an invoice is a
      // snapshot of who billed you on the day, not a live view of the gym.
      gymContact: gymPublicContact(invoice.gym.settings),
      logo: await this.loadLogo(invoice.gym.settings),
      memberName: invoice.member?.user.name ?? null,
      memberEmail: invoice.member?.user.email ?? null,
    });

    // Best-effort persist so the document lives in object storage and the next
    // download is served from cache. A write failure must not break this download —
    // we already hold the rendered bytes and will simply try again next time.
    if (this.storage.isConfigured && invoice.pdfUrl !== key) {
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

  /**
   * The gym's logo bytes for the document header, or `null` when it has none.
   *
   * The logo is an object in our own bucket (Settings → General uploads it there),
   * so it is read straight back by key — no outbound HTTP, and a private bucket
   * would work just as well. Stored as a public URL, hence the path-to-key step.
   *
   * Best-effort like every other storage touch on this path: a missing object, an
   * unreadable one, or R2 being switched off all yield `null`, and the invoice is
   * rendered without a logo rather than failing to download.
   */
  private async loadLogo(settings: unknown): Promise<Buffer | null> {
    if (!this.storage.isConfigured) return null;
    const key = toObjectKey(gymPublicBrand('', settings).logoUrl);
    if (!key) return null;

    try {
      return await this.storage.getObject(key);
    } catch (error) {
      this.logger.warn(`Could not read gym logo ${key}, rendering without it: ${String(error)}`);
      return null;
    }
  }
}

/**
 * The invoice template's version, baked into the object key. Bump it whenever the
 * rendered document changes (layout, typefaces, the FormaCore wordmark fallback) so
 * every invoice cached under the previous look is re-rendered on its next download
 * instead of being served stale forever — the cached PDF is a rendering, not the
 * record, so redrawing it never changes what the invoice says.
 *
 * `1` was the unversioned `{number}.pdf` key of the original template.
 */
const INVOICE_TEMPLATE_VERSION = 2;

/** R2 object key for an invoice PDF: `{gymId}/invoices/{year}/{number}.v{version}.pdf`. */
export function invoiceObjectKey(gymId: string, year: number, number: string): string {
  return `${gymId}/invoices/${year}/${number}.v${INVOICE_TEMPLATE_VERSION}.pdf`;
}
