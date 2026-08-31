import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@fit/db';
import type {
  AdminInvoiceRow,
  CreateInvoiceData,
  ListAdminInvoicesQuery,
  ListAdminInvoicesResponse,
  SendInvoiceEmailResponse,
} from '@fit/types';
import { gymSettingsStoredSchema } from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { atLocation } from '../common/location-filter.util';
import { TenantContext } from '../common/tenant/tenant.context';
import { MailerService } from '../mail/mailer.service';
import { InvoiceDocumentService } from './invoice-document.service';
import { InvoiceService } from './invoice.service';
import { escapeHtml, renderBrandedEmail, renderEmailParagraphs } from '../mail/branded-email';
import { resolveEmailLocale } from '../mail/email-locale';
import { emailStrings } from '../mail/email-strings';

/** The columns the admin roster selects off `Invoice`, plus the billed member. */
const ADMIN_INVOICE_SELECT = {
  id: true,
  number: true,
  memberId: true,
  type: true,
  description: true,
  amount: true,
  currency: true,
  issuedAt: true,
  dueDate: true,
  member: { select: { user: { select: { name: true, email: true } } } },
  // The branch the invoice was raised at (Stage 5). One hop off the invoice's own
  // `locationId`, not through `member` — the column is a snapshot of the member's
  // home branch at issue time, so reading the member's CURRENT branch here would
  // relabel every past document the moment somebody transfers.
  location: { select: { name: true } },
} satisfies Prisma.InvoiceSelect;

type InvoiceRecord = Prisma.InvoiceGetPayload<{ select: typeof ADMIN_INVOICE_SELECT }>;

/** Reshape a selected row into the wire shape the admin board renders. */
function toRow(row: InvoiceRecord): AdminInvoiceRow {
  return {
    id: row.id,
    number: row.number,
    memberId: row.memberId,
    memberName: row.member?.user.name ?? null,
    memberEmail: row.member?.user.email ?? null,
    type: row.type,
    description: row.description,
    amount: row.amount,
    currency: row.currency,
    locationName: row.location?.name ?? null,
    issuedAt: row.issuedAt.toISOString(),
    dueDate: row.dueDate?.toISOString() ?? null,
  };
}

/**
 * Read a `YYYY-MM-DD` form value as a UTC instant at the start of that day. Due dates
 * and the roster's date filters are calendar days, not moments, so anchoring them to
 * UTC midnight keeps a filter from drifting with the server's timezone.
 */
function startOfUtcDay(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** The same day's exclusive upper bound — used to make an `issuedTo` filter inclusive. */
function endOfUtcDay(date: string): Date {
  const start = startOfUtcDay(date);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * Staff-console invoice management (the Payments hub's Invoices tab).
 *
 * Runs on the **tenant-scoped** {@link TenantPrismaService}, so every read and write
 * is auto-constrained to the caller's gym — there is no `gymId` to pass or forget.
 *
 * Three jobs, all of which reuse machinery that already exists rather than
 * duplicating it:
 *
 *  • **List** the gym's invoices, however they arose — an enrolment, a renewal, a POS
 *    order or a hand-raised one all land in the same table.
 *  • **Raise one by hand** through {@link InvoiceService}, the single seam that owns
 *    the per-gym, per-year sequential number, so a manual invoice's reference is
 *    indistinguishable from an automatic one.
 *  • **Email one** as a PDF attachment, rendering through
 *    {@link InvoiceDocumentService} — the same load → render → cache-in-R2 path the
 *    download uses, so the attachment and the download are byte-identical.
 */
@Injectable()
export class AdminInvoicesService {
  private readonly logger = new Logger(AdminInvoicesService.name);

  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly invoices: InvoiceService,
    private readonly documents: InvoiceDocumentService,
    private readonly mailer: MailerService,
  ) {}

  /**
   * One page of the gym's invoices, filtered + sorted server-side. `total` is the
   * filtered count so the pager stays accurate. An empty page is a normal result.
   */
  async listInvoices(query: ListAdminInvoicesQuery): Promise<ListAdminInvoicesResponse> {
    const where = this.buildWhere(query);
    const skip = (query.page - 1) * query.limit;

    const [rows, total] = await Promise.all([
      this.prisma.client.invoice.findMany({
        where,
        select: ADMIN_INVOICE_SELECT,
        orderBy: this.buildOrderBy(query),
        skip,
        take: query.limit,
      }),
      this.prisma.client.invoice.count({ where }),
    ]);

    return { data: rows.map(toRow), total, page: query.page, limit: query.limit };
  }

  /**
   * Raise an invoice by hand. The member must exist in this gym — a `404` otherwise,
   * which also covers a cross-tenant id since the lookup runs scoped.
   *
   * The insert goes through {@link InvoiceService.issue} inside a transaction, so the
   * sequence-counter bump and the invoice row commit together; a crash between them
   * can never burn a number. The invoice carries no `subscriptionId` / `orderId` —
   * nothing automatic produced it — which is exactly how the roster tells a
   * hand-raised document apart from a billed one.
   *
   * Staff do not choose a settlement state; every hand-raised invoice starts
   * `PENDING`. Raising one is asking to be paid, so "not yet settled" is the only
   * state that is true at the moment it is created — unlike the automatic issuers,
   * which mint an invoice *because* a charge already succeeded.
   */
  async createInvoice(input: CreateInvoiceData): Promise<AdminInvoiceRow> {
    const member = await this.prisma.client.gymMember.findFirst({
      where: { id: input.memberId },
      select: { id: true },
    });
    if (!member) {
      throw new NotFoundException({ message: 'Member not found', code: 'MEMBER_NOT_FOUND' });
    }

    const issued = await this.prisma.client.$transaction((tx) =>
      this.invoices.issue(tx, {
        gymId: this.tenant.gymId,
        memberId: member.id,
        amount: input.amount,
        currency: input.currency,
        status: InvoiceStatus.PENDING,
        type: input.type,
        description: input.description,
        dueDate: input.dueDate ? startOfUtcDay(input.dueDate) : null,
        issuedAt: input.issuedAt ? startOfUtcDay(input.issuedAt) : undefined,
      }),
    );

    const row = await this.prisma.client.invoice.findFirst({
      where: { id: issued.id },
      select: ADMIN_INVOICE_SELECT,
    });
    if (!row) {
      // The row was just committed on this connection; absence would mean the scoped
      // client disagrees with the write, which is a bug rather than a user error.
      throw new NotFoundException({ message: 'Invoice not found', code: 'INVOICE_NOT_FOUND' });
    }
    return toRow(row);
  }

  /**
   * Email an invoice to the member it bills, with the PDF attached.
   *
   * Fails loudly and specifically rather than silently doing nothing:
   *
   *  • unknown / cross-tenant id → `404 INVOICE_NOT_FOUND`
   *  • no member, or the member has no address → `422` (nothing to send it to)
   *  • outbound mail unconfigured → `503 EMAIL_NOT_CONFIGURED`, matching how
   *    `POST /members/:id/email` behaves
   *
   * A `200` therefore always means the provider accepted the message.
   */
  async emailInvoice(id: string): Promise<SendInvoiceEmailResponse> {
    const invoice = await this.prisma.client.invoice.findFirst({
      where: { id },
      select: { ...ADMIN_INVOICE_SELECT, gym: { select: { name: true, settings: true } } },
    });
    if (!invoice) {
      throw new NotFoundException({ message: 'Invoice not found', code: 'INVOICE_NOT_FOUND' });
    }

    const to = invoice.member?.user.email ?? null;
    if (!to) {
      throw new UnprocessableEntityException({
        message: 'This invoice has no member with an email address to send it to',
        code: 'INVOICE_HAS_NO_RECIPIENT',
      });
    }

    // Check before rendering: generating a PDF we cannot send is wasted work, and the
    // staffer needs the "mail isn't set up" answer, not a delivery failure.
    if (!this.mailer.isConfigured) {
      throw new ServiceUnavailableException({
        message: 'Outbound email is not configured',
        code: 'EMAIL_NOT_CONFIGURED',
      });
    }

    const pdf = await this.documents.getPdf(id);
    if (!pdf) {
      throw new NotFoundException({ message: 'Invoice not found', code: 'INVOICE_NOT_FOUND' });
    }

    const gymName = invoice.gym.name;
    const locale = resolveEmailLocale(
      gymSettingsStoredSchema.parse(invoice.gym.settings ?? {}).locale.language,
    );
    const t = emailStrings(locale).invoice;
    const recipient = invoice.member?.user.name ?? (locale === 'ka' ? '' : 'there');
    const subject = t.subject(invoice.number, gymName);
    const body = t.body(recipient, invoice.number, gymName, invoice.description);

    const html = renderBrandedEmail({
      locale,
      senderName: escapeHtml(gymName),
      eyebrow: escapeHtml(t.eyebrow),
      heading: escapeHtml(t.heading(invoice.number)),
      preheader: t.preheader(invoice.number, gymName),
      contentHtml: renderEmailParagraphs(body),
      footerNote: escapeHtml(t.footer(gymName)),
    });

    await this.mailer.send({
      to,
      subject,
      text: body,
      html,
      attachments: [{ filename: `invoice-${pdf.number}.pdf`, content: pdf.buffer }],
    });

    this.logger.debug(`Invoice ${invoice.number} emailed to ${to}`);
    return { sent: true, to };
  }

  /** Translate the roster query's filters into one `where` both the page and count use. */
  private buildWhere(query: ListAdminInvoicesQuery): Prisma.InvoiceWhereInput {
    const where: Prisma.InvoiceWhereInput = {};

    if (query.type) where.type = query.type;

    // The branch the invoice was raised at, as a plain equality on the invoice's
    // own column — index-served by `(gymId, locationId, createdAt)`, where the
    // member hop this replaces planned as a join through `gym_members`.
    //
    // No `OR locationId IS NULL` arm, deliberately. A null branch means the
    // invoice is NOT ATTRIBUTABLE — its member was purged, or that member's branch
    // was retired — and showing it under a named branch would put a debt on books
    // that never raised it. Those rows stay visible in all-branches mode, which is
    // where they belong and where they still count.
    Object.assign(where, atLocation(query.locationId));

    if (query.issuedFrom || query.issuedTo) {
      where.issuedAt = {
        ...(query.issuedFrom ? { gte: startOfUtcDay(query.issuedFrom) } : {}),
        // Exclusive next-midnight, so an invoice raised during `issuedTo` is included.
        ...(query.issuedTo ? { lt: endOfUtcDay(query.issuedTo) } : {}),
      };
    }

    if (query.search) {
      where.OR = [
        { number: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { member: { user: { name: { contains: query.search, mode: 'insensitive' } } } },
      ];
    }

    return where;
  }

  /**
   * The roster's sort. `dueDate` is nullable (a paid invoice has none), so nulls are
   * pinned last either way — an unsorted clump of paid invoices at the top of a
   * due-date view would bury the ones actually falling due. `id` breaks ties so
   * paging is stable across requests.
   */
  private buildOrderBy(query: ListAdminInvoicesQuery): Prisma.InvoiceOrderByWithRelationInput[] {
    if (query.sort === 'dueDate') {
      return [{ dueDate: { sort: query.dir, nulls: 'last' } }, { id: 'desc' }];
    }
    return [{ [query.sort]: query.dir }, { id: 'desc' }];
  }
}
