import { Injectable } from '@nestjs/common';
import { InvoiceStatus, InvoiceType, Prisma } from '@fit/db';
import {
  formatInvoiceNumber,
  gymSettingsStoredSchema,
  invoiceNumberCarriesYear,
  type GymInvoiceSettings,
  type InvoiceNumbering,
} from '@fit/types';

/**
 * The `invoice_sequences` bucket a gym-wide (year-less) run of numbers lives in.
 *
 * The counter is keyed `(gymId, year)`. Zero is not a fiscal year any invoice can be
 * issued in, so it is free to mean "not partitioned by year" — the bucket the
 * `prefix-number` shape draws from, where the run continues across January instead of
 * restarting into duplicates.
 */
const GYM_WIDE_SEQUENCE_BUCKET = 0;

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
  /**
   * The gym row the numbering settings are read off. `Gym` is the tenant *root*
   * (keyed by `id`, with no `gymId` scalar), so it sits outside the tenant
   * extension's scoped-model set on the scoped client — which is why the read below
   * pins `id` explicitly rather than trusting the client to scope it.
   */
  gym: {
    findFirst(args: {
      where: { id: string };
      select: { settings: true };
    }): Promise<{ settings: Prisma.JsonValue } | null>;
  };
  /**
   * The billed member, read for one thing only: their home branch, which
   * {@link InvoiceService.issue} stamps onto `Invoice.locationId`.
   *
   * `gymId` is pinned in the `where` alongside `id` rather than left to the client.
   * The scoped client would inject it; the unscoped billing job would not, and a
   * `memberId` that resolved across tenants would copy another gym's branch onto
   * this invoice — the exact cross-tenant row a foreign key cannot catch, because
   * that location does exist. The Stage 5 migration guards its backfill the same
   * way (`m."gymId" = i."gymId"`); this is the write-path half of that guard.
   */
  gymMember: {
    findFirst(args: {
      where: { id: string; gymId: string };
      select: { locationId: true };
    }): Promise<{ locationId: string | null } | null>;
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
   * Allocate the next sequence number and insert the invoice, all inside `tx`.
   *
   * The reference is composed from the gym's Settings → Invoicing — its prefix, its
   * chosen shape, and the sequence number the year starts from — so what the settings
   * screen previews is what the roster shows. It stays unique within the gym by the
   * `@@unique([gymId, number])` index that the atomic counter can never violate.
   *
   * The settings are read inside the transaction rather than injected, because the two
   * clients that mint invoices differ (the scoped enrolment client and the unscoped
   * billing job) and only the transaction is common to both.
   *
   * **The branch is resolved here, not passed in** (Stage 5). `Invoice.locationId`
   * is the billed member's home branch at issue time — the PERSON half of the rule
   * in `apps/api/src/common/location-filter.util.ts`, snapshotted onto the row so
   * every invoice read is index-served instead of joined. Putting the lookup in
   * this one seam rather than in {@link IssueInvoiceInput} is the same argument
   * that put the numbering here: all four issuers (enrolment, renewal, a booked
   * service session, a hand-raised invoice) go through this method, and a caller
   * that forgot the field would mint a NULL no backfill can ever revisit —
   * silently, because NULL is also the legitimate value for an unattributable row.
   *
   * **Never from `input.orderId`, even when there is one.** `orderId` is nullable
   * and recurring billing leaves it null, so an order-based rule would attribute
   * the one-off minority one way and the rest another, and `outstanding` would mean
   * something different row by row. One rule for every invoice, whatever raised it.
   */
  async issue(tx: InvoiceTxClient, input: IssueInvoiceInput): Promise<IssuedInvoice> {
    const issuedAt = input.issuedAt ?? new Date();
    const year = issuedAt.getUTCFullYear();
    const settings = await this.invoiceSettings(tx, input.gymId);
    const numbering: InvoiceNumbering = { prefix: settings.prefix, format: settings.format };
    const locationId = await this.memberBranch(tx, input.gymId, input.memberId);
    const seq = await this.allocateSeq(tx, input.gymId, year, numbering, settings.startNumber);

    return tx.invoice.create({
      data: {
        gymId: input.gymId,
        memberId: input.memberId,
        locationId,
        subscriptionId: input.subscriptionId ?? null,
        orderId: input.orderId ?? null,
        number: formatInvoiceNumber(year, seq, numbering),
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
   * The gym's Settings → Invoicing block, fully defaulted.
   *
   * Never throws for a missing or malformed blob: a gym that has never opened the
   * settings screen has `settings: null`, and the schema fills every default from
   * that. Refusing to raise an invoice because nobody has visited Settings would be a
   * worse failure than the one this guards against — and this runs on the money path.
   */
  private async invoiceSettings(tx: InvoiceTxClient, gymId: string): Promise<GymInvoiceSettings> {
    const gym = await tx.gym.findFirst({ where: { id: gymId }, select: { settings: true } });
    return gymSettingsStoredSchema.parse(gym?.settings ?? {}).invoice;
  }

  /**
   * The billed member's home branch, or `null` when there is no honest answer.
   *
   * Three ways to get `null`, and **all three are the correct outcome, not a
   * fallback**: no member to bill (`memberId` is nullable on the input), a member
   * that does not resolve inside this gym, or a member whose own `locationId` is
   * null because their branch was retired (`GymMember.location` is `SetNull`).
   *
   * Deliberately no default-branch fallback, which is where this departs from the
   * Stage 2 and 3 write paths. Those columns had no prior attribution, so defaulting
   * invented the only answer available. This one has an attribution already — the
   * live member hop every invoice read used before Stage 5 — and the whole promise
   * of the denormalisation is that it moves no figure between branches. Defaulting
   * an unattributable invoice to the main branch would credit that branch with a
   * debt the console has never shown there, and the write path would then disagree
   * with the migration that backfilled its neighbours. A NULL means "not
   * attributable"; it stays in the gym-wide roll-up and out of every per-branch one.
   */
  private async memberBranch(
    tx: InvoiceTxClient,
    gymId: string,
    memberId: string | null,
  ): Promise<string | null> {
    if (memberId === null) return null;
    const member = await tx.gymMember.findFirst({
      where: { id: memberId, gymId },
      select: { locationId: true },
    });
    return member?.locationId ?? null;
  }

  /**
   * Atomically claim the next `seq` from the `invoice_sequences` counter. A single
   * `INSERT … ON CONFLICT DO UPDATE … RETURNING` either seeds the bucket at the gym's
   * configured starting number or advances the running `lastNumber`, returning the
   * value to use — so two charges racing for the same bucket serialise on the row and
   * receive distinct numbers (the row-level lock the update takes is the concurrency
   * guarantee, not the surrounding transaction). Raw SQL because Prisma has no
   * read-old-then-increment-and-return primitive; parameterised, and the `gymId` is
   * passed explicitly so it is correct on the unscoped billing-job client too (raw
   * queries bypass the tenant extension).
   *
   * **The bucket** is the fiscal year for the shapes that print it, so each January
   * starts fresh. A shape *without* the year (`INV-1000`) cannot restart — next
   * January's `INV-1000` would be a duplicate of this one — so it draws from a single
   * gym-wide bucket, stored under year `0`: not a fiscal year, and therefore free to
   * mean "this gym's one continuous run".
   *
   * **The starting number** floors the allocation rather than only seeding it
   * (`GREATEST`), so a gym that raises it sees the change on its next invoice instead
   * of next January. Lowering it is inert: the counter never goes backwards over
   * numbers already handed out.
   */
  private async allocateSeq(
    tx: InvoiceTxClient,
    gymId: string,
    year: number,
    numbering: InvoiceNumbering,
    startNumber: number,
  ): Promise<number> {
    const bucket = invoiceNumberCarriesYear(numbering) ? year : GYM_WIDE_SEQUENCE_BUCKET;
    const rows = await tx.$queryRawUnsafe<Array<{ lastNumber: number }>>(
      `INSERT INTO "invoice_sequences" ("gymId", "year", "lastNumber", "updatedAt")
       VALUES ($1, $2, $3, now())
       ON CONFLICT ("gymId", "year")
       DO UPDATE SET
         "lastNumber" = GREATEST("invoice_sequences"."lastNumber" + 1, $3),
         "updatedAt" = now()
       RETURNING "lastNumber"`,
      gymId,
      bucket,
      startNumber,
    );
    return rows[0]!.lastNumber;
  }
}
