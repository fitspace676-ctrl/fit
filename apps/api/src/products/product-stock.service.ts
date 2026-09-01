import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockMovementReason } from '@fit/db';
import {
  Permission,
  productVariantsSchema,
  type AdjustStockData,
  type AdjustStockResponse,
  type ListStockMovementsQuery,
  type ListStockMovementsResponse,
  type ProductVariants,
  type StockMovementRow,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { assertPermission } from '../common/rbac/assert-permission';

/**
 * A product's on-hand stock and the ledger behind it (`/admin/products/:id/stock`).
 *
 * Kept apart from {@link AdminProductsService} — which owns the *editable shape*
 * of a product — because stock is a different kind of write. Editing a product is
 * a whole-record replace: read it, change some fields, send it all back. Applying
 * that pattern to stock loses updates the moment two people work at once, since
 * each sends the count it read before the other's change landed. Every write here
 * is instead a read-modify-write inside one transaction against the row itself,
 * and each one records why it happened.
 *
 * Runs on the **tenant-scoped** Prisma client, so a cross-tenant product id
 * simply does not match and reads as a `404`.
 *
 * A product tracks stock one of two ways and the two never mix: per variant when
 * it has variants, or a single base count when it has none. `variantIndex`
 * addresses the position — a slot in the variant array, or `null` for the base.
 */
@Injectable()
export class ProductStockService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * Apply one movement to one stock position and record it, atomically.
   *
   * The transaction re-reads the product, so the count a movement lands on is the
   * one in the database at that instant, not the one the console rendered some
   * seconds ago. That distinction is the whole point of the endpoint: `delta`
   * ("three more arrived") composes correctly under concurrency, and `setTo`
   * ("I counted eleven") is turned into a delta *here*, against the fresh value,
   * rather than trusting a client to have subtracted from a stale one.
   *
   * A movement that would drive the count below zero is refused rather than
   * clamped — silently absorbing it would make the ledger disagree with the
   * count, and the honest answer is that someone's assumption was wrong.
   */
  async adjust(productId: string, input: AdjustStockData): Promise<AdjustStockResponse> {
    // A recount is a stocktake, its own capability on top of `inventory:adjust`.
    if (input.reason === 'RECOUNT') {
      assertPermission(this.tenant.role, Permission.StocktakePerform);
    }
    const actorId = this.tenant.userId ?? null;

    return this.prisma.client.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: productId },
        select: { id: true, gymId: true, variants: true, stock: true },
      });
      if (!product) {
        throw new NotFoundException({
          code: 'PRODUCT_NOT_FOUND',
          message: 'Product not found',
        });
      }

      const variants = this.parseVariants(product.variants);
      const position = this.resolvePosition(variants, product.stock, input.variantIndex);

      const delta = input.delta ?? input.setTo! - position.current;
      if (delta === 0) {
        throw new BadRequestException({
          code: 'STOCK_UNCHANGED',
          message: 'That count is already the on-hand figure — nothing to record.',
        });
      }

      const resultingStock = position.current + delta;
      if (resultingStock < 0) {
        throw new BadRequestException({
          code: 'STOCK_NEGATIVE',
          message: `Only ${position.current} on hand — that change would leave ${resultingStock}.`,
        });
      }

      if (input.variantIndex === null) {
        await tx.product.update({
          where: { id: product.id },
          data: { stock: resultingStock },
        });
      } else {
        const next = variants.map((variant, index) =>
          index === input.variantIndex ? { ...variant, stock: resultingStock } : variant,
        );
        await tx.product.update({
          where: { id: product.id },
          data: { variants: next as unknown as Prisma.InputJsonValue },
        });
      }

      const movement = await tx.stockMovement.create({
        data: {
          gymId: product.gymId,
          productId: product.id,
          variantIndex: input.variantIndex,
          variantLabel: position.label,
          delta,
          resultingStock,
          reason: input.reason as StockMovementReason,
          note: input.note,
          actorId,
        },
        select: MOVEMENT_SELECT,
      });

      // Resolve the actor's own name so the echoed movement reads the same as it
      // will in the ledger a moment later — returning `null` for a person we just
      // identified would make the response quietly disagree with the history.
      const names = await this.resolveActorNames([movement.actorId], tx);

      return {
        variantIndex: input.variantIndex,
        stock: resultingStock,
        movement: this.toMovementRow(movement, names.get(movement.actorId ?? '') ?? null),
      };
    });
  }

  /**
   * One product's ledger, newest first. Paginated because a busy product's
   * history grows without bound, and the view only ever wants the recent end.
   *
   * Actor names are resolved in a second query rather than a join: movements
   * carry a bare `actorId` (staff rows can be removed, and a movement must
   * outlive the person who made it), so an unresolvable id degrades to `null`
   * — "someone, no longer on staff" — instead of failing the page.
   */
  async listMovements(
    productId: string,
    query: ListStockMovementsQuery,
  ): Promise<ListStockMovementsResponse> {
    const product = await this.prisma.client.product.findFirst({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: 'Product not found' });
    }

    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await Promise.all([
      this.prisma.client.stockMovement.findMany({
        where: { productId },
        select: MOVEMENT_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.prisma.client.stockMovement.count({ where: { productId } }),
    ]);

    const names = await this.resolveActorNames(rows.map((row) => row.actorId));

    return {
      data: rows.map((row) => this.toMovementRow(row, names.get(row.actorId ?? '') ?? null)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /**
   * Resolve the addressed stock position to its current count and a label for the
   * ledger. A variant index outside the array is a `400`, not a silent no-op: it
   * means the console is working from a variant list that has since changed, and
   * writing the count onto whatever now sits at that slot would corrupt a
   * different variant's stock.
   *
   * The base position of a product that has variants is refused for the same
   * reason — the two tracking modes are alternatives, and letting a base count
   * exist alongside variant counts creates a second, contradictory answer to
   * "how many do I have?".
   */
  private resolvePosition(
    variants: ProductVariants,
    baseStock: number | null,
    variantIndex: number | null,
  ): { current: number; label: string } {
    if (variantIndex === null) {
      if (variants.length > 0) {
        throw new BadRequestException({
          code: 'STOCK_POSITION_INVALID',
          message: 'This product counts stock per variant — adjust one of its variants instead.',
        });
      }
      // A first movement against an untracked product starts it at zero, which is
      // how tracking gets switched on: receive a delivery and it begins counting.
      return { current: baseStock ?? 0, label: '' };
    }

    const variant = variants[variantIndex];
    if (!variant) {
      throw new BadRequestException({
        code: 'STOCK_POSITION_INVALID',
        message: 'That variant no longer exists — reload the product and try again.',
      });
    }
    return { current: variant.stock, label: variant.name };
  }

  /**
   * Look up the display names behind a page's actor ids, skipping the nulls.
   * `client` lets a caller inside a transaction reuse it, so the lookup joins the
   * same snapshot rather than opening a second connection mid-transaction.
   */
  private async resolveActorNames(
    actorIds: Array<string | null>,
    client: ActorNameClient = this.prisma.client,
  ): Promise<Map<string, string>> {
    const ids = [...new Set(actorIds.filter((id): id is string => id !== null))];
    if (ids.length === 0) {
      return new Map();
    }
    const users = await client.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, email: true },
    });
    return new Map(users.map((user) => [user.id, user.name || user.email]));
  }

  /** Normalise a stored `variants` JSON to a validated list (see AdminProductsService). */
  private parseVariants(value: Prisma.JsonValue): ProductVariants {
    const parsed = productVariantsSchema.safeParse(value ?? []);
    return parsed.success ? parsed.data : [];
  }

  /** Project a queried movement row to the wire {@link StockMovementRow}. */
  private toMovementRow(row: MovementRecord, actorName: string | null): StockMovementRow {
    return {
      id: row.id,
      variantIndex: row.variantIndex,
      variantLabel: row.variantLabel,
      delta: row.delta,
      resultingStock: row.resultingStock,
      reason: row.reason,
      note: row.note,
      actorName,
      orderId: row.orderId,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

/**
 * The slice of a Prisma client the actor-name lookup needs. Narrow on purpose, so
 * either the request client or a transaction client satisfies it.
 */
interface ActorNameClient {
  user: {
    findMany(args: {
      where: { id: { in: string[] } };
      select: { id: true; name: true; email: true };
    }): Promise<Array<{ id: string; name: string | null; email: string }>>;
  };
}

/** The columns the ledger queries project. */
const MOVEMENT_SELECT = {
  id: true,
  variantIndex: true,
  variantLabel: true,
  delta: true,
  resultingStock: true,
  reason: true,
  note: true,
  actorId: true,
  orderId: true,
  createdAt: true,
} satisfies Prisma.StockMovementSelect;

type MovementRecord = Prisma.StockMovementGetPayload<{ select: typeof MOVEMENT_SELECT }>;
