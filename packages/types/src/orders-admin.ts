// @fit/types — admin order management contracts (Zod schemas + inferred types).
//
// Shapes crossing the API boundary for the staff console's order management
// (T7.9): the paginated, filterable `GET /orders` roster the admin table renders,
// the `GET /orders/:id` detail view (items, payments, refunds, status timeline),
// the `POST /orders/:id/refund` write, and the `GET /orders/export` CSV stream.
// The API validates inbound queries/bodies with these Zod schemas and the
// `@fit/admin` console reuses the inferred types, so the table / detail / refund
// form and the controller can never drift on the wire format.
//
// Money is carried the same way the rest of the order contracts carry it — an
// integer in the currency's MINOR units (cents/tetri) — so no float rounding ever
// crosses the wire; the client formats with `Intl.NumberFormat` against `currency`.
// Order/payment status enums are the UPPERCASE Prisma values (not the lowercase
// public wire enums in `./orders`): this is a staff-internal contract that reads
// the database shape directly, so mirroring the Prisma enums keeps the mapping
// trivial and the admin badges readable.

import { z } from 'zod';
import { fulfillmentSchema } from './cart';
import { paymentMethodSchema } from './orders';

/**
 * The sales channel an order came through. Derived, not stored: an order settled
 * through the in-person POS (its payment `provider` is `"pos"`, T7.5) is `POS`;
 * everything else — the online purchase wizard / shop checkout, whose stub or real
 * gateway provider is anything but `"pos"`, including an as-yet-unpaid `PENDING`
 * order with no payment — is `ONLINE`. The roster filter narrows by this.
 */
export const orderChannelSchema = z.enum(['POS', 'ONLINE']);

/** An order's sales channel — {@link orderChannelSchema}. */
export type OrderChannel = z.infer<typeof orderChannelSchema>;

/**
 * Derive an order's {@link OrderChannel} from its payment provider key. The POS
 * sale persistence (T7.5) stamps `provider: "pos"`; the online flows use `"stub"`
 * (and a real gateway with T8.8). A missing provider (no payment row yet) is an
 * online order still mid-checkout. Pure, so the service and tests agree.
 */
export function deriveOrderChannel(provider: string | null | undefined): OrderChannel {
  return provider === 'pos' ? 'POS' : 'ONLINE';
}

/**
 * An order's lifecycle status, mirroring the Prisma `OrderStatus` enum (T7.1 +
 * the `REFUNDED` terminal state added in T7.9). The roster status filter and the
 * detail badge key off this.
 */
export const adminOrderStatusSchema = z.enum(['PENDING', 'PAID', 'CANCELLED', 'REFUNDED']);

/** An order's lifecycle status (admin view) — {@link adminOrderStatusSchema}. */
export type AdminOrderStatus = z.infer<typeof adminOrderStatusSchema>;

/**
 * A payment's lifecycle status, mirroring the Prisma `PaymentStatus` enum (T7.1).
 * `CAPTURED` is settled money; `REFUNDED` is a fully reversed capture (T7.9).
 */
export const adminPaymentStatusSchema = z.enum(['PENDING', 'CAPTURED', 'FAILED', 'REFUNDED']);

/** A payment's lifecycle status (admin view) — {@link adminPaymentStatusSchema}. */
export type AdminPaymentStatus = z.infer<typeof adminPaymentStatusSchema>;

/**
 * A date-range bound on `createdAt` for the roster / export filters. Accepts a
 * full ISO-8601 instant or a bare `YYYY-MM-DD` calendar date; a date-only value
 * is widened to the whole UTC day — the `from` bound to its `00:00:00.000Z` start
 * and the `to` bound to its `23:59:59.999Z` end — so a `<input type="date">` range
 * reads inclusively the way an operator expects. Returns a `Date` the service
 * applies as `createdAt >= from` / `createdAt <= to`.
 */
function dateBoundSchema(bound: 'start' | 'end'): z.ZodType<Date, z.ZodTypeDef, string> {
  return z
    .string()
    .trim()
    .min(1)
    .transform((value, ctx) => {
      const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
      const iso = isDateOnly
        ? `${value}T${bound === 'start' ? '00:00:00.000' : '23:59:59.999'}Z`
        : value;
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Not a valid ISO date' });
        return z.NEVER;
      }
      return date;
    });
}

/**
 * Query for `GET /orders` and `GET /orders/export` (T7.9). Every filter is
 * optional — a bare call lists the tenant's whole order history, newest first.
 * `channel` and `status` narrow by the derived channel and lifecycle status;
 * `memberId` to one member's orders; `from`/`to` bound `createdAt` (inclusive,
 * see {@link dateBoundSchema}). `page`/`limit` paginate the roster (the export
 * ignores them and streams the full filtered set).
 */
export const listOrdersQuerySchema = z.object({
  channel: orderChannelSchema.optional(),
  status: adminOrderStatusSchema.optional(),
  memberId: z.string().min(1).optional(),
  from: dateBoundSchema('start').optional(),
  to: dateBoundSchema('end').optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Validated `GET /orders` query — {@link listOrdersQuerySchema}. */
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;

/** The roster filters as raw (pre-coercion) input — what the admin form serialises. */
export type ListOrdersQueryInput = z.input<typeof listOrdersQuerySchema>;

/**
 * One row of the admin order roster — the denormalised summary the table renders.
 * `paymentMethod` is null for an order with no payment yet (a `PENDING` online
 * order); `refundedAmount` is the running total refunded so a partly-refunded
 * order shows its net at a glance. `createdAt` is an ISO-8601 instant.
 */
export const adminOrderRowSchema = z.object({
  id: z.string().min(1),
  channel: orderChannelSchema,
  status: adminOrderStatusSchema,
  total: z.number().int(),
  currency: z.string().length(3),
  refundedAmount: z.number().int().nonnegative(),
  memberId: z.string().nullable(),
  customerName: z.string().nullable(),
  paymentMethod: paymentMethodSchema.nullable(),
  itemCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});

/** A single admin order roster row — {@link adminOrderRowSchema}. */
export type AdminOrderRow = z.infer<typeof adminOrderRowSchema>;

/**
 * The at-a-glance totals for a filtered order roster (T4.3) — computed across the
 * **whole** filtered set, not just the visible page, so the summary tiles reflect
 * the current channel / status / member / date filters rather than one page of
 * rows. All money fields are integers in the currency's MINOR units, matching the
 * rest of the order contracts; `netTotal` is `grossTotal - refundedTotal` (the
 * takings kept after refunds). `currency` is the roster's display currency (the
 * gym trades in a single currency this milestone), used to format the tiles.
 */
export const orderRosterSummarySchema = z.object({
  orderCount: z.number().int().nonnegative(),
  grossTotal: z.number().int().nonnegative(),
  refundedTotal: z.number().int().nonnegative(),
  netTotal: z.number().int(),
  currency: z.string().length(3),
});

/** The filtered order roster's totals — {@link orderRosterSummarySchema}. */
export type OrderRosterSummary = z.infer<typeof orderRosterSummarySchema>;

/** Successful `GET /orders` response — one filtered, server-paginated page. */
export const listOrdersResponseSchema = z.object({
  data: z.array(adminOrderRowSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  /** Totals across the whole filtered set — {@link orderRosterSummarySchema}. */
  summary: orderRosterSummarySchema,
});

/** Validated `GET /orders` response — {@link listOrdersResponseSchema}. */
export type ListOrdersResponse = z.infer<typeof listOrdersResponseSchema>;

/**
 * One line on an order's detail page. `productVariantId` is the composite variant
 * reference (`"<productId>:<variantIndex|base>"`) recorded at sale time, null for
 * a promo / adjustment line or an untracked POS line; `qty` is the units sold.
 */
export const adminOrderItemSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  amount: z.number().int(),
  productVariantId: z.string().nullable(),
  qty: z.number().int().nonnegative(),
});

/** A single order detail line — {@link adminOrderItemSchema}. */
export type AdminOrderItem = z.infer<typeof adminOrderItemSchema>;

/** One payment on an order's detail page — mirrors the Prisma `Payment` row. */
export const adminPaymentSchema = z.object({
  id: z.string().min(1),
  amount: z.number().int(),
  currency: z.string().length(3),
  status: adminPaymentStatusSchema,
  method: paymentMethodSchema,
  provider: z.string(),
  refundedAmount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});

/** A single order payment — {@link adminPaymentSchema}. */
export type AdminPayment = z.infer<typeof adminPaymentSchema>;

/** One refund on an order's detail page — mirrors the Prisma `Refund` row. */
export const adminRefundSchema = z.object({
  id: z.string().min(1),
  amount: z.number().int(),
  reason: z.string(),
  restockItems: z.boolean(),
  createdAt: z.string().datetime(),
});

/** A single order refund — {@link adminRefundSchema}. */
export type AdminRefund = z.infer<typeof adminRefundSchema>;

/**
 * One entry on an order's status timeline — a recorded transition from the
 * append-only `OrderStatusEvent` log (T7.9). `at` is an ISO-8601 instant. The
 * timeline is generated from the log, never directly editable.
 */
export const orderStatusTimelineEntrySchema = z.object({
  status: adminOrderStatusSchema,
  at: z.string().datetime(),
});

/** A single status timeline entry — {@link orderStatusTimelineEntrySchema}. */
export type OrderStatusTimelineEntry = z.infer<typeof orderStatusTimelineEntrySchema>;

/**
 * Successful `GET /orders/:id` response — the roster row plus its full detail:
 * the priced `items`, the `payments` (0 or 1, kept an array to match the
 * contract), the `refunds` issued against it, the generated `statusTimeline`, and
 * the order's fulfilment (T7.10): `fulfillment` is the chosen mode and
 * `deliveryAddress` the destination for a `DELIVERY` order (null for a `PICKUP`,
 * which collects from the order's location). Mirrors the Prisma `Fulfillment`
 * enum directly, same as the other uppercase admin enums.
 */
export const adminOrderDetailSchema = adminOrderRowSchema.extend({
  items: z.array(adminOrderItemSchema),
  payments: z.array(adminPaymentSchema),
  refunds: z.array(adminRefundSchema),
  statusTimeline: z.array(orderStatusTimelineEntrySchema),
  fulfillment: fulfillmentSchema,
  deliveryAddress: z.string().nullable(),
});

/** A full admin order detail — {@link adminOrderDetailSchema}. */
export type AdminOrderDetail = z.infer<typeof adminOrderDetailSchema>;

/** Error code returned (`422`) when a refund would exceed the order's net paid amount. */
export const REFUND_EXCEEDS_PAID_CODE = 'EXCEEDS_PAID_AMOUNT';

/**
 * Body for `POST /orders/:id/refund` (T7.9). `amount` is the refund value in the
 * currency's MINOR units (positive; must not exceed the payment's net captured
 * amount, else `422 EXCEEDS_PAID_AMOUNT`). `reason` is the operator's note.
 * `restockItems` returns the sold variants to stock (default true); clear it when
 * the goods came back damaged. A `Decimal` in the original contract — carried as
 * an integer minor-unit here for consistency with every other money field.
 */
export const refundOrderSchema = z.object({
  amount: z.number().int().positive(),
  reason: z.string().trim().min(1).max(500),
  restockItems: z.boolean().default(true),
});

/** Validated `POST /orders/:id/refund` body — {@link refundOrderSchema}. */
export type RefundOrderInput = z.infer<typeof refundOrderSchema>;

/** Successful `POST /orders/:id/refund` response — the new refund's id. */
export const refundOrderResponseSchema = z.object({
  refundId: z.string().min(1),
});

/** Validated `POST /orders/:id/refund` response — {@link refundOrderResponseSchema}. */
export type RefundOrderResponse = z.infer<typeof refundOrderResponseSchema>;

/**
 * The header row for the orders CSV export (T7.9), in column order. Kept here as
 * the single source of truth so the streaming service and any test agree on the
 * shape, mirroring how {@link RECONCILIATION_METHODS} pins the report's columns.
 *
 * Every column but `netTotal` maps to a field on {@link AdminOrderRow};
 * `netTotal` is the derived `total - refundedAmount` — the takings kept after
 * refunds — placed beside the gross figures so each exported row self-reconciles
 * against the Payment/Order tables the roster is built from (T4.11).
 */
export const ORDER_EXPORT_COLUMNS = [
  'id',
  'createdAt',
  'channel',
  'status',
  'currency',
  'total',
  'refundedAmount',
  'netTotal',
  'paymentMethod',
  'memberId',
  'customerName',
  'itemCount',
] as const;

/**
 * Assumed minor units per major unit for the export's money columns (USD/EUR/GEL
 * — all two-decimal this milestone), mirroring the receipt email's formatting.
 */
const EXPORT_MINOR_PER_MAJOR = 100;

/**
 * Render a minor-unit money amount as a plain major-unit decimal (e.g. `1000` →
 * `"10.00"`) for the CSV. The export presents money the way the receipts and the
 * admin UI do — actual currency amounts against the row's `currency` column —
 * rather than raw minor units, so a bookkeeper's spreadsheet reconciles at a
 * glance (T4.11). Unquoted and separator-free, so it never needs CSV escaping.
 */
function formatExportAmount(minor: number): string {
  return (minor / EXPORT_MINOR_PER_MAJOR).toFixed(2);
}

/**
 * Render one order roster row as the ordered cell values for a CSV line, matching
 * {@link ORDER_EXPORT_COLUMNS}. Money columns (`total`, `refundedAmount`,
 * `netTotal`) are formatted as major-unit decimals via {@link formatExportAmount};
 * `netTotal` is `total - refundedAmount`. Pure — the service wraps each cell with
 * CSV escaping and joins with the line terminator. A null cell renders empty.
 */
export function orderExportCells(row: AdminOrderRow): string[] {
  const netTotal = row.total - row.refundedAmount;
  return [
    row.id,
    row.createdAt,
    row.channel,
    row.status,
    row.currency,
    formatExportAmount(row.total),
    formatExportAmount(row.refundedAmount),
    formatExportAmount(netTotal),
    row.paymentMethod ?? '',
    row.memberId ?? '',
    row.customerName ?? '',
    String(row.itemCount),
  ];
}
