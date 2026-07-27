// @fit/types — public order/checkout contracts (Zod schemas + inferred types).
//
// Shapes crossing the API boundary for the purchase wizard's final steps (T3.10):
// the `POST /orders` call that turns a chosen location + package (T3.8/T3.9) into
// a pending order, and the `GET /orders/:orderId` lookup the success page reads
// back to confirm it. The API validates the inbound body with these Zod schemas
// and the web client reuses the inferred types, so the wizard's payment step and
// the controller can never drift on the wire format.
//
// Payment itself is stubbed for the MVP (the real provider integration lands in
// T8.8): creating an order returns a `paymentStubRedirectUrl` the client treats
// as "payment captured", short-circuiting straight to the success page. Money is
// modelled the same way packages model it — a `total` in the currency's MINOR
// units (cents/tetri) so no float rounding crosses the wire.

import { z } from 'zod';

/**
 * Where an order is in its lifecycle. `pending` is the freshly-created,
 * not-yet-paid order; `paid` is the stub "payment captured" terminal state the
 * success page confirms; `cancelled` is an abandoned / failed attempt. The web
 * success page only ever shows `pending` (stub redirect, payment not yet
 * settled) or `paid`, but the enum carries `cancelled` so the contract covers
 * the cancel route (`/checkout/cancel`, returns to step 4) too.
 */
export const orderStatusSchema = z.enum(['pending', 'paid', 'cancelled']);

/** An order's lifecycle state — {@link orderStatusSchema}. */
export type OrderStatus = z.infer<typeof orderStatusSchema>;

/**
 * How an in-person (POS) sale is settled (T7.3). `cash` is tendered at the desk
 * (the operator enters the amount handed over and the UI computes change);
 * `card` is a terminal / card payment; `member_account` charges the sale to the
 * attached member's house account (only valid when the sale has a `memberId`).
 *
 * This is the shared contract the POS payment selection, the email receipt
 * (T7.4), and the end-of-day cash reconciliation (T7.5) all agree on. It is the
 * staff-facing settlement choice and is intentionally separate from a
 * {@link Payment} `provider` key (`"stub"` today, a real gateway with T8.8): a
 * `card` sale may flow through any provider, and `cash` / `member_account` never
 * touch one. Values are lower-snake-case to match the other wire enums.
 */
export const paymentMethodSchema = z.enum(['cash', 'card', 'member_account']);

/** How a POS sale is settled — {@link paymentMethodSchema}. */
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

/**
 * Guest contact details captured in step 3 when the visitor is not signed in.
 * The order needs a name + email to attach the purchase to and to send the
 * confirmation to; a signed-in buyer omits this (the API derives it from their
 * session / `memberId`). Email is normalised the same way auth normalises it so
 * a guest checkout and a later sign-in resolve to the same identity.
 */
export const orderCustomerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email(),
});

/** Captured guest contact details — {@link orderCustomerSchema}. */
export type OrderCustomer = z.infer<typeof orderCustomerSchema>;

/**
 * Body for `POST /orders`. `gymId` scopes the order to one tenant (the public
 * wizard resolves it from the active subdomain) and `packageId` is the plan
 * chosen in step 2. `locationId` (the branch from step 1) is optional because
 * some catalogues are gym-wide. `memberId` is set when the buyer is already
 * signed in; `customer` carries the guest contact details otherwise. Exactly one
 * of the two identifies who the order is for, but the schema keeps both optional
 * so the same endpoint serves member and guest checkout — the API decides which
 * it trusts from the bearer session.
 */
export const createOrderSchema = z.object({
  gymId: z.string().min(1),
  packageId: z.string().min(1),
  locationId: z.string().min(1).optional(),
  memberId: z.string().min(1).optional(),
  customer: orderCustomerSchema.optional(),
});

/** Validated `POST /orders` body — {@link createOrderSchema}. */
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/**
 * Successful `POST /orders` response. The order is created `pending`; the stub
 * payment provider returns a `paymentStubRedirectUrl` the client would normally
 * hand off to (a hosted checkout page) — for the MVP the wizard treats reaching
 * this response as "payment captured" and redirects straight to its own success
 * page keyed by `orderId`.
 */
export const createOrderResponseSchema = z.object({
  orderId: z.string().min(1),
  paymentStubRedirectUrl: z.string().url(),
});

/** Validated `POST /orders` response — {@link createOrderResponseSchema}. */
export type CreateOrderResponse = z.infer<typeof createOrderResponseSchema>;

/**
 * One priced line on an order — the purchased package, plus any discount /
 * fee adjustments the API chooses to itemise. `amount` is in the currency's
 * minor units (negative for a discount) so the success page can render a
 * breakdown that sums to `total` without re-deriving it.
 */
export const orderItemSchema = z.object({
  label: z.string().min(1),
  amount: z.number().int(),
});

/** A single order line item — {@link orderItemSchema}. */
export type OrderItem = z.infer<typeof orderItemSchema>;

/**
 * The order as the success page needs it — a confirmation summary read back from
 * `GET /orders/:orderId`. `total` is in the currency's MINOR units; the page
 * formats it with `Intl.NumberFormat` against `currency` (ISO 4217). `items`
 * itemises what was bought so the confirmation can show a breakdown. An unknown
 * id is a 404 the page renders as its "order not found" state.
 */
export const orderSummarySchema = z.object({
  id: z.string().min(1),
  status: orderStatusSchema,
  total: z.number().int().nonnegative(),
  currency: z.string().length(3),
  items: z.array(orderItemSchema),
});

/** A single order confirmation summary — {@link orderSummarySchema}. */
export type OrderSummary = z.infer<typeof orderSummarySchema>;

/**
 * Successful `GET /orders/:orderId` response — the confirmation summary the
 * success page renders.
 */
export interface GetOrderResponse {
  order: OrderSummary;
}

// ── POS email receipt (T7.4) ──────────────────────────────────────────────
//
// Contracts for emailing a customer the receipt of a completed in-person (POS)
// sale. The POS sale is settled client-side (T7.3) and is not (yet) persisted as
// an Order row, so the receipt request carries the sale's own snapshot — the
// priced lines plus the settlement figures — rather than an order id. The API
// validates the inbound body with {@link sendReceiptSchema}, the admin POS reuses
// the inferred types, and the {@link EmailService} renders the snapshot into the
// receipt email. Every money field is an integer in the currency's MINOR units
// (cents/tetri), consistent with the rest of the order contracts.

/**
 * One priced line on a POS receipt: a product, the quantity sold, its unit price,
 * and the line's net `amount` (`unitPrice * quantity` less any line discount).
 * `unitPrice` and `amount` are in the currency's minor units.
 */
export const receiptLineSchema = z.object({
  name: z.string().trim().min(1).max(200),
  quantity: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative(),
  amount: z.number().int().nonnegative(),
});

/** A single POS receipt line — {@link receiptLineSchema}. */
export type ReceiptLine = z.infer<typeof receiptLineSchema>;

/**
 * The snapshot of a completed POS sale a receipt is rendered from. `subtotal` is
 * the pre-discount sum of the lines, `discountTotal` the combined line + cart
 * discount, and `total` what the customer paid (`subtotal - discountTotal`). For
 * a `cash` sale `cashTendered` is the amount handed over and `changeDue` the
 * change returned; both are zero for `card` / `member_account`. `memberName` is
 * set when the sale was attached to a member, `null` for a walk-in.
 */
export const posReceiptSchema = z.object({
  currency: z.string().length(3),
  items: z.array(receiptLineSchema).min(1),
  subtotal: z.number().int().nonnegative(),
  discountTotal: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  paymentMethod: paymentMethodSchema,
  cashTendered: z.number().int().nonnegative(),
  changeDue: z.number().int().nonnegative(),
  memberName: z.string().trim().min(1).max(100).nullable().optional(),
});

/** A completed-sale snapshot a receipt is built from — {@link posReceiptSchema}. */
export type PosReceipt = z.infer<typeof posReceiptSchema>;

/**
 * Body for `POST /orders/receipt`. `email` is the recipient (normalised the same
 * way auth normalises addresses) and `receipt` the sale snapshot to render. The
 * gym name in the receipt copy is resolved server-side from the request's tenant,
 * never trusted from the client.
 */
export const sendReceiptSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  receipt: posReceiptSchema,
});

/** Validated `POST /orders/receipt` body — {@link sendReceiptSchema}. */
export type SendReceiptInput = z.infer<typeof sendReceiptSchema>;

/**
 * Successful `POST /orders/receipt` response. `delivered` is `true` when the mail
 * was handed to the provider, `false` when email delivery is unconfigured
 * (`RESEND_API_KEY` unset) and the receipt was only logged — the sale itself is
 * unaffected either way, so the POS treats a `false` as a soft, non-error outcome.
 */
export const sendReceiptResponseSchema = z.object({
  delivered: z.boolean(),
});

/** Validated `POST /orders/receipt` response — {@link sendReceiptResponseSchema}. */
export type SendReceiptResponse = z.infer<typeof sendReceiptResponseSchema>;

// ── POS sale persistence (T7.5) ───────────────────────────────────────────
//
// Contracts for persisting a completed in-person (POS) sale as an Order + Payment
// row, so the day's takings exist to reconcile against. The admin POS posts the
// same {@link posReceiptSchema} snapshot it sends to the receipt endpoint, plus
// the attached member's id (when the sale was charged to a member). The API turns
// the snapshot into a `PAID` order with its priced lines and a single `CAPTURED`
// payment stamped with the settlement {@link PaymentMethod}.

/**
 * Body for `POST /orders/pos-sale`. `receipt` is the completed-sale snapshot (the
 * priced lines + settlement figures, reused verbatim from the receipt contract)
 * and `memberId` attaches the order to a member — required for a `member_account`
 * sale (there is an account to charge), `null`/absent for a walk-in. The gym is
 * resolved server-side from the request's tenant, never trusted from the client.
 */
export const recordPosSaleSchema = z
  .object({
    memberId: z.string().min(1).nullable().optional(),
    receipt: posReceiptSchema,
    /**
     * The membership plan sold on this sale, when the operator rang up a membership
     * rather than (or alongside) products. The API enrols the attached member on it
     * as part of recording the sale, so selling a membership at the desk produces a
     * live subscription — not just a payment.
     *
     * At most one: enrolment refuses a member who already holds a live subscription,
     * so two memberships on one sale could never both succeed.
     */
    planId: z.string().min(1).optional(),
    /**
     * The branch the sale was rung up at. Recorded on the order so takings and
     * reports can be split per location; omitted by a single-site gym, which has
     * nothing to attribute.
     */
    locationId: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.planId && !value.memberId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        // A walk-in has no member record to attach a subscription to.
        message: 'A membership sale must be attached to a member',
        path: ['memberId'],
      });
    }
  });

/** Validated `POST /orders/pos-sale` body — {@link recordPosSaleSchema}. */
export type RecordPosSaleInput = z.infer<typeof recordPosSaleSchema>;

/**
 * Successful `POST /orders/pos-sale` response — the ids of the rows the sale
 * created, so the POS can reference the order on the confirmation / receipt.
 */
export const recordPosSaleResponseSchema = z.object({
  orderId: z.string().min(1),
  paymentId: z.string().min(1),
});

/** Validated `POST /orders/pos-sale` response — {@link recordPosSaleResponseSchema}. */
export type RecordPosSaleResponse = z.infer<typeof recordPosSaleResponseSchema>;

// ── End-of-day cash reconciliation (T7.5) ─────────────────────────────────
//
// The report a manager pulls at close to balance the cash drawer: the day's
// settled (`CAPTURED`) takings, grouped by settlement method, for one business
// day in the gym's own timezone. The operator counts the drawer and compares it
// to `expectedCash`; the variance is computed client-side from the counted figure
// ({@link computeCashVariance}) so no count is ever sent to the server. Every
// money field is an integer in the currency's MINOR units, as elsewhere.

/** The settlement methods a reconciliation always reports, in display order. */
export const RECONCILIATION_METHODS = ['cash', 'card', 'member_account'] as const;

/** True when `YYYY-MM-DD` names a real calendar date (rejects e.g. `2026-02-30`). */
function isCalendarDate(value: string): boolean {
  const parts = value.split('-').map(Number);
  const [year, month, day] = parts;
  if (year === undefined || month === undefined || day === undefined) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/**
 * A business day as a `YYYY-MM-DD` calendar date — interpreted in the gym's own
 * timezone server-side. Validated as a real date so a typo is a `400` rather than
 * an empty report for a day that doesn't exist.
 */
export const businessDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .refine(isCalendarDate, 'Not a valid calendar date');

/** Query for `GET /orders/reconciliation` — the business day to report on. */
export const cashReconciliationQuerySchema = z.object({
  date: businessDateSchema,
});

/** Validated `GET /orders/reconciliation` query — {@link cashReconciliationQuerySchema}. */
export type CashReconciliationQuery = z.infer<typeof cashReconciliationQuerySchema>;

/** One settlement method's tally on the report: how many sales and their total. */
export const reconciliationMethodTotalSchema = z.object({
  method: paymentMethodSchema,
  count: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

/** A single method's reconciliation tally — {@link reconciliationMethodTotalSchema}. */
export type ReconciliationMethodTotal = z.infer<typeof reconciliationMethodTotalSchema>;

/**
 * The end-of-day reconciliation report. `methods` always carries one entry per
 * {@link RECONCILIATION_METHODS} value (zeroed when there were no such sales), in
 * that order, so the UI renders a stable table. `grossTotal` is every method's
 * total summed, `salesCount` every method's count, and `expectedCash` the `cash`
 * method's total — the figure the counted drawer is balanced against.
 * `generatedAt` is an ISO-8601 instant stamping when the snapshot was taken.
 */
export const cashReconciliationReportSchema = z.object({
  date: businessDateSchema,
  currency: z.string().length(3),
  methods: z.array(reconciliationMethodTotalSchema),
  salesCount: z.number().int().nonnegative(),
  grossTotal: z.number().int().nonnegative(),
  expectedCash: z.number().int().nonnegative(),
  generatedAt: z.string().datetime(),
});

/** The end-of-day reconciliation report — {@link cashReconciliationReportSchema}. */
export type CashReconciliationReport = z.infer<typeof cashReconciliationReportSchema>;

/** A raw per-method tally (e.g. a Prisma `groupBy` row) fed to the report builder. */
export interface ReconciliationTally {
  method: PaymentMethod;
  count: number;
  total: number;
}

/**
 * Fold raw per-method tallies into a complete {@link CashReconciliationReport}.
 * Pure (no clock, no I/O) so both the API and tests can build a report
 * deterministically. Always emits one entry per {@link RECONCILIATION_METHODS}
 * value in order — a method with no sales reports `{ count: 0, total: 0 }` rather
 * than being dropped — and ignores any tally with an unrecognised method.
 */
export function buildReconciliationReport(
  tallies: readonly ReconciliationTally[],
  meta: { date: string; currency: string; generatedAt: string },
): CashReconciliationReport {
  const byMethod = new Map<PaymentMethod, { count: number; total: number }>(
    RECONCILIATION_METHODS.map((method) => [method, { count: 0, total: 0 }]),
  );
  for (const tally of tallies) {
    const acc = byMethod.get(tally.method);
    if (!acc) {
      continue;
    }
    acc.count += tally.count;
    acc.total += tally.total;
  }
  const methods: ReconciliationMethodTotal[] = RECONCILIATION_METHODS.map((method) => {
    const acc = byMethod.get(method) ?? { count: 0, total: 0 };
    return { method, count: acc.count, total: acc.total };
  });
  return {
    date: meta.date,
    currency: meta.currency,
    methods,
    salesCount: methods.reduce((sum, entry) => sum + entry.count, 0),
    grossTotal: methods.reduce((sum, entry) => sum + entry.total, 0),
    expectedCash: byMethod.get('cash')?.total ?? 0,
    generatedAt: meta.generatedAt,
  };
}

/** Whether a counted drawer balances, runs over, or comes up short of expected. */
export const cashVarianceStatusSchema = z.enum(['balanced', 'over', 'short']);

/** The outcome of balancing a counted drawer — {@link cashVarianceStatusSchema}. */
export type CashVarianceStatus = z.infer<typeof cashVarianceStatusSchema>;

/** A counted cash drawer balanced against the report's expected cash. */
export interface CashVariance {
  expectedCash: number;
  countedCash: number;
  /** `countedCash - expectedCash` — positive is an overage, negative a shortfall. */
  variance: number;
  status: CashVarianceStatus;
}

/**
 * Balance a counted cash drawer against the day's expected cash. Pure; both
 * amounts are integer minor units. `variance` is `counted - expected` so a
 * positive figure is money over and a negative figure money short; `status`
 * names the three cases for the UI to colour.
 */
export function computeCashVariance(expectedCash: number, countedCash: number): CashVariance {
  const variance = countedCash - expectedCash;
  const status: CashVarianceStatus = variance === 0 ? 'balanced' : variance > 0 ? 'over' : 'short';
  return { expectedCash, countedCash, variance, status };
}
