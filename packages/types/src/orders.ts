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
