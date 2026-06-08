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

/** Successful `GET /orders` response — one filtered, server-paginated page. */
export const listOrdersResponseSchema = z.object({
  data: z.array(adminOrderRowSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
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
 * contract), the `refunds` issued against it, and the generated `statusTimeline`.
 */
export const adminOrderDetailSchema = adminOrderRowSchema.extend({
  items: z.array(adminOrderItemSchema),
  payments: z.array(adminPaymentSchema),
  refunds: z.array(adminRefundSchema),
  statusTimeline: z.array(orderStatusTimelineEntrySchema),
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
 */
export const ORDER_EXPORT_COLUMNS = [
  'id',
  'createdAt',
  'channel',
  'status',
  'currency',
  'total',
  'refundedAmount',
  'paymentMethod',
  'memberId',
  'customerName',
  'itemCount',
] as const satisfies readonly (keyof AdminOrderRow)[];

/**
 * Render one order roster row as the ordered cell values for a CSV line, matching
 * {@link ORDER_EXPORT_COLUMNS}. Pure — the service wraps each cell with CSV
 * escaping and joins with the line terminator. A null cell renders empty.
 */
export function orderExportCells(row: AdminOrderRow): string[] {
  return ORDER_EXPORT_COLUMNS.map((column) => {
    const value = row[column];
    return value === null ? '' : String(value);
  });
}
