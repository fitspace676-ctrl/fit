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
 * Stock lives per-variant inside the product's `variants` JSON, so each affected
 * product is read once, every sold position on it adjusted, and the array written
 * back in a single update.
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
 * The slice of a transaction client this needs. Narrow on purpose: the base
 * `Prisma.TransactionClient` is not assignable from the tenant-**extended** client
 * (their default args differ), so a helper both may pass has to be typed by the
 * handful of calls it actually makes rather than by either client's whole surface.
 */
export interface OrderStockClient {
  product: {
    findMany(args: {
      where: { gymId: string; id: { in: string[] } };
      select: { id: true; variants: true; stock: true };
    }): Promise<Array<{ id: string; variants: Prisma.JsonValue; stock: number | null }>>;
    update(args: {
      where: { id: string };
      data: { variants?: Prisma.InputJsonValue; stock?: number | null };
    }): Promise<unknown>;
  };
  stockMovement: {
    createMany(args: { data: Prisma.StockMovementCreateManyInput[] }): Promise<unknown>;
  };
}

/**
 * Apply an order's stock movements — `SALE` draws the sold units down,
 * `REFUND_RESTOCK` returns them — inside the caller's transaction.
 *
 * Lines that resolve to no stock position are skipped rather than guessed at: a
 * promo/adjustment line, or a membership sold at the desk, carries no
 * `productVariantId` and has nothing to move.
 *
 * A base (no-variant) position only moves once the gym has actually started
 * tracking it. An untracked product is sold without a count and stays that way —
 * inventing a zero for a sale would report it out of stock the moment it sells,
 * and crediting units back on a refund would invent stock the gym never claimed.
 *
 * A draw-down is clamped at zero. On the online checkout that clamp is pure guard
 * (the quantities were stock-checked first), but the till deliberately does not
 * refuse a sale — the goods are already in the customer's hands — so an oversold
 * position lands at zero and the ledger records the units that actually existed.
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
    const variants = parsed.data;
    const movements: Prisma.StockMovementCreateManyInput[] = [];
    let variantsChanged = false;
    let baseStock = product.stock;

    for (const [position, qty] of moved) {
      if (position === null) {
        // Untracked base position — nothing to move, nothing to record.
        if (baseStock === null) {
          continue;
        }
        const next = Math.max(0, baseStock + sign * qty);
        if (next === baseStock) {
          continue;
        }
        movements.push({
          gymId,
          productId: product.id,
          variantIndex: null,
          variantLabel: '',
          delta: next - baseStock,
          resultingStock: next,
          reason,
          orderId,
        });
        baseStock = next;
        continue;
      }

      const variant = variants[position];
      if (!variant) {
        continue;
      }
      const next = Math.max(0, variant.stock + sign * qty);
      if (next === variant.stock) {
        continue;
      }
      movements.push({
        gymId,
        productId: product.id,
        variantIndex: position,
        variantLabel: variant.name,
        delta: next - variant.stock,
        resultingStock: next,
        reason,
        orderId,
      });
      variants[position] = { ...variant, stock: next };
      variantsChanged = true;
    }

    if (variantsChanged || baseStock !== product.stock) {
      await tx.product.update({
        where: { id: product.id },
        data: {
          ...(variantsChanged ? { variants } : {}),
          ...(baseStock !== product.stock ? { stock: baseStock } : {}),
        },
      });
    }
    if (movements.length > 0) {
      await tx.stockMovement.createMany({ data: movements });
    }
  }
}
