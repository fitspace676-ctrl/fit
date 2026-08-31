import { StockMovementReason, type Prisma } from '@fit/db';
import { decodeVariantRef, productVariantsSchema } from '@fit/types';

/**
 * Moving on-hand stock because an **order** did — the one place a sale draws units
 * down and a refund puts them back.
 *
 * The two directions are the same algorithm read forwards and backwards, so they
 * live in one function rather than three near-copies (the online checkout, the
 * till, and the refund restock all call it). Sharing it is what keeps them from
 * drifting: every position that moves writes its own ledger row in the caller's
 * transaction, so stock and the order that changed it commit together or not at
 * all, and the product's history always explains its current count.
 *
 * ## Stage 4: the units leave the branch that sold them
 *
 * Before Stage 4 of multi-branch this drew every sale down from ONE gym-wide
 * figure, whichever till rang it. That was not a missing filter, it was a wrong
 * number: a sale at the satellite emptied the flagship's shelf on paper, and no
 * branch's count meant anything at a gym with more than one. The authoritative
 * count now lives in `ProductStock`, one row per (product, branch), and this
 * function writes the row belonging to the branch the ORDER names — the till's
 * "Selling at", or an online pickup's collection branch.
 *
 * `Product.stock` and `Product.variants[].stock` survive as the gym-wide roll-up
 * every existing reader still asks for (the member shop's "in stock?", the cart's
 * pre-checkout check, the mobile catalogue), and the one rule that keeps the two
 * from disagreeing is applied here without exception: **the branch row and the
 * roll-up move by the same signed delta, inside the same transaction.** The base
 * position's branch write is a bounded `decrement` / `increment` claim per
 * `docs/adr/atomic-counters.md`, and the roll-up follows it with the delta the
 * claim actually landed — never with the delta this process hoped for.
 *
 * The per-variant counts are the exception that ADR already names: they live inside
 * a JSON array, on both the branch row and the product, so they are read, edited in
 * memory and written back. That is a lost update by construction and it is not new
 * — the pre-Stage-4 code had exactly the same hole on `Product.variants`. The fix
 * is the row-per-position table the schema keeps the door open for, not a bigger
 * transaction here.
 */

/** One order line as the ledger sees it — which position it sold, and how many. */
export interface OrderStockLine {
  /** The {@link encodeVariantRef} reference of the sold position, or `null` for a line that owns none. */
  productVariantId: string | null;
  /** Units on the line. */
  qty: number;
}

/** The reasons an order may move stock — the two the manual endpoint refuses. */
export type OrderStockReason =
  | typeof StockMovementReason.SALE
  | typeof StockMovementReason.REFUND_RESTOCK;

/**
 * How many times a base-position claim is retried before the position is left
 * alone. A retry only happens when another writer moved the same branch row
 * between this transaction's read and its claim; three attempts is generous for a
 * contention window measured in statements, and a bounded loop is what stops a
 * pathological writer from holding a checkout open indefinitely.
 */
const CLAIM_ATTEMPTS = 3;

/**
 * The slice of a transaction client this needs. Narrow on purpose: the base
 * `Prisma.TransactionClient` is not assignable from the tenant-**extended** client
 * (their default args differ), so a helper both may pass has to be typed by the
 * handful of calls it actually makes rather than by either client's whole surface.
 *
 * Every `where` names `gymId` explicitly rather than leaning on the tenant
 * extension, because one of the two callers does not have it: the online checkout
 * (`CartService`) runs on the unscoped `PrismaService`, so a query that relied on
 * ambient scoping here would read across tenants from that path alone.
 */
export interface OrderStockClient {
  order: {
    findFirst(args: {
      where: { id: string; gymId: string };
      select: { locationId: true };
    }): Promise<{ locationId: string | null } | null>;
  };
  location: {
    findFirst(args: {
      where: { gymId: string; isDefault: true };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
  product: {
    findMany(args: {
      where: { gymId: string; id: { in: string[] } };
      select: { id: true; variants: true; stock: true };
    }): Promise<Array<{ id: string; variants: Prisma.JsonValue; stock: number | null }>>;
    update(args: {
      where: { id: string };
      data: { variants?: Prisma.InputJsonValue; stock?: { increment: number } };
    }): Promise<unknown>;
  };
  productStock: {
    findFirst(args: {
      where: { gymId: string; productId: string; locationId: string };
      select: { stock: true; variants?: true };
    }): Promise<{ stock: number | null; variants?: Prisma.JsonValue } | null>;
    updateMany(args: {
      where: { gymId: string; productId: string; locationId: string; stock: { gte: number } };
      data: { stock: { decrement: number } };
    }): Promise<{ count: number }>;
    upsert(args: {
      where: { productId_locationId: { productId: string; locationId: string } };
      create: {
        gymId: string;
        productId: string;
        locationId: string;
        stock?: number | null;
        variants?: Prisma.InputJsonValue;
      };
      update: { stock?: { increment: number }; variants?: Prisma.InputJsonValue };
    }): Promise<unknown>;
  };
  stockMovement: {
    createMany(args: { data: Prisma.StockMovementCreateManyInput[] }): Promise<unknown>;
  };
}

/**
 * The branch whose shelves an order's units move on and off: the branch the order
 * names, or the gym's DEFAULT branch when it names none.
 *
 * `Order.locationId` is real evidence for the two paths that matter — the till
 * stamps its "Selling at" and an online PICKUP stamps the collection branch — so
 * for those this is a fact read off the row, not an attribution decision.
 *
 * The fallback covers the one order shape that genuinely has no branch: an online
 * DELIVERY, which records an address instead. Something physically left a shelf, so
 * the only question is which shelf to name, and the gym's default branch is the same
 * stated approximation `CheckInService.resolveArrivalBranch` and
 * `MembersService.resolveHomeBranch` already make. It is also the branch the Stage 4
 * migration put every pre-split unit on, so it is the one branch a gym is certain to
 * be able to fulfil from. Stage 5 gives the delivery order a real fulfilment branch;
 * until then this is an approximation stated out loud rather than a silent one.
 *
 * `null` — an order naming no branch at a gym with no default branch — means the
 * movement has no place, and the caller then moves NOTHING. Inventing a branch is
 * refused; so is the alternative of drawing the roll-up down with no branch row
 * behind it, because that is precisely the drift `Product.stock` is documented to be
 * free of. Every gym is given a default branch by the Stage 0 migration and by the
 * seed, so this is a degenerate configuration rather than a routine one.
 */
async function resolveSellingBranch(
  tx: OrderStockClient,
  gymId: string,
  orderId: string,
): Promise<string | null> {
  const order = await tx.order.findFirst({
    where: { id: orderId, gymId },
    select: { locationId: true },
  });
  if (order?.locationId) {
    return order.locationId;
  }
  const fallback = await tx.location.findFirst({
    where: { gymId, isDefault: true },
    select: { id: true },
  });
  return fallback?.id ?? null;
}

/**
 * Read a `ProductStock.variants` blob as the flat array of counts it is.
 *
 * Defensive rather than validating: it is a JSON column with no constraint, and a
 * malformed value must not abort a checkout. Anything that is not a positive
 * integer reads as `0` — the same thing an unrecorded position reads as.
 */
export function parseBranchCounts(value: Prisma.JsonValue | undefined): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) =>
    typeof entry === 'number' && Number.isInteger(entry) && entry > 0 ? entry : 0,
  );
}

/** Grow a counts array so `index` is addressable, padding the gap with zeros. */
function padTo(counts: number[], index: number): number[] {
  const next = [...counts];
  while (next.length <= index) {
    next.push(0);
  }
  return next;
}

/**
 * Draw units off one branch's BASE position and report what actually left.
 *
 * The claim is bounded (`stock: { gte: take }`) and the arithmetic is the
 * database's, so two tills selling the last unit cannot both be told they got it.
 * `count === 0` is the lost race, not an error: the figure this transaction read
 * has moved, so it re-reads and claims against the fresh one.
 *
 * `taken` is clamped at what the branch actually holds. The till deliberately does
 * not refuse a sale — the goods are already in the customer's hands — so an
 * oversold position lands at zero and the ledger records the units that existed.
 * `null` means the branch does not count this position at all (no row, or a null
 * count): there is nothing to draw down and nothing to record.
 *
 * `resultingStock` is READ BACK rather than computed. The claim advanced the column
 * from whatever it actually held, which is not necessarily what was read a moment
 * ago; the claim holds the row lock until commit, so the value that comes back is
 * final. Same discipline `OrdersService.refund` applies to `Payment.refundedAmount`.
 */
async function claimBranchBase(
  tx: OrderStockClient,
  key: { gymId: string; productId: string; locationId: string },
  want: number,
): Promise<{ taken: number; resultingStock: number } | null> {
  for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt += 1) {
    const row = await tx.productStock.findFirst({ where: key, select: { stock: true } });
    if (!row || row.stock === null) {
      return null;
    }
    const take = Math.min(want, row.stock);
    if (take <= 0) {
      return { taken: 0, resultingStock: row.stock };
    }
    const claimed = await tx.productStock.updateMany({
      where: { ...key, stock: { gte: take } },
      data: { stock: { decrement: take } },
    });
    if (claimed.count > 0) {
      const after = await tx.productStock.findFirst({ where: key, select: { stock: true } });
      return { taken: take, resultingStock: after?.stock ?? 0 };
    }
  }
  return null;
}

/**
 * Apply an order's stock movements — `SALE` draws the sold units down,
 * `REFUND_RESTOCK` returns them — inside the caller's transaction, against the
 * branch the order was sold at.
 *
 * Lines that resolve to no stock position are skipped rather than guessed at: a
 * promo/adjustment line, or a membership sold at the desk, carries no
 * `productVariantId` and has nothing to move.
 *
 * A position only moves once the gym has actually started tracking it. An untracked
 * product is sold without a count and stays that way — inventing a zero for a sale
 * would report it out of stock the moment it sells, and crediting units back on a
 * refund would invent stock the gym never claimed.
 *
 * ## A sale at a branch that has no stock row
 *
 * It goes through, draws nothing down, and records nothing. A missing row is not an
 * error and not a counted zero — the model documents it as "nothing has been
 * recorded here", and it reads as `0` on hand, so this is the same clamp an
 * oversold counted position already got.
 *
 * The two alternatives were both weighed and both cost more. **Refusing the sale**
 * would break the till at every non-default branch on the morning Stage 4 deploys,
 * because the migration deliberately leaves those branches empty until an operator
 * has walked them — a new outage manufactured out of an admitted gap in the data,
 * and against the standing rule that the goods are already in the customer's hands.
 * **Letting the count go negative** keeps the arithmetic honest and even flags the
 * outstanding stock-take, but negatives are foreign to every reader downstream:
 * `resolveStockLevel` collapses them into "out", the inventory valuation turns them
 * into negative money, and `POST /admin/products/:id/stock` already refuses to write
 * one by hand. One write path minting values another refuses is the kind of
 * split-brain that outlives whoever chose it.
 *
 * What that costs, stated rather than hidden: units can leave a branch that has no
 * row and leave no trace in the ledger, so a stock-take there starts from the shelf
 * rather than from the history. That is unchanged from today's behaviour for an
 * oversold position, and it ends the moment the branch is counted once.
 *
 * A refund is the mirror and takes the one asymmetry: it UPSERTS. Units coming back
 * are physically on that branch's shelf whether or not anyone had counted it, so a
 * missing row is created with them on it.
 */
export async function applyOrderStockMovements(
  tx: OrderStockClient,
  params: {
    gymId: string;
    orderId: string;
    reason: OrderStockReason;
    items: OrderStockLine[];
  },
): Promise<void> {
  const { gymId, orderId, reason, items } = params;
  const sign = reason === StockMovementReason.SALE ? -1 : 1;

  // Sum the units per (productId → position), where `null` is the base position.
  const byProduct = new Map<string, Map<number | null, number>>();
  for (const item of items) {
    if (!item.productVariantId) {
      continue;
    }
    const parsed = decodeVariantRef(item.productVariantId);
    if (!parsed) {
      continue;
    }
    const byPosition = byProduct.get(parsed.productId) ?? new Map<number | null, number>();
    const at = parsed.variantIndex;
    byPosition.set(at, (byPosition.get(at) ?? 0) + item.qty);
    byProduct.set(parsed.productId, byPosition);
  }
  if (byProduct.size === 0) {
    return;
  }

  const locationId = await resolveSellingBranch(tx, gymId, orderId);
  if (locationId === null) {
    // No branch, so no shelf. Moving the roll-up alone would leave it disagreeing
    // with the sum of the branch rows for good — see `resolveSellingBranch`.
    return;
  }

  const products = await tx.product.findMany({
    where: { gymId, id: { in: [...byProduct.keys()] } },
    select: { id: true, variants: true, stock: true },
  });

  for (const product of products) {
    const moved = byProduct.get(product.id);
    if (!moved) {
      continue;
    }
    const parsed = productVariantsSchema.safeParse(product.variants ?? []);
    if (!parsed.success) {
      continue;
    }
    const key = { gymId, productId: product.id, locationId };
    const branchRow = await tx.productStock.findFirst({
      where: key,
      select: { stock: true, variants: true },
    });

    const variants = parsed.data;
    const movements: Prisma.StockMovementCreateManyInput[] = [];
    // The gym-wide roll-up's delta for the base position, accumulated from what the
    // branch claim actually landed — never from what this process intended.
    let baseDelta = 0;
    let branchCounts = parseBranchCounts(branchRow?.variants);
    let variantsChanged = false;

    for (const [position, qty] of moved) {
      if (position === null) {
        // Untracked product — nothing to move, nothing to record.
        if (product.stock === null) {
          continue;
        }
        if (sign < 0) {
          const claim = await claimBranchBase(tx, key, qty);
          // `null` is a branch that does not count this position; `taken === 0` is a
          // shelf already at zero. Both move nothing and explain nothing.
          if (!claim || claim.taken === 0) {
            continue;
          }
          baseDelta -= claim.taken;
          movements.push({
            gymId,
            productId: product.id,
            locationId,
            variantIndex: null,
            variantLabel: '',
            delta: -claim.taken,
            resultingStock: claim.resultingStock,
            reason,
            orderId,
          });
          continue;
        }
        // A restock puts units back on this branch's shelf whether or not it had one
        // recorded — but not onto a position it has explicitly stopped counting
        // (`stock: null`), which contributes nothing to the roll-up and has to keep
        // contributing nothing.
        if (branchRow && branchRow.stock === null) {
          continue;
        }
        await tx.productStock.upsert({
          where: { productId_locationId: { productId: product.id, locationId } },
          create: { gymId, productId: product.id, locationId, stock: qty, variants: [] },
          update: { stock: { increment: qty } },
        });
        baseDelta += qty;
        movements.push({
          gymId,
          productId: product.id,
          locationId,
          variantIndex: null,
          variantLabel: '',
          delta: qty,
          resultingStock: (branchRow?.stock ?? 0) + qty,
          reason,
          orderId,
        });
        continue;
      }

      const variant = variants[position];
      if (!variant) {
        continue;
      }
      // A branch's counts are positionally aligned with the product's variants; a
      // slot past the end of the branch array is a variant that branch has never
      // received, which reads as zero.
      const held = branchCounts[position] ?? 0;
      const next = Math.max(0, held + sign * qty);
      if (next === held) {
        continue;
      }
      branchCounts = padTo(branchCounts, position);
      branchCounts[position] = next;
      variantsChanged = true;
      // The roll-up moves by the delta the BRANCH moved by, not by the line's
      // quantity — an oversold position clamped at the shelf has to clamp the total
      // by the same amount or the two stop reconciling.
      variants[position] = { ...variant, stock: Math.max(0, variant.stock + (next - held)) };
      movements.push({
        gymId,
        productId: product.id,
        locationId,
        variantIndex: position,
        variantLabel: variant.name,
        delta: next - held,
        resultingStock: next,
        reason,
        orderId,
      });
    }

    if (variantsChanged) {
      await tx.productStock.upsert({
        where: { productId_locationId: { productId: product.id, locationId } },
        create: {
          gymId,
          productId: product.id,
          locationId,
          stock: null,
          variants: branchCounts,
        },
        update: { variants: branchCounts },
      });
    }
    if (variantsChanged || baseDelta !== 0) {
      await tx.product.update({
        where: { id: product.id },
        data: {
          ...(variantsChanged ? { variants } : {}),
          ...(baseDelta !== 0 ? { stock: { increment: baseDelta } } : {}),
        },
      });
    }
    if (movements.length > 0) {
      await tx.stockMovement.createMany({ data: movements });
    }
  }
}
