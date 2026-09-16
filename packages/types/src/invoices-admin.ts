// @fit/types — admin Invoice contracts (Zod schemas + inferred types).
//
// Invoices are mostly raised automatically: a subscription enrolment, each renewal,
// and every POS order mint one through the API's `InvoiceService`, which owns the
// per-gym, per-year sequential number. These contracts add the two things staff need
// on top of that — a gym-wide list of the documents, and the ability to raise one by
// hand (a coaching block, a hire fee, anything the automatic issuers don't cover).
//
// A hand-raised invoice is an ordinary invoice row with no subscription and no order
// behind it; it goes through the same numbering seam, so its reference is
// indistinguishable from an automatic one.

import { z } from 'zod';
import { sortDirSchema } from './members';

/**
 * What an invoice was raised *for* — mirrors the DB's `InvoiceType`. Distinct from
 * how the invoice arose: a hand-raised membership invoice and an automatic renewal
 * are both `MEMBERSHIP`.
 */
export const invoiceTypeSchema = z.enum([
  'MEMBERSHIP',
  'PERSONAL_TRAINING',
  'CLASS',
  'PRODUCT',
  'SERVICE',
  'OTHER',
]);

/** The billed category — {@link invoiceTypeSchema}. */
export type InvoiceType = z.infer<typeof invoiceTypeSchema>;

/** The largest amount a single hand-raised invoice may carry, in minor units. */
export const MAX_INVOICE_AMOUNT = 1_000_000_00;

/**
 * A calendar date (`YYYY-MM-DD`) as the admin form's date inputs submit it. Kept as a
 * date rather than an instant: a due date is a day, not a moment.
 */
const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date');

/**
 * Body for `POST /admin/invoices` — raise an invoice by hand.
 *
 * `memberId` is required: an invoice with nobody to bill cannot be downloaded from a
 * member's history or emailed, which is the whole point of raising one. `amount` is
 * in the currency's MINOR units (tetri) and must be above zero — a zero-value invoice
 * is a document with no purpose. `issuedAt` defaults to now, and its fiscal year is
 * what scopes the sequential number. `dueDate` is optional — an invoice with no
 * stated deadline is a normal thing to raise.
 *
 * Settlement state is deliberately absent: staff raise the *document*, and the API
 * decides what state it starts in. See `AdminInvoicesService.createInvoice`.
 */
export const createInvoiceSchema = z.object({
  memberId: z.string().trim().min(1, 'Pick the member this invoice is for'),
  type: invoiceTypeSchema.default('OTHER'),
  description: z
    .string()
    .trim()
    .min(1, 'Describe what is being billed')
    .max(500, 'Keep the description under 500 characters'),
  amount: z.coerce
    .number()
    .int('Amount must be a whole number of minor units')
    .positive('Amount must be above zero')
    .max(MAX_INVOICE_AMOUNT, 'That amount is too large'),
  currency: z.string().trim().toUpperCase().length(3, 'Currency must be a 3-letter ISO code'),
  dueDate: isoDateSchema.optional(),
  issuedAt: isoDateSchema.optional(),
});

/** Raw (pre-parse) create input — the admin form's string-ish values. */
export type CreateInvoiceInput = z.input<typeof createInvoiceSchema>;

/** Validated `POST /admin/invoices` body — {@link createInvoiceSchema}. */
export type CreateInvoiceData = z.infer<typeof createInvoiceSchema>;

/** A column the admin invoice roster may be sorted by. */
export const invoiceSortSchema = z.enum(['issuedAt', 'number', 'amount', 'dueDate']);

/** A sortable invoice column — {@link invoiceSortSchema}. */
export type InvoiceSort = z.infer<typeof invoiceSortSchema>;

/**
 * Query for `GET /admin/invoices`. Pagination is mandatory (1-based `page`, `limit`
 * capped at 100). `search` matches the invoice number or the member's name; `type`
 * narrows; `issuedFrom` / `issuedTo` bound the issue date inclusively. Numbers are
 * coerced — they arrive as query strings.
 */
export const listAdminInvoicesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  type: invoiceTypeSchema.optional(),
  issuedFrom: isoDateSchema.optional(),
  issuedTo: isoDateSchema.optional(),
  /**
   * Narrow the roster to one branch, matched against `Invoice.locationId` — the
   * home branch of the member the invoice was raised against, snapshotted at issue
   * time by Stage 5 of the multi-branch roadmap.
   *
   * A snapshot rather than a live hop through `member`, which matters here more
   * than anywhere: transferring a member used to move their entire billing history
   * onto the new branch, so a document could leave the roster of the branch that
   * raised it. It stays put now, and only invoices issued after the move appear at
   * the new branch.
   *
   * An invoice with no branch (its member was purged, or that member's branch was
   * retired) matches NO filter and is only visible in all-branches mode. NULL means
   * "not attributable", never "the default branch" — folding it into a named branch
   * would put a debt on a branch that never billed it.
   */
  locationId: z.string().trim().min(1).optional(),
  sort: invoiceSortSchema.default('issuedAt'),
  dir: sortDirSchema.default('desc'),
});

/** Validated `GET /admin/invoices` query — {@link listAdminInvoicesQuerySchema}. */
export type ListAdminInvoicesQuery = z.infer<typeof listAdminInvoicesQuerySchema>;

/**
 * One invoice as the admin roster renders it. `memberName` / `memberEmail` are
 * denormalised from the billed member so the table needs no second fetch; both are
 * null when the member has since been deleted (the relation is `SetNull`), which is
 * also why the row cannot always be emailed.
 *
 * `amount` is in minor units. `issuedAt` is an ISO instant; `dueDate` is an ISO
 * instant at the start of the due day, or null when the invoice states no deadline.
 */
export interface AdminInvoiceRow {
  id: string;
  number: string;
  memberId: string | null;
  memberName: string | null;
  memberEmail: string | null;
  type: InvoiceType;
  description: string;
  amount: number;
  currency: string;
  /**
   * The branch the invoice was raised at, denormalised off `Invoice.location` —
   * the same one-hop projection `adminOrderRowSchema.locationName` and
   * `AdminClassTemplateRow.locationName` make, and carried for the same reason:
   * **this roster genuinely mixes branches.** It is a gym-wide list of individual
   * documents, so in all-branches mode two adjacent rows can belong to different
   * branches and nothing else on the row says which.
   *
   * That is what separates it from `InventorySummary`, which deliberately carries
   * no branch: inventory AGGREGATES, so every row there is already the same branch
   * (the selected one) or a gym-wide roll-up, and a column would repeat the header
   * switcher on every line. An invoice roster expands rather than aggregates, so
   * the column is the only place the distinction can appear.
   *
   * Null for an invoice with no branch — the member was hard-deleted, or their
   * branch was retired (`onDelete: SetNull`). Null, not `''`: the admin row schemas
   * model absence as null throughout, and the table renders it as an explicit dash
   * rather than the blank cell an empty string gives, which reads as a failed load.
   */
  locationName: string | null;
  issuedAt: string;
  dueDate: string | null;
}

/**
 * Successful `GET /admin/invoices` response — one page of the roster plus the totals
 * the pager needs. `total` is the count after filters.
 */
export interface ListAdminInvoicesResponse {
  data: AdminInvoiceRow[];
  total: number;
  page: number;
  limit: number;
}

/** Successful `POST /admin/invoices` response — the invoice just raised. */
export type CreateInvoiceResponse = AdminInvoiceRow;

/**
 * Successful `POST /admin/invoices/:id/email` response. `sent` is `false` when
 * outbound mail is unconfigured — but that case is a `503` from the controller, so a
 * `200` here always means the message was accepted by the provider.
 */
export interface SendInvoiceEmailResponse {
  sent: boolean;
  /** The address the invoice went to. */
  to: string;
}
