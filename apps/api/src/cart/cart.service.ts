import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { OrderStatus, ProductStatus, StockMovementReason, type Prisma } from '@fit/db';
import {
  decodeVariantRef,
  productVariantsSchema,
  MAX_CART_LINE_QUANTITY,
  type AddCartItemInput,
  type CartCheckoutInput,
  type CartItemDetail,
  type CartPriceChange,
  type CartView,
} from '@fit/types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { PromoRedemptionService } from '../marketing/promo-redemption.service';

/**
 * Sentinel stock for a position whose product does not count stock. Untracked is
 * not the same as zero: the gym never told us how many towels it has, so the
 * storefront must not refuse to sell one.
 */
const UNLIMITED_STOCK = Number.MAX_SAFE_INTEGER;

/** Currency assumed for an empty cart, before any line pins a real one. */
const DEFAULT_CURRENCY = 'USD';

/** The columns the cart re-prices from. A slim public projection of `Product`. */
const PRODUCT_SELECT = {
  id: true,
  name: true,
  priceAmount: true,
  currency: true,
  images: true,
  variants: true,
  stock: true,
} satisfies Prisma.ProductSelect;

type ProductRecord = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

/** A cart row with its lines, as every read/mutation loads it. */
type CartWithItems = Prisma.CartGetPayload<{ include: { items: true } }>;

/** The current, live facts about one cart line's variant. */
interface VariantInfo {
  /** Whether the product + variant still exist and are sellable. */
  exists: boolean;
  /** Current per-unit price (MINOR units). */
  unitPrice: number;
  /** On-hand units ({@link UNLIMITED_STOCK} when the position is untracked). */
  stock: number;
  productId: string;
  productName: string;
  variantName: string | null;
  imageUrl: string | null;
  currency: string;
}

/**
 * How the anon session cookie should change after a request. The controller owns
 * the cookie; the service only signals intent so the cookie logic stays at the
 * HTTP edge and the service stays transport-agnostic (and unit-testable).
 */
export interface CartSessionDirective {
  /** Set the `fit_cart_sid` cookie to this id (a freshly created anon cart). */
  assign?: string;
  /** Clear the cookie — its anon cart was merged into the signed-in user's. */
  clear?: boolean;
}

/** A cart view plus the cookie directive the controller applies. */
export interface CartResult {
  view: CartView;
  session: CartSessionDirective;
}

/** The outcome of a checkout attempt — created, or a re-confirmation needed. */
export type CheckoutOutcome =
  | { kind: 'created'; orderId: string }
  | { kind: 'price_changed'; newPrices: CartPriceChange[] }
  | { kind: 'out_of_stock'; removedItems: string[] };

/**
 * The member-facing online shop's persistent cart + checkout (T7.7).
 *
 * A cart is keyed by exactly one identity: the signed-in member's `userId`
 * (resolved from {@link TenantContext}) or an anonymous `sessionId` (the
 * `fit_cart_sid` cookie the controller carries). On the first authenticated
 * request that still carries the anon cookie, the anon cart is **merged** into
 * the user's cart and deleted, so a person ends up with one cart per gym without
 * duplicate lines.
 *
 * Prices and stock are never cached in the cart for display: every read
 * re-prices each line from the current {@link Product}, so the buyer always sees
 * live prices. The stored `unitPrice` is the buyer's last-agreed price, compared
 * only at checkout to surface a price drift (`PRICE_CHANGED`) for re-confirmation
 * before any order is created. Runs on the **base** {@link PrismaService} (not
 * the tenant-scoped client): the gym is constrained explicitly by the resolved
 * `gymId`, the same way the public product listing is, since the cart is reached
 * both signed-in and anonymously.
 */
@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly promos: PromoRedemptionService,
  ) {}

  /** The resolved tenant + (optional) user for the current request. */
  private identity(): { gymId: string; userId: string | null } {
    return { gymId: this.tenant.gymId, userId: this.tenant.userId ?? null };
  }

  /** `GET /cart` — the cart view, re-priced live; no cart is created on a read. */
  async getCart(sessionId: string | undefined): Promise<CartResult> {
    const { cart, session } = await this.resolveCart(sessionId, { create: false });
    return { view: await this.buildView(cart), session };
  }

  /**
   * `POST /cart/items` — add `qty` of a variant (or bump an existing line). The
   * variant is re-priced and stock-checked live; exceeding stock is a
   * `422 INSUFFICIENT_STOCK` and the line is left unchanged. The line's stored
   * price is refreshed to the current price (the buyer is agreeing to it now).
   */
  async addItem(sessionId: string | undefined, input: AddCartItemInput): Promise<CartResult> {
    const info = (await this.loadVariantInfo([input.variantId])).get(input.variantId);
    if (!info || !info.exists) {
      throw new NotFoundException('Unknown product variant');
    }

    const { cart, session } = await this.resolveCart(sessionId, { create: true });
    const existing = cart!.items.find((item) => item.productVariantId === input.variantId);
    const nextQty = (existing?.qty ?? 0) + input.qty;
    if (nextQty > info.stock || nextQty > MAX_CART_LINE_QUANTITY) {
      throw new UnprocessableEntityException({
        code: 'INSUFFICIENT_STOCK',
        message: 'Not enough stock for the requested quantity',
      });
    }

    await this.prisma.client.cartItem.upsert({
      where: { cartId_productVariantId: { cartId: cart!.id, productVariantId: input.variantId } },
      create: {
        cartId: cart!.id,
        productVariantId: input.variantId,
        qty: nextQty,
        unitPrice: info.unitPrice,
      },
      update: { qty: nextQty, unitPrice: info.unitPrice },
    });

    return { view: await this.buildView(await this.reload(cart!.id)), session };
  }

  /**
   * `PATCH /cart/items/:variantId` — set a line's absolute quantity. A quantity
   * beyond current stock is a `422 INSUFFICIENT_STOCK`; an unknown line is a
   * `404`. The stored price is refreshed to the current price.
   */
  async updateItem(
    sessionId: string | undefined,
    variantId: string,
    qty: number,
  ): Promise<CartResult> {
    const { cart, session } = await this.resolveCart(sessionId, { create: false });
    const existing = cart?.items.find((item) => item.productVariantId === variantId);
    if (!cart || !existing) {
      throw new NotFoundException('Cart line not found');
    }

    const info = (await this.loadVariantInfo([variantId])).get(variantId);
    if (!info || !info.exists || qty > info.stock) {
      throw new UnprocessableEntityException({
        code: 'INSUFFICIENT_STOCK',
        message: 'Not enough stock for the requested quantity',
      });
    }

    await this.prisma.client.cartItem.update({
      where: { id: existing.id },
      data: { qty, unitPrice: info.unitPrice },
    });

    return { view: await this.buildView(await this.reload(cart.id)), session };
  }

  /**
   * `DELETE /cart/items/:variantId` — drop a line. Idempotent: removing a line
   * that is already gone (or from a cart that does not exist) still returns the
   * current cart, so a double-tap never errors.
   */
  async removeItem(sessionId: string | undefined, variantId: string): Promise<CartResult> {
    const { cart, session } = await this.resolveCart(sessionId, { create: false });
    const existing = cart?.items.find((item) => item.productVariantId === variantId);
    if (cart && existing) {
      await this.prisma.client.cartItem.delete({ where: { id: existing.id } });
      return { view: await this.buildView(await this.reload(cart.id)), session };
    }
    return { view: await this.buildView(cart), session };
  }

  /**
   * `POST /cart/checkout` — re-validate the cart against live prices + stock, then
   * turn it into a `PENDING` {@link Order} and empty the cart.
   *
   * The two guards run before any order is created:
   * - **Out of stock** — any line whose product/variant vanished or can no longer
   *   supply the requested quantity is removed and the checkout rejected, so the
   *   buyer is told exactly what dropped before paying.
   * - **Price changed** — any line whose price drifted from the buyer's
   *   last-agreed price has its stored price refreshed and the checkout rejected
   *   for re-confirmation; an immediate retry then succeeds.
   *
   * A promo code is applied with the subscription flow's validation (T8.7); until
   * that service lands the discount is `0` (see {@link resolvePromoDiscount}).
   */
  async checkout(
    sessionId: string | undefined,
    input: CartCheckoutInput,
  ): Promise<CheckoutOutcome> {
    const { gymId, userId } = this.identity();
    const { cart } = await this.resolveCart(sessionId, { create: false });
    if (!cart || cart.items.length === 0) {
      throw new BadRequestException({ code: 'EMPTY_CART', message: 'The cart is empty' });
    }

    const refs = cart.items.map((item) => item.productVariantId);
    const info = await this.loadVariantInfo(refs);

    // 1) Out-of-stock: lines that vanished or can't supply the requested quantity.
    const removedItems = cart.items
      .filter((item) => {
        const current = info.get(item.productVariantId);
        return !current || !current.exists || current.stock < item.qty;
      })
      .map((item) => item.productVariantId);
    if (removedItems.length > 0) {
      await this.prisma.client.cartItem.deleteMany({
        where: { cartId: cart.id, productVariantId: { in: removedItems } },
      });
      return { kind: 'out_of_stock', removedItems };
    }

    // 2) Price drift: refresh the stored prices and ask the buyer to re-confirm.
    const newPrices: CartPriceChange[] = [];
    for (const item of cart.items) {
      const current = info.get(item.productVariantId)!;
      if (current.unitPrice !== item.unitPrice) {
        newPrices.push({ variantId: item.productVariantId, priceAmount: current.unitPrice });
      }
    }
    if (newPrices.length > 0) {
      await this.prisma.client.$transaction(
        newPrices.map((change) =>
          this.prisma.client.cartItem.update({
            where: {
              cartId_productVariantId: {
                cartId: cart.id,
                productVariantId: change.variantId,
              },
            },
            data: { unitPrice: change.priceAmount },
          }),
        ),
      );
      return { kind: 'price_changed', newPrices };
    }

    // 3) Clean — price the order, persist it, and empty the cart in one tx.
    const subtotal = cart.items.reduce((sum, item) => {
      return sum + info.get(item.productVariantId)!.unitPrice * item.qty;
    }, 0);
    const currency = info.get(cart.items[0]!.productVariantId)?.currency ?? DEFAULT_CURRENCY;

    const member = userId
      ? await this.prisma.client.gymMember.findFirst({
          where: { userId, gymId },
          select: { id: true },
        })
      : null;

    // Resolved after the member, because a one-per-customer code is decided
    // against the person buying. A shop basket holds retail products, so it is
    // checked against the `products` scope — a membership code does not apply.
    const promo = await this.promos.resolve({
      gymId,
      code: input.promoCode,
      amount: subtotal,
      scope: 'products',
      memberId: member?.id ?? null,
    });
    const discount = promo?.discount ?? 0;
    const total = subtotal - discount;

    const lines: Prisma.OrderItemCreateWithoutOrderInput[] = cart.items.map((item) => {
      const current = info.get(item.productVariantId)!;
      const label = current.variantName
        ? `${current.productName} (${current.variantName})`
        : current.productName;
      return {
        label: item.qty > 1 ? `${label} ×${item.qty}` : label,
        amount: current.unitPrice * item.qty,
        // Record the variant ref + quantity so an admin refund (T7.9) can restock the
        // exact sold positions — the inverse of the draw-down below.
        productVariantId: item.productVariantId,
        qty: item.qty,
      };
    });
    if (discount > 0) {
      lines.push({ label: `Promo ${input.promoCode}`, amount: -discount });
    }

    const orderId = await this.prisma.client.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          gymId,
          total,
          currency,
          status: OrderStatus.PENDING,
          // Persist the buyer's fulfilment choice (T7.10): a PICKUP names the branch
          // to collect from, a DELIVERY carries the destination — each cleared for the
          // other mode so the order never holds a stale opposite-mode detail.
          fulfillment: input.fulfillment,
          locationId: input.fulfillment === 'PICKUP' ? (input.locationId ?? null) : null,
          deliveryAddress:
            input.fulfillment === 'DELIVERY' ? (input.deliveryAddress ?? null) : null,
          memberId: member?.id ?? null,
          items: { create: lines },
          // Log the opening transition so the order's admin status timeline (T7.9) is
          // generated from the append-only event log, not inferred from the row.
          statusEvents: { create: { status: OrderStatus.PENDING } },
        },
        select: { id: true },
      });
      // Inventory tracking (T7.8): draw down the sold variants' on-hand stock in the
      // same transaction, so stock never moves without the order landing.
      await this.decrementStock(tx, gymId, order.id, cart.items);

      // Consume the promo in the same transaction as the order it discounted, so
      // a code can never be counted as spent against a sale that did not land —
      // nor a discounted order exist with no record of who spent the code.
      if (promo) {
        await this.promos.consume(tx, {
          ...promo,
          gymId,
          memberId: member?.id ?? null,
          orderId: order.id,
        });
      }
      // Empty the cart — its lines cascade-delete with it. The anon cookie (if any)
      // is left in place: the next add reuses it for a fresh cart.
      await tx.cart.delete({ where: { id: cart.id } });
      return order.id;
    });

    return { kind: 'created', orderId };
  }

  /**
   * Draw down on-hand stock for the sold variants, inside the checkout transaction.
   * Stock lives per-variant in the product's `variants` JSON, so each affected
   * product is read, the sold positions decremented, and the array written back.
   * Base (no-variant) lines draw down the product's own count, but only once the
   * gym has started tracking it — an untracked product is sold without a count and
   * stays that way, since inventing a zero for it would immediately report it out
   * of stock. Quantities were already stock-checked above, so the decrement is
   * clamped at `0` purely as a guard against a concurrent edit.
   *
   * Each position that actually moves also writes a `SALE` row to its ledger, in
   * this same transaction: stock never changes without the reason being recorded,
   * so the product's history explains its current count rather than showing
   * unexplained drops between manual adjustments.
   */
  private async decrementStock(
    tx: Prisma.TransactionClient,
    gymId: string,
    orderId: string,
    items: CartWithItems['items'],
  ): Promise<void> {
    // Sum sold units per (productId → position), where `null` is the base position.
    const soldByProduct = new Map<string, Map<number | null, number>>();
    for (const item of items) {
      const parsed = decodeVariantRef(item.productVariantId);
      if (!parsed) {
        continue;
      }
      const byPosition = soldByProduct.get(parsed.productId) ?? new Map<number | null, number>();
      const at = parsed.variantIndex;
      byPosition.set(at, (byPosition.get(at) ?? 0) + item.qty);
      soldByProduct.set(parsed.productId, byPosition);
    }
    if (soldByProduct.size === 0) {
      return;
    }

    const products = await tx.product.findMany({
      where: { gymId, id: { in: [...soldByProduct.keys()] } },
      select: { id: true, variants: true, stock: true },
    });

    for (const product of products) {
      const sold = soldByProduct.get(product.id);
      if (!sold) {
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

      for (const [position, qty] of sold) {
        if (position === null) {
          // Untracked base position — nothing to draw down, nothing to record.
          if (baseStock === null) {
            continue;
          }
          const next = Math.max(0, baseStock - qty);
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
            reason: StockMovementReason.SALE,
            orderId,
          });
          baseStock = next;
          continue;
        }

        const variant = variants[position];
        if (!variant) {
          continue;
        }
        const next = Math.max(0, variant.stock - qty);
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
          reason: StockMovementReason.SALE,
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

  /**
   * Resolve the caller's cart. For a signed-in user this also performs the
   * lazy anon→user merge: when the request still carries an anon `sessionId`
   * cookie whose cart exists, its lines are merged into the user's cart (summed
   * per variant, capped at stock) and the anon cart deleted — the cookie is then
   * cleared via the returned {@link CartSessionDirective}. `create` controls
   * whether an absent cart is created (writes) or left null (reads).
   */
  private async resolveCart(
    sessionId: string | undefined,
    opts: { create: boolean },
  ): Promise<{ cart: CartWithItems | null; session: CartSessionDirective }> {
    const { gymId, userId } = this.identity();
    const session: CartSessionDirective = {};

    if (userId) {
      let cart = await this.prisma.client.cart.findUnique({
        where: { gymId_userId: { gymId, userId } },
        include: { items: { orderBy: { createdAt: 'asc' } } },
      });

      if (sessionId) {
        const anon = await this.prisma.client.cart.findUnique({
          where: { gymId_sessionId: { gymId, sessionId } },
          include: { items: { orderBy: { createdAt: 'asc' } } },
        });
        if (anon) {
          cart = await this.mergeAnonIntoUser(anon, cart, gymId, userId);
          session.clear = true;
        }
      }

      if (!cart && opts.create) {
        cart = await this.prisma.client.cart.create({
          data: { gymId, userId },
          include: { items: { orderBy: { createdAt: 'asc' } } },
        });
      }
      return { cart, session };
    }

    // Anonymous — keyed by the cookie session id.
    if (!sessionId) {
      if (!opts.create) {
        return { cart: null, session };
      }
      const newId = randomUUID();
      const cart = await this.prisma.client.cart.create({
        data: { gymId, sessionId: newId },
        include: { items: { orderBy: { createdAt: 'asc' } } },
      });
      session.assign = newId;
      return { cart, session };
    }

    let cart = await this.prisma.client.cart.findUnique({
      where: { gymId_sessionId: { gymId, sessionId } },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    });
    if (!cart && opts.create) {
      cart = await this.prisma.client.cart.create({
        data: { gymId, sessionId },
        include: { items: { orderBy: { createdAt: 'asc' } } },
      });
    }
    return { cart, session };
  }

  /**
   * Merge an anon cart's lines into the user's cart (creating the user cart if
   * needed), then delete the anon cart. Duplicate variants sum their quantities,
   * capped at the variant's current stock (and the per-line ceiling), so a merge
   * never exceeds what can be bought. All within one transaction.
   */
  private async mergeAnonIntoUser(
    anon: CartWithItems,
    userCart: CartWithItems | null,
    gymId: string,
    userId: string,
  ): Promise<CartWithItems> {
    const info = await this.loadVariantInfo([
      ...new Set([
        ...anon.items.map((item) => item.productVariantId),
        ...(userCart?.items.map((item) => item.productVariantId) ?? []),
      ]),
    ]);

    return this.prisma.client.$transaction(async (tx) => {
      const targetId =
        userCart?.id ??
        (await tx.cart.create({ data: { gymId, userId }, select: { id: true } })).id;

      const byRef = new Map((userCart?.items ?? []).map((item) => [item.productVariantId, item]));
      for (const item of anon.items) {
        const current = info.get(item.productVariantId);
        const ceiling = Math.min(current?.stock ?? UNLIMITED_STOCK, MAX_CART_LINE_QUANTITY);
        const existing = byRef.get(item.productVariantId);
        if (existing) {
          const merged = Math.min(existing.qty + item.qty, ceiling);
          await tx.cartItem.update({ where: { id: existing.id }, data: { qty: merged } });
        } else {
          await tx.cartItem.create({
            data: {
              cartId: targetId,
              productVariantId: item.productVariantId,
              qty: Math.min(item.qty, ceiling),
              unitPrice: item.unitPrice,
            },
          });
        }
      }

      await tx.cart.delete({ where: { id: anon.id } });
      return tx.cart.findUniqueOrThrow({
        where: { id: targetId },
        include: { items: { orderBy: { createdAt: 'asc' } } },
      });
    });
  }

  /** Reload a cart with its lines after a mutation. */
  private reload(cartId: string): Promise<CartWithItems | null> {
    return this.prisma.client.cart.findUnique({
      where: { id: cartId },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    });
  }

  /**
   * Project a cart (or `null`) to the public {@link CartView}, re-pricing every
   * line from the current product. A line whose product/variant has vanished
   * falls back to its stored price and is flagged unavailable rather than
   * dropped, so the buyer still sees it (checkout is where it is removed).
   */
  private async buildView(cart: CartWithItems | null): Promise<CartView> {
    if (!cart || cart.items.length === 0) {
      return { items: [], subtotal: 0, discount: 0, total: 0, currency: DEFAULT_CURRENCY };
    }

    const info = await this.loadVariantInfo(cart.items.map((item) => item.productVariantId));
    const items: CartItemDetail[] = cart.items.map((item) => {
      const current = info.get(item.productVariantId);
      const unitPrice = current?.exists ? current.unitPrice : item.unitPrice;
      return {
        variantId: item.productVariantId,
        productId: current?.productId ?? decodeVariantRef(item.productVariantId)?.productId ?? '',
        productName: current?.productName ?? '',
        variantName: current?.variantName ?? null,
        imageUrl: current?.imageUrl ?? null,
        unitPrice,
        qty: item.qty,
        lineTotal: unitPrice * item.qty,
        currency: current?.currency ?? DEFAULT_CURRENCY,
        available: Boolean(current?.exists),
      };
    });

    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const currency = items.find((item) => item.available)?.currency ?? items[0]!.currency;
    return { items, subtotal, discount: 0, total: subtotal, currency };
  }

  /**
   * Batch-load the live {@link VariantInfo} for a set of variant references.
   * One query fetches every referenced active product; each ref is then resolved
   * to its variant (by array position) or the product base. An unknown ref,
   * inactive/absent product, or out-of-range variant resolves to a non-existent
   * entry (`exists: false`), which reads as unavailable and is removed at checkout.
   */
  private async loadVariantInfo(refs: string[]): Promise<Map<string, VariantInfo>> {
    const { gymId } = this.identity();
    const decoded = refs.map((ref) => ({ ref, parsed: decodeVariantRef(ref) }));
    const productIds = [
      ...new Set(
        decoded.map((entry) => entry.parsed?.productId).filter((id): id is string => Boolean(id)),
      ),
    ];

    const products =
      productIds.length === 0
        ? []
        : await this.prisma.client.product.findMany({
            where: { gymId, id: { in: productIds }, status: ProductStatus.ACTIVE },
            select: PRODUCT_SELECT,
          });
    const byId = new Map(products.map((product) => [product.id, product]));

    const out = new Map<string, VariantInfo>();
    for (const { ref, parsed } of decoded) {
      const product = parsed ? byId.get(parsed.productId) : undefined;
      if (!parsed || !product) {
        out.set(ref, this.missingInfo(parsed?.productId ?? ''));
        continue;
      }
      out.set(ref, this.resolveVariant(product, parsed.variantIndex));
    }
    return out;
  }

  /** Resolve one product + variant position to its live facts. */
  private resolveVariant(product: ProductRecord, variantIndex: number | null): VariantInfo {
    const base = {
      productId: product.id,
      productName: product.name,
      imageUrl: product.images[0] ?? null,
      currency: product.currency,
    };
    if (variantIndex === null) {
      // A product sold as-is, at the base price. Its base count is authoritative
      // once the gym starts tracking it; until then the position is unlimited so
      // an uncounted line is never blocked from selling.
      return {
        exists: true,
        unitPrice: product.priceAmount,
        stock: product.stock ?? UNLIMITED_STOCK,
        variantName: null,
        ...base,
      };
    }
    const parsed = productVariantsSchema.safeParse(product.variants ?? []);
    const variant = parsed.success ? parsed.data[variantIndex] : undefined;
    if (!variant) {
      return this.missingInfo(product.id);
    }
    return {
      exists: true,
      unitPrice: variant.priceAmount ?? product.priceAmount,
      stock: variant.stock,
      variantName: variant.name,
      ...base,
    };
  }

  /** The facts for a line whose product/variant no longer exists. */
  private missingInfo(productId: string): VariantInfo {
    return {
      exists: false,
      unitPrice: 0,
      stock: 0,
      productId,
      productName: '',
      variantName: null,
      imageUrl: null,
      currency: DEFAULT_CURRENCY,
    };
  }
}
