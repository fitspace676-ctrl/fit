import { AutomationTriggerType, StockMovementReason } from '@fit/db';
import { resolveLowStockThreshold } from '@fit/types';
import type { AutomationExecutorService } from '../automation/automation-executor.service';

/**
 * The automation triggers a sale fires, shared by every path that writes one —
 * the till ({@link OrdersService.recordSale}), the online basket
 * ({@link CartService.checkout}) and the join wizard's package purchase
 * ({@link CheckoutService}).
 *
 * Everything here runs AFTER the sale's transaction has committed and is never
 * awaited by the caller: automation must not delay, fail or roll back the sale it
 * reacts to. The executor already swallows its own errors; the low-stock read is
 * caught here for the same reason.
 */

/** The reads the low-stock check makes. Narrow so both the tenant-scoped and the unscoped client fit. */
export interface OrderLowStockClient {
  stockMovement: {
    findMany(args: {
      where: { gymId: string; orderId: string; reason: typeof StockMovementReason.SALE };
      select: { productId: true; locationId: true; delta: true; resultingStock: true };
    }): Promise<
      Array<{ productId: string; locationId: string | null; delta: number; resultingStock: number }>
    >;
  };
  productStock: {
    findMany(args: {
      where: { gymId: string; productId: { in: string[] } };
      select: { productId: true; locationId: true; lowStockThreshold: true };
    }): Promise<Array<{ productId: string; locationId: string; lowStockThreshold: number | null }>>;
  };
  product: {
    findMany(args: {
      where: { gymId: string; id: { in: string[] } };
      select: { id: true; lowStockThreshold: true };
    }): Promise<Array<{ id: string; lowStockThreshold: number | null }>>;
  };
}

/**
 * Whether this order's sale took any position DOWN to (or through) its reorder
 * cushion — read from the `SALE` ledger rows the sale itself wrote, so it judges
 * exactly the shelves that moved, at the branch they moved at.
 *
 * Crossing, not "is low": a position already under its cushion before the sale
 * does not fire again on every later sale, or a busy line would mail the same
 * warning all day. The cushion is resolved by the shared three-rung chain
 * (branch → product → default) in {@link resolveLowStockThreshold}.
 */
export async function orderCrossedLowStock(
  client: OrderLowStockClient,
  gymId: string,
  orderId: string,
): Promise<boolean> {
  const moves = await client.stockMovement.findMany({
    where: { gymId, orderId, reason: StockMovementReason.SALE },
    select: { productId: true, locationId: true, delta: true, resultingStock: true },
  });
  if (moves.length === 0) return false;

  const productIds = [...new Set(moves.map((move) => move.productId))];
  const [branchRows, products] = await Promise.all([
    client.productStock.findMany({
      where: { gymId, productId: { in: productIds } },
      select: { productId: true, locationId: true, lowStockThreshold: true },
    }),
    client.product.findMany({
      where: { gymId, id: { in: productIds } },
      select: { id: true, lowStockThreshold: true },
    }),
  ]);

  return moves.some((move) => {
    const threshold = resolveLowStockThreshold({
      branchThreshold: move.locationId
        ? branchRows.find(
            (row) => row.productId === move.productId && row.locationId === move.locationId,
          )?.lowStockThreshold
        : null,
      productThreshold: products.find((row) => row.id === move.productId)?.lowStockThreshold,
    });
    const before = move.resultingStock - move.delta;
    return move.resultingStock <= threshold && before > threshold;
  });
}

/**
 * Fire a committed sale's triggers: `purchase_completed` for a PAID order that
 * has a buyer (an anonymous sale has nobody to address), and `product_stock_low`
 * when the sale pushed a position to its cushion. Fire-and-forget.
 */
export function dispatchSaleAutomation(
  automation: Pick<AutomationExecutorService, 'dispatchForGym'>,
  client: OrderLowStockClient | null,
  sale: { gymId: string; orderId: string; memberId: string | null; paid: boolean },
): void {
  const context = { entityId: sale.orderId, entityType: 'order' as const };
  if (sale.paid && sale.memberId) {
    void automation.dispatchForGym(sale.gymId, AutomationTriggerType.purchase_completed, context);
  }
  if (client) {
    void orderCrossedLowStock(client, sale.gymId, sale.orderId)
      .then((crossed) =>
        crossed
          ? automation.dispatchForGym(sale.gymId, AutomationTriggerType.product_stock_low, context)
          : 0,
      )
      .catch(() => undefined);
  }
}
