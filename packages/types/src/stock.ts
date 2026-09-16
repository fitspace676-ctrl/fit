// @fit/types — inventory contracts (Zod schemas + inferred types).
//
// Shapes crossing the API boundary for a product's on-hand stock: the status a
// count derives to, the write that changes a count, and the append-only ledger
// that records every such change.
//
// A product tracks stock in exactly one of two ways, never both:
//
//   • **per variant** — when the product has variants, each carries its own
//     `stock` inside the product's `variants` JSON, and the base column is null;
//   • **base** — when it has none, `Product.stock` holds the single count for
//     the `"<productId>:base"` position the cart already addresses.
//
// A product with no variants and a null base count is **untracked** — the state
// every product starts in, so a gym that never counts its towels is never nagged
// about them. `resolveStockLevel` is the single place those cases turn into the
// badge the console shows, shared so the API, the console and the storefront
// cannot drift on where "low" begins.
//
// **Since Stage 4 of multi-branch, a position is `(productId, variantIndex)` AT A
// BRANCH.** The authoritative count lives in `ProductStock`, one row per (product,
// branch); `Product.stock` and `Product.variants[].stock` are the gym-wide roll-up
// of those rows. Everything above still describes how a product tracks stock — the
// base-XOR-variants rule is unchanged — it just now describes it one level down.
// The wire consequence is that a write against a count has to name the shelf it
// changed, which is what `adjustStockSchema.locationId` is for.

import { z } from 'zod';
import { DEFAULT_LOW_STOCK_THRESHOLD, MAX_STOCK_COUNT } from './products-admin';

/** The longest note a manual movement may carry. */
export const MAX_STOCK_NOTE = 280;

// ── Derived status ───────────────────────────────────────────────────────────

/**
 * A stock position's standing, derived from its count — never stored. `untracked`
 * is "this product does not count stock at all", which is deliberately distinct
 * from `out` (it is counted, and there are none left).
 */
export const stockLevelSchema = z.enum(['untracked', 'out', 'low', 'in']);

/** A stock position's derived standing — {@link stockLevelSchema}. */
export type StockLevel = z.infer<typeof stockLevelSchema>;

/**
 * Classify a product's stock from its most-urgent position. `lowestStock` is the
 * smallest on-hand count across whichever positions the product tracks, or `null`
 * when it tracks none. `lowStockThreshold` is the product's own reorder cushion,
 * falling back to {@link DEFAULT_LOW_STOCK_THRESHOLD} when it has not set one.
 *
 * The boundaries: `0` is out, `1..threshold` inclusive is low, above is in stock.
 * A threshold of `0` therefore means "only warn me when it is actually gone".
 */
export function resolveStockLevel(input: {
  lowestStock: number | null;
  lowStockThreshold?: number | null;
}): StockLevel {
  if (input.lowestStock === null) return 'untracked';
  if (input.lowestStock <= 0) return 'out';
  return input.lowestStock <= (input.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD)
    ? 'low'
    : 'in';
}

/**
 * The reorder cushion a stock position is actually judged against — the ONE place
 * the three-rung fallback chain Stage 4 introduced is resolved.
 *
 * 1. `branchThreshold` — `ProductStock.lowStockThreshold`, this line at THIS
 *    branch. A flagship that turns over four times faster than the satellite
 *    needs its own number, and that is the whole reason the column exists.
 * 2. `productThreshold` — `Product.lowStockThreshold`, this line everywhere.
 * 3. {@link DEFAULT_LOW_STOCK_THRESHOLD} — the shared default, so a gym only sets
 *    either level for the few lines whose turnover differs from the rest.
 *
 * `null` at a rung means "not set here, ask the next one" — never "zero". `0` is a
 * real, deliberate setting ("only warn me when it is actually gone"), which is why
 * this reads `?? ` down the chain rather than testing truthiness.
 *
 * The branch rung is skipped entirely in "all branches" mode: a gym-wide total is
 * not held on any one shelf, so no branch's cushion applies to it. Callers express
 * that by passing `branchThreshold: null`, and the chain then starts at rung 2 —
 * which is exactly what {@link resolveStockLevel} did before Stage 4, so the
 * all-branches figures keep the meaning they have always had.
 */
export function resolveLowStockThreshold(input: {
  branchThreshold?: number | null;
  productThreshold?: number | null;
}): number {
  return input.branchThreshold ?? input.productThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
}

// ── The ledger ───────────────────────────────────────────────────────────────

/**
 * Why a movement happened. The first four are the reasons staff choose when
 * correcting a count by hand; `SALE` and `REFUND_RESTOCK` are written only by the
 * checkout and refund paths and are rejected on the manual endpoint, so the
 * ledger can never claim a sale that no order backs.
 */
export const stockMovementReasonSchema = z.enum([
  'RECEIVE',
  'ADJUSTMENT',
  'RECOUNT',
  'WRITE_OFF',
  'SALE',
  'REFUND_RESTOCK',
]);

/** Why a movement happened — {@link stockMovementReasonSchema}. */
export type StockMovementReason = z.infer<typeof stockMovementReasonSchema>;

/** The reasons a human may pick when adjusting a count from the console. */
export const MANUAL_STOCK_REASONS = ['RECEIVE', 'ADJUSTMENT', 'RECOUNT', 'WRITE_OFF'] as const;

/** A reason staff may choose — the manual subset of {@link StockMovementReason}. */
export type ManualStockReason = (typeof MANUAL_STOCK_REASONS)[number];

/** Reasons the console may send to `POST /admin/products/:id/stock`. */
export const manualStockReasonSchema = z.enum(MANUAL_STOCK_REASONS);

/**
 * Body for `POST /admin/products/:id/stock` — one movement against one position.
 *
 * `variantIndex` addresses the position: a slot in the product's variant array,
 * or `null` for the base position (the product sold with no variant). Positions
 * are addressed by index because variants have no row id of their own.
 *
 * The change is expressed one of two ways, and exactly one must be given:
 * `delta` nudges the count by a signed amount ("three more arrived"), while
 * `setTo` declares the absolute truth ("I counted the shelf: eleven"). A recount
 * is the latter, which is why the server derives that movement's delta rather
 * than trusting a client to subtract — two staff counting at once must not both
 * apply the same difference.
 *
 * `locationId` is **required**, and it is the one place in multi-branch where the
 * branch is not optional-with-a-server-side-default. Stages 2 and 3 made it
 * optional on the wire because refusing there fails the wrong way round — a front
 * desk that cannot check anybody in is worse than an under-specified arrival, so
 * `recordCheckInSchema` falls back to the gym's default branch. Nothing about an
 * adjustment works like that. It is a claim about a physical shelf ("I counted
 * eleven"), the console always knows which branch it is displaying, and the
 * fallback would silently apply a satellite's count-sheet to the flagship's row —
 * a wrong count that reconciles perfectly and that nobody goes looking for. That
 * untargeted write is precisely what Stage 4 exists to eliminate, so the honest
 * failure is a `400` the console cannot help but fix.
 */
export const adjustStockSchema = z
  .object({
    /** The branch whose shelf this movement changed. Required — see the doc above. */
    locationId: z.string().trim().min(1, 'Choose the branch this count applies to'),
    variantIndex: z.coerce
      .number()
      .int('Variant index must be a whole number')
      .nonnegative('Variant index cannot be negative')
      .nullable()
      .default(null),
    delta: z.coerce
      .number()
      .int('Change must be a whole number')
      .min(-MAX_STOCK_COUNT)
      .max(MAX_STOCK_COUNT)
      .optional(),
    setTo: z.coerce
      .number()
      .int('Count must be a whole number')
      .min(0, 'Count cannot be negative')
      .max(MAX_STOCK_COUNT, `Count must be ${MAX_STOCK_COUNT} or fewer`)
      .optional(),
    reason: manualStockReasonSchema,
    note: z.string().trim().max(MAX_STOCK_NOTE).default(''),
  })
  .refine((body) => (body.delta === undefined) !== (body.setTo === undefined), {
    message: 'Provide either a delta or an absolute count, not both',
    path: ['delta'],
  })
  .refine((body) => body.delta !== 0, {
    message: 'A change of zero would record nothing',
    path: ['delta'],
  });

/** Validated `POST /admin/products/:id/stock` body — {@link adjustStockSchema}. */
export type AdjustStockInput = z.input<typeof adjustStockSchema>;

/** Parsed `POST /admin/products/:id/stock` body — {@link adjustStockSchema}. */
export type AdjustStockData = z.output<typeof adjustStockSchema>;

/**
 * One entry in a product's stock ledger as the console renders it. `delta` is the
 * signed change and `resultingStock` the count it left behind, so the history
 * reads without replaying every earlier row. `variantLabel` is the variant's name
 * as it stood at the time — a later rename cannot make old history unreadable.
 * `actorName` is the staff member who caused it, or `null` for a member-driven
 * checkout. `createdAt` is an ISO-8601 instant the console formats locally.
 *
 * `locationName` is the branch whose shelf moved, following the
 * `AdminClassTemplateRow` / `adminOrderRowSchema` / `MemberRow` / `checkInRowSchema`
 * precedent — `null` when the movement names no branch, which is either a row
 * written before Stage 4 (the migration attributed those it could) or one whose
 * branch has since been retired (`SetNull`). Unlike the aggregate views, the ledger
 * genuinely MIXES branches in "all branches" mode, so here the branch belongs on
 * the row and not on the response.
 *
 * **`resultingStock` is the count at `locationName`'s branch, not a gym-wide
 * total** — and on a row written before Stage 4 it is the gym-wide figure of the
 * day, deliberately not rewritten. Read `delta` plus the branch; the running total
 * is only trustworthy across the Stage 4 seam for a gym that had one branch.
 */
export interface StockMovementRow {
  id: string;
  locationName: string | null;
  variantIndex: number | null;
  variantLabel: string;
  delta: number;
  resultingStock: number;
  reason: StockMovementReason;
  note: string;
  actorName: string | null;
  orderId: string | null;
  createdAt: string;
}

/**
 * Query for `GET /admin/products/:id/stock-movements`. Paginated because a busy
 * product's ledger grows without bound; newest first is the only ordering the
 * history view wants, so it is not a parameter.
 *
 * `locationId` narrows to one branch's shelf. Omitted is every branch — including
 * the movements that name none, which is the only way the pre-Stage-4 history
 * stays reachable at all.
 */
export const listStockMovementsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  locationId: z.string().trim().min(1).optional(),
});

/** Validated ledger query — {@link listStockMovementsQuerySchema}. */
export type ListStockMovementsQuery = z.infer<typeof listStockMovementsQuerySchema>;

/** Successful `GET /admin/products/:id/stock-movements` response, newest first. */
export interface ListStockMovementsResponse {
  data: StockMovementRow[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Successful `POST /admin/products/:id/stock` response — the position's new state.
 *
 * `stock` is the count AT `locationId` — the shelf the adjustment actually
 * changed. `totalStock` is the gym-wide roll-up after it, so the console can
 * refresh both the branch cell and the catalogue's total from one reply rather
 * than re-fetching to find out whether the two still agree.
 */
export interface AdjustStockResponse {
  locationId: string;
  variantIndex: number | null;
  stock: number;
  totalStock: number;
  movement: StockMovementRow;
}
