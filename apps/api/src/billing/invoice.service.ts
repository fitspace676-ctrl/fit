import { Injectable } from '@nestjs/common';
import { InvoiceStatus, InvoiceType, Prisma, formatInvoiceNumber } from '@fit/db';

/**
 * The slice of an interactive-transaction Prisma client {@link InvoiceService} needs:
 * the raw counter bump ({@link InvoiceTxClient.$queryRawUnsafe}) and the invoice insert
 * ({@link InvoiceTxClient.invoice}). Kept structural (rather than a concrete client
 * type) so **both** callers satisfy it — the tenant-scoped enrolment transaction
 * (`TenantPrismaService`, whose extension re-stamps the `gymId` we already pass) and
 * the unscoped cross-tenant billing job (`PrismaService`, which passes `gymId`
 * explicitly). Minting an invoice therefore always happens inside the caller's own
 * transaction, so the invoice and the state change it records (a subscription created,
 * a period advanced) commit atomically or not at all.
 */
export interface InvoiceTxClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  invoice: {
    create(args: {
      data: Prisma.InvoiceUncheckedCreateInput;
      select: { id: true; number: true; seq: true; year: true };
    }): Promise<IssuedInvoice>;
  };
}

/** What an invoice is raised for and how much — the caller-supplied part of the row. */
export interface IssueInvoiceInput {
  /** Isolating tenant key; stamped on the row (and re-stamped by the scoped client). */
  gymId: string;
  /** The billed member, denormalised onto the invoice for the member history read. */
  memberId: string | null;
  /** The recurring subscription this charge renewed / enrolled, when applicable. */
  subscriptionId?: string | null;
  /** The POS / checkout order that took the charge, when applicable. */
  orderId?: string | null;
  /** Charged amount in the currency's MINOR units (cents/tetri). */
  amount: number;
  /** ISO-4217 currency, snapshotted from the charge. */
  currency: string;
  /** Settlement state; defaults to `PAID` (the stub-settled MVP charge). */
  status?: InvoiceStatus;
  /**
   * The billed category, stamped at the source so the admin board can classify the
   * document without inferring it from the relations. Defaults to `OTHER`.
   */
  type?: InvoiceType;
  /** Human-readable description of what was billed (e.g. "Premium — monthly renewal"). */
  description?: string;
  /**
   * When payment falls due. Only meaningful on a `PENDING` invoice — an already-settled
   * charge has nothing left to fall due — so it defaults to null.
   */
  dueDate?: Date | null;
  /** The charge instant; defaults to now. Its fiscal year scopes the sequence counter. */
  issuedAt?: Date;
}

/** The projection returned to callers after minting — enough to log / reference it. */
export interface IssuedInvoice {
  id: string;
  number: string;
  seq: number;
  year: number;
}

/**
 * Mints {@link Invoice} rows with a per-gym, per-fiscal-year sequential
 * {@link Invoice.number} (T5.9). The single seam every subscription charge routes its
 * billing document through — member enrolment's first paid period, each successful
 * recurring renewal, and (once that path lands) a POS-linked subscription charge — so
 * the numbering rule lives in exactly one place.
 *
 * The service is **stateless**: it holds no Prisma client of its own and instead
 * operates on the transaction the caller hands it (see {@link InvoiceTxClient}). That
 * is what lets the same helper serve the tenant-scoped enrolment flow and the unscoped
 * billing job while keeping the invoice atomic with the change that triggered it.
 */
@Injectable()
export class InvoiceService {
  /**
   * Allocate the next sequence number for `(gymId, year)` and insert the invoice, all
   * inside `tx`. The number is `"<year>-<seq0001>"` (see {@link formatInvoiceNumber}),
   * unique within the gym by the `@@unique([gymId, number])` index that the atomic
   * counter can never violate.
   */
  async issue(tx: InvoiceTxClient, input: IssueInvoiceInput): Promise<IssuedInvoice> {
    const issuedAt = input.issuedAt ?? new Date();
    const year = issuedAt.getUTCFullYear();
    const seq = await this.allocateSeq(tx, input.gymId, year);

    return tx.invoice.create({
      data: {
        gymId: input.gymId,
        memberId: input.memberId,
        subscriptionId: input.subscriptionId ?? null,
        orderId: input.orderId ?? null,
        number: formatInvoiceNumber(year, seq),
        year,
        seq,
        amount: input.amount,
        currency: input.currency,
        status: input.status ?? InvoiceStatus.PAID,
        type: input.type ?? InvoiceType.OTHER,
        description: input.description ?? '',
        dueDate: input.dueDate ?? null,
        issuedAt,
      },
      select: { id: true, number: true, seq: true, year: true },
    });
  }

  /**
   * Atomically claim the next `seq` for `(gymId, year)` from the `invoice_sequences`
   * counter. A single `INSERT … ON CONFLICT DO UPDATE … RETURNING` either seeds the
   * gym-year at `1` or increments the running `lastNumber`, returning the value to use
   * — so two charges racing for the same gym-year serialise on the row and receive
   * distinct, gap-free numbers (the row-level lock the update takes is the
   * concurrency guarantee, not the surrounding transaction). Raw SQL because Prisma
   * has no read-old-then-increment-and-return primitive; parameterised, and the
   * `gymId` is passed explicitly so it is correct on the unscoped billing-job client
   * too (raw queries bypass the tenant extension).
   */
  private async allocateSeq(tx: InvoiceTxClient, gymId: string, year: number): Promise<number> {
    const rows = await tx.$queryRawUnsafe<Array<{ lastNumber: number }>>(
      `INSERT INTO "invoice_sequences" ("gymId", "year", "lastNumber", "updatedAt")
       VALUES ($1, $2, 1, now())
       ON CONFLICT ("gymId", "year")
       DO UPDATE SET "lastNumber" = "invoice_sequences"."lastNumber" + 1, "updatedAt" = now()
       RETURNING "lastNumber"`,
      gymId,
      year,
    );
    return rows[0]!.lastNumber;
  }
}
