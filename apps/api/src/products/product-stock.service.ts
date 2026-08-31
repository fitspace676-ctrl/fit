import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockMovementReason } from '@fit/db';
import {
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
import { atLocation } from '../common/location-filter.util';
import { parseBranchCounts } from './order-stock';

/**
 * A product's on-hand stock at one branch, and the ledger behind it
 * (`/admin/products/:id/stock`).
 *
 * Kept apart from {@link AdminProductsService} — which owns the *editable shape*
 * of a product — because stock is a different kind of write. Editing a product is
 * a whole-record replace: read it, change some fields, send it all back. Applying
 * that pattern to stock loses updates the moment two people work at once, since
 * each sends the count it read before the other's change landed. Every write here
 * is instead a bounded claim inside one transaction against the row itself, and
 * each one records why it happened.
 *
 * Runs on the **tenant-scoped** Prisma client, so a cross-tenant product id
 * simply does not match and reads as a `404`.
 *
 * A product tracks stock one of two ways and the two never mix: per variant when
 * it has variants, or a single base count when it has none. `variantIndex`
 * addresses the position — a slot in the variant array, or `null` for the base.
 *
 * **Since Stage 4 of multi-branch a position also names a BRANCH.** The count this
 * endpoint changes is the one on `ProductStock`, one row per (product, branch);
 * `Product.stock` and `Product.variants[].stock` are the gym-wide roll-up, moved by
 * the same signed delta in the same transaction so the two can never disagree. The
 * branch is required on the wire — see `adjustStockSchema` for why this is the one
 * place multi-branch refuses rather than defaulting.
 */
@Injectable()
export class ProductStockService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * Apply one movement to one stock position at one branch and record it,
   * atomically.
   *
   * The transaction re-reads the branch's row, so the count a movement lands on is
   * the one in the database at that instant, not the one the console rendered some
   * seconds ago. That distinction is the whole point of the endpoint: `delta`
   * ("three more arrived") composes correctly under concurrency, and `setTo`
   * ("I counted eleven") is turned into a delta *here*, against the fresh value,
   * rather than trusting a client to have subtracted from a stale one.
   *
   * The delta is then **claimed**, not written back (`docs/adr/atomic-counters.md`):
   * a draw-down is a bounded `decrement` whose `WHERE` carries the "enough on hand"
   * predicate, so the check and the write cannot be separated by another writer.
   * A claim that does not land is reported as the shortfall it is, not retried into
   * a negative. One consequence worth knowing at the call site: under a genuine
   * race a `setTo` lands its DELTA rather than its absolute figure, so the shelf may
   * not read exactly the number that was typed. The response and the ledger both
   * carry the figure that actually resulted, so the count and its history still
   * agree — which is the invariant that matters. Recounting again settles it.
   *
   * A movement that would drive the count below zero is refused rather than
   * clamped — silently absorbing it would make the ledger disagree with the count,
   * and the honest answer is that someone's assumption was wrong.
   */
  async adjust(productId: string, input: AdjustStockData): Promise<AdjustStockResponse> {
    const actorId = this.tenant.userId ?? null;
    const locationId = await this.requireLocation(input.locationId);

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
      const branch = await tx.productStock.findFirst({
        where: { productId: product.id, locationId },
        select: { stock: true, variants: true },
      });
      const branchCounts = parseBranchCounts(branch?.variants);
      const position = this.resolvePosition(
        variants,
        branchCounts,
        branch?.stock ?? null,
        input.variantIndex,
      );

      const delta = input.delta ?? input.setTo! - position.current;
      if (delta === 0) {
        throw new BadRequestException({
          code: 'STOCK_UNCHANGED',
          message: 'That count is already the on-hand figure — nothing to record.',
        });
      }
      if (position.current + delta < 0) {
        throw new BadRequestException({
          code: 'STOCK_NEGATIVE',
          message: `Only ${position.current} on hand — that change would leave ${position.current + delta}.`,
        });
      }

      const resultingStock =
        input.variantIndex === null
          ? await this.applyBaseDelta(tx, product.gymId, product.id, locationId, delta)
          : await this.applyVariantDelta(
              tx,
              product.gymId,
              product.id,
              locationId,
              input.variantIndex,
              branchCounts,
              variants,
              delta,
            );

      const movement = await tx.stockMovement.create({
        data: {
          gymId: product.gymId,
          productId: product.id,
          locationId,
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

      // The roll-up is read back rather than recomputed here: it was moved by an
      // `increment` of this same delta, so what comes back is the figure the branch
      // rows sum to, and the console can refresh both cells from one reply.
      const rolled = await tx.product.findFirst({
        where: { id: product.id },
        select: { stock: true, variants: true },
      });
      const rolledVariants = this.parseVariants(rolled?.variants ?? []);

      return {
        locationId,
        variantIndex: input.variantIndex,
        stock: resultingStock,
        totalStock:
          input.variantIndex === null
            ? (rolled?.stock ?? 0)
            : (rolledVariants[input.variantIndex]?.stock ?? 0),
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
   *
   * `locationId` narrows to one branch's shelf. Omitted is every branch **and**
   * the movements that name none — the rows written before Stage 4, plus any whose
   * branch has since been retired. That is deliberate: a branch filter is the one
   * view those rows cannot honestly appear in, and all-branches is the only view
   * that keeps the pre-Stage-4 history reachable at all.
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

    const where: Prisma.StockMovementWhereInput = {
      productId,
      ...atLocation(query.locationId),
    };
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await Promise.all([
      this.prisma.client.stockMovement.findMany({
        where,
        select: MOVEMENT_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.prisma.client.stockMovement.count({ where }),
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
   * Assert a branch id names a live branch of the caller's gym, and hand it back.
   *
   * The lookup runs on the scoped client, so another gym's branch simply never
   * matches and is refused as unknown rather than leaking its existence — the same
   * shape `CheckInService.resolveArrivalBranch` and `AdminScheduleService` use.
   * Unlike those, there is no fallback arm: an adjustment that does not name a real
   * branch is refused outright (see `adjustStockSchema`).
   */
  private async requireLocation(locationId: string): Promise<string> {
    const location = await this.prisma.client.location.findFirst({
      where: { id: locationId },
      select: { id: true },
    });
    if (!location) {
      throw new NotFoundException({ code: 'LOCATION_NOT_FOUND', message: 'Location not found' });
    }
    return location.id;
  }

  /**
   * Move the base position at one branch by `delta`, and the gym-wide roll-up by
   * the same delta, returning the branch's resulting count.
   *
   * A draw-down is a bounded claim: the `stock: { gte: … }` predicate and the
   * `decrement` are one statement, so two people writing off the last unit cannot
   * both be told they did. `count === 0` is the lost race, and here it means the
   * shelf no longer holds what the caller counted — the same `STOCK_NEGATIVE` the
   * pre-flight check raises, arrived at a moment later.
   *
   * A positive delta upserts, because receiving a delivery at a branch that has
   * never been counted is exactly how that branch starts counting. The roll-up's
   * `increment` is deliberately unbounded: it must move by whatever the branch
   * moved by, and a predicate of its own could refuse and leave the two disagreeing
   * — the one outcome `Product.stock` is documented never to have.
   */
  private async applyBaseDelta(
    tx: StockWritingClient,
    gymId: string,
    productId: string,
    locationId: string,
    delta: number,
  ): Promise<number> {
    if (delta < 0) {
      const claimed = await tx.productStock.updateMany({
        where: { productId, locationId, stock: { gte: -delta } },
        data: { stock: { decrement: -delta } },
      });
      if (claimed.count === 0) {
        throw new BadRequestException({
          code: 'STOCK_NEGATIVE',
          message: 'That change would leave a negative count — recount and try again.',
        });
      }
    } else {
      await tx.productStock.upsert({
        where: { productId_locationId: { productId, locationId } },
        create: { gymId, productId, locationId, stock: delta, variants: [] },
        update: { stock: { increment: delta } },
      });
    }

    await tx.product.update({ where: { id: productId }, data: { stock: { increment: delta } } });

    // Read the settled figure rather than compute it: the claim advanced the column
    // from whatever it actually held. The claim holds the row lock until commit, so
    // what comes back here is final.
    const after = await tx.productStock.findFirst({
      where: { productId, locationId },
      select: { stock: true },
    });
    return after?.stock ?? 0;
  }

  /**
   * Move one variant slot at one branch by `delta`, and the gym-wide roll-up by the
   * same delta, returning the branch's resulting count.
   *
   * Both sides are a read-modify-write of a JSON array, which
   * `docs/adr/atomic-counters.md` names as the one counter shape neither Postgres
   * nor the checker can see. It is not made worse here — the pre-Stage-4 code had
   * the same hole on `Product.variants` — and the fix is the row-per-position table
   * the schema keeps the door open for, not a lock held across a console request.
   */
  private async applyVariantDelta(
    tx: StockWritingClient,
    gymId: string,
    productId: string,
    locationId: string,
    variantIndex: number,
    branchCounts: number[],
    variants: ProductVariants,
    delta: number,
  ): Promise<number> {
    const nextBranch = [...branchCounts];
    while (nextBranch.length <= variantIndex) {
      nextBranch.push(0);
    }
    const resulting = (nextBranch[variantIndex] ?? 0) + delta;
    nextBranch[variantIndex] = resulting;

    await tx.productStock.upsert({
      where: { productId_locationId: { productId, locationId } },
      create: {
        gymId,
        productId,
        locationId,
        stock: null,
        variants: nextBranch,
      },
      update: { variants: nextBranch },
    });

    const rolled = variants.map((variant, index) =>
      index === variantIndex ? { ...variant, stock: Math.max(0, variant.stock + delta) } : variant,
    );
    await tx.product.update({
      where: { id: productId },
      data: { variants: rolled },
    });

    return resulting;
  }

  /**
   * Resolve the addressed stock position to this BRANCH's current count and a
   * label for the ledger. A variant index outside the product's variant array is a
   * `400`, not a silent no-op: it means the console is working from a variant list
   * that has since changed, and writing the count onto whatever now sits at that
   * slot would corrupt a different variant's stock.
   *
   * The base position of a product that has variants is refused for the same
   * reason — the two tracking modes are alternatives, and letting a base count
   * exist alongside variant counts creates a second, contradictory answer to
   * "how many do I have?".
   *
   * The product's `variants` supply the SHAPE (which slots exist, and what they are
   * called); the branch's counts supply the FIGURE. That split is the whole point of
   * `ProductStock.variants` holding bare integers: a name or a price is a catalogue
   * fact, identical at every branch, and duplicating it per branch would invite the
   * two to diverge.
   */
  private resolvePosition(
    variants: ProductVariants,
    branchCounts: number[],
    branchBaseStock: number | null,
    variantIndex: number | null,
  ): { current: number; label: string } {
    if (variantIndex === null) {
      if (variants.length > 0) {
        throw new BadRequestException({
          code: 'STOCK_POSITION_INVALID',
          message: 'This product counts stock per variant — adjust one of its variants instead.',
        });
      }
      // A first movement against a branch that has never counted this position
      // starts it at zero, which is how tracking gets switched on there: receive a
      // delivery and the branch begins counting.
      return { current: branchBaseStock ?? 0, label: '' };
    }

    const variant = variants[variantIndex];
    if (!variant) {
      throw new BadRequestException({
        code: 'STOCK_POSITION_INVALID',
        message: 'That variant no longer exists — reload the product and try again.',
      });
    }
    // A slot past the end of the branch's array is a variant that branch has never
    // received — zero on hand, not an error.
    return { current: branchCounts[variantIndex] ?? 0, label: variant.name };
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
      locationName: row.location?.name ?? null,
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

/**
 * The slice of a transaction client the stock writes need. Narrow on purpose (the
 * tenant-extended client is not assignable to `Prisma.TransactionClient`), and
 * narrow enough that the two write helpers cannot quietly reach for a query they
 * were not meant to make.
 */
interface StockWritingClient {
  product: {
    update(args: {
      where: { id: string };
      data: { stock?: { increment: number }; variants?: Prisma.InputJsonValue };
    }): Promise<unknown>;
  };
  productStock: {
    findFirst(args: {
      where: { productId: string; locationId: string };
      select: { stock: true };
    }): Promise<{ stock: number | null } | null>;
    updateMany(args: {
      where: { productId: string; locationId: string; stock: { gte: number } };
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
  // The branch is the gym's own row (the relation cannot cross tenants) and the
  // ledger renders its name, so join it rather than making the console resolve ids.
  location: { select: { name: true } },
} satisfies Prisma.StockMovementSelect;

type MovementRecord = Prisma.StockMovementGetPayload<{ select: typeof MOVEMENT_SELECT }>;
