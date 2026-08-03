import { describe, expect, it, vi } from 'vitest';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { encodeVariantRef } from '@fit/types';
import type { TenantContext } from '../common/tenant/tenant.context';
import type { PrismaService } from '../prisma/prisma.service';
import { PromoRedemptionService } from '../marketing/promo-redemption.service';
import { CartService } from './cart.service';

/** A stored product row as `loadVariantInfo` selects it. */
interface ProductRow {
  id: string;
  name: string;
  priceAmount: number;
  currency: string;
  images: string[];
  variants: Array<{ name: string; sku: string; priceAmount: number | null; stock: number }>;
  /** Base-position count; `null` is untracked, which is what the column defaults to. */
  stock: number | null;
}

interface CartRow {
  id: string;
  gymId: string;
  userId: string | null;
  sessionId: string | null;
  items: Array<{ id: string; productVariantId: string; qty: number; unitPrice: number }>;
}

function product(over: Partial<ProductRow> = {}): ProductRow {
  return {
    id: 'p1',
    name: 'Tee',
    priceAmount: 1000,
    currency: 'USD',
    images: ['https://img.test/tee.png'],
    variants: [{ name: 'M', sku: '', priceAmount: null, stock: 10 }],
    stock: null,
    ...over,
  };
}

/**
 * Build a {@link CartService} over a hand-rolled Prisma mock. `cart.findUnique`
 * dispatches on the `where` shape (user key / session key / id) so the service's
 * resolve + reload paths each see the row the test arranged.
 */
function setup(config: {
  gymId?: string;
  userId?: string | null;
  products?: ProductRow[];
  userCart?: CartRow | null;
  anonCart?: CartRow | null;
  reloadCart?: CartRow | null;
}) {
  const products = config.products ?? [];
  const findMany = vi.fn((args: { where: { id: { in: string[] } } }) =>
    Promise.resolve(products.filter((p) => args.where.id.in.includes(p.id))),
  );
  const productUpdate = vi.fn((_args: unknown) => Promise.resolve({}));

  const cartFindUnique = vi.fn((args: { where: Record<string, unknown> }) => {
    const where = args.where;
    if ('gymId_userId' in where) return Promise.resolve(config.userCart ?? null);
    if ('gymId_sessionId' in where) return Promise.resolve(config.anonCart ?? null);
    if ('id' in where)
      return Promise.resolve(config.reloadCart ?? config.userCart ?? config.anonCart ?? null);
    return Promise.resolve(null);
  });
  const cartCreate = vi.fn((args: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'new-cart', items: [], ...args.data }),
  );
  const cartDelete = vi.fn(() => Promise.resolve({}));
  const cartFindUniqueOrThrow = vi.fn(() =>
    Promise.resolve(config.reloadCart ?? { id: 'merged', items: [] }),
  );

  const cartItemUpsert = vi.fn(() => Promise.resolve({}));
  const cartItemUpdate = vi.fn(() => Promise.resolve({}));
  const cartItemDelete = vi.fn(() => Promise.resolve({}));
  const cartItemDeleteMany = vi.fn(() => Promise.resolve({ count: 1 }));

  const cartItemCreate = vi.fn(() => Promise.resolve({}));
  const orderCreate = vi.fn((_args: unknown) => Promise.resolve({ id: 'order-1' }));
  const movementCreateMany = vi.fn((_args: unknown) => Promise.resolve({ count: 1 }));
  const gymMemberFindFirst = vi.fn(() => Promise.resolve(null));

  const client = {
    product: { findMany, update: productUpdate },
    cart: {
      findUnique: cartFindUnique,
      create: cartCreate,
      delete: cartDelete,
      findUniqueOrThrow: cartFindUniqueOrThrow,
    },
    cartItem: {
      upsert: cartItemUpsert,
      update: cartItemUpdate,
      delete: cartItemDelete,
      deleteMany: cartItemDeleteMany,
      create: cartItemCreate,
    },
    order: { create: orderCreate },
    stockMovement: { createMany: movementCreateMany },
    gymMember: { findFirst: gymMemberFindFirst },
    $transaction: vi.fn((arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(client),
    ),
  };

  const prisma = { client } as unknown as PrismaService;
  const tenant = {
    gymId: config.gymId ?? 'gym1',
    userId: config.userId ?? null,
  } as unknown as TenantContext;

  return {
    service: new CartService(prisma, tenant, new PromoRedemptionService(prisma)),
    mocks: {
      findMany,
      cartCreate,
      cartItemUpsert,
      cartItemUpdate,
      cartItemDeleteMany,
      orderCreate,
      cartDelete,
      productUpdate,
      movementCreateMany,
    },
  };
}

const VARIANT = encodeVariantRef('p1', 0);

describe('CartService.addItem', () => {
  it('rejects a quantity beyond stock with INSUFFICIENT_STOCK (422)', async () => {
    const { service, mocks } = setup({
      products: [product({ variants: [{ name: 'M', sku: '', priceAmount: null, stock: 2 }] })],
    });

    const error = await service
      .addItem(undefined, { variantId: VARIANT, qty: 5 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
      code: 'INSUFFICIENT_STOCK',
    });
    expect(mocks.cartItemUpsert).not.toHaveBeenCalled();
  });

  it('rejects an unknown variant with a 404', async () => {
    const { service } = setup({ products: [] });
    const error = await service
      .addItem(undefined, { variantId: VARIANT, qty: 1 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotFoundException);
  });

  it('adds a line and returns the re-priced view', async () => {
    const newCart: CartRow = {
      id: 'new-cart',
      gymId: 'gym1',
      userId: null,
      sessionId: 's1',
      items: [{ id: 'i1', productVariantId: VARIANT, qty: 3, unitPrice: 1000 }],
    };
    const { service, mocks } = setup({
      anonCart: null,
      reloadCart: newCart,
      products: [product()],
    });

    const result = await service.addItem('s1', { variantId: VARIANT, qty: 3 });
    expect(mocks.cartItemUpsert).toHaveBeenCalledOnce();
    expect(result.view.items).toHaveLength(1);
    expect(result.view.subtotal).toBe(3000);
    expect(result.view.total).toBe(3000);
    expect(result.view.items[0]!.available).toBe(true);
  });
});

describe('CartService.checkout', () => {
  const cart: CartRow = {
    id: 'cart1',
    gymId: 'gym1',
    userId: 'u1',
    sessionId: null,
    items: [{ id: 'i1', productVariantId: VARIANT, qty: 2, unitPrice: 500 }],
  };

  it('returns OUT_OF_STOCK and removes the line when stock cannot cover it', async () => {
    const { service, mocks } = setup({
      userId: 'u1',
      userCart: cart,
      products: [
        product({
          priceAmount: 500,
          variants: [{ name: 'M', sku: '', priceAmount: null, stock: 0 }],
        }),
      ],
    });

    const outcome = await service.checkout(undefined, {
      fulfillment: 'PICKUP',
      locationId: 'loc1',
    });
    expect(outcome).toEqual({ kind: 'out_of_stock', removedItems: [VARIANT] });
    expect(mocks.cartItemDeleteMany).toHaveBeenCalledOnce();
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it('returns PRICE_CHANGED with the new price when a line price drifted', async () => {
    const { service, mocks } = setup({
      userId: 'u1',
      userCart: cart,
      // Stored unitPrice is 500; the variant now resolves to 700.
      products: [
        product({
          priceAmount: 700,
          variants: [{ name: 'M', sku: '', priceAmount: 700, stock: 10 }],
        }),
      ],
    });

    const outcome = await service.checkout(undefined, {
      fulfillment: 'PICKUP',
      locationId: 'loc1',
    });
    expect(outcome).toEqual({
      kind: 'price_changed',
      newPrices: [{ variantId: VARIANT, priceAmount: 700 }],
    });
    expect(mocks.cartItemUpdate).toHaveBeenCalledOnce();
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it('creates a pending order and clears the cart on a clean checkout', async () => {
    const { service, mocks } = setup({
      userId: 'u1',
      userCart: cart,
      products: [
        product({
          priceAmount: 500,
          variants: [{ name: 'M', sku: '', priceAmount: 500, stock: 10 }],
        }),
      ],
    });

    const outcome = await service.checkout(undefined, {
      fulfillment: 'DELIVERY',
      deliveryAddress: '1 Main St',
    });
    expect(outcome).toEqual({ kind: 'created', orderId: 'order-1' });
    expect(mocks.orderCreate).toHaveBeenCalledOnce();
    const orderArgs = mocks.orderCreate.mock.calls[0]![0] as {
      data: {
        total: number;
        status: string;
        fulfillment: string;
        locationId: string | null;
        deliveryAddress: string | null;
      };
    };
    expect(orderArgs.data.total).toBe(1000); // 2 × 500
    expect(orderArgs.data.status).toBe('PENDING');
    // The delivery fulfilment is persisted with its address and no pickup location (T7.10).
    expect(orderArgs.data.fulfillment).toBe('DELIVERY');
    expect(orderArgs.data.deliveryAddress).toBe('1 Main St');
    expect(orderArgs.data.locationId).toBeNull();
    expect(mocks.cartDelete).toHaveBeenCalledOnce();
  });

  it('persists a PICKUP order with its location and no delivery address (T7.10)', async () => {
    const { service, mocks } = setup({
      userId: 'u1',
      userCart: cart,
      products: [
        product({
          priceAmount: 500,
          variants: [{ name: 'M', sku: '', priceAmount: 500, stock: 10 }],
        }),
      ],
    });

    const outcome = await service.checkout(undefined, {
      fulfillment: 'PICKUP',
      locationId: 'loc1',
    });
    expect(outcome).toEqual({ kind: 'created', orderId: 'order-1' });
    const orderArgs = mocks.orderCreate.mock.calls[0]![0] as {
      data: { fulfillment: string; locationId: string | null; deliveryAddress: string | null };
    };
    expect(orderArgs.data.fulfillment).toBe('PICKUP');
    expect(orderArgs.data.locationId).toBe('loc1');
    expect(orderArgs.data.deliveryAddress).toBeNull();
  });

  it('draws down the sold variant stock within the checkout transaction (T7.8)', async () => {
    const { service, mocks } = setup({
      userId: 'u1',
      userCart: cart, // one line: variant index 0 of p1, qty 2
      products: [
        product({
          priceAmount: 500,
          variants: [{ name: 'M', sku: 'TEE-M', priceAmount: 500, stock: 10 }],
        }),
      ],
    });

    const outcome = await service.checkout(undefined, {
      fulfillment: 'DELIVERY',
      deliveryAddress: '1 Main St',
    });

    expect(outcome).toEqual({ kind: 'created', orderId: 'order-1' });
    expect(mocks.productUpdate).toHaveBeenCalledOnce();
    const updateArgs = mocks.productUpdate.mock.calls[0]![0] as {
      where: { id: string };
      data: { variants: Array<{ stock: number }> };
    };
    expect(updateArgs.where.id).toBe('p1');
    // 10 on hand − 2 sold = 8 left.
    expect(updateArgs.data.variants[0]!.stock).toBe(8);
  });

  it('leaves a base (untracked) line alone — no stock write (T7.8)', async () => {
    const baseRef = encodeVariantRef('p1', null);
    const baseCart: CartRow = {
      id: 'cart1',
      gymId: 'gym1',
      userId: 'u1',
      sessionId: null,
      items: [{ id: 'i1', productVariantId: baseRef, qty: 2, unitPrice: 1000 }],
    };
    const { service, mocks } = setup({
      userId: 'u1',
      userCart: baseCart,
      products: [product({ priceAmount: 1000 })],
    });

    const outcome = await service.checkout(undefined, {
      fulfillment: 'DELIVERY',
      deliveryAddress: '1 Main St',
    });

    expect(outcome).toEqual({ kind: 'created', orderId: 'order-1' });
    expect(mocks.productUpdate).not.toHaveBeenCalled();
  });

  it('rejects an empty cart', async () => {
    const { service } = setup({ userId: 'u1', userCart: null });
    const error = await service
      .checkout(undefined, { fulfillment: 'PICKUP', locationId: 'loc1' })
      .catch((e: unknown) => e);
    expect(error).toBeTruthy();
    expect((error as { getResponse: () => unknown }).getResponse()).toMatchObject({
      code: 'EMPTY_CART',
    });
  });
});

describe('CartService.getCart (anon → user merge)', () => {
  it('merges the anon cart into the user cart, summing duplicate quantities', async () => {
    const userCart: CartRow = {
      id: 'user-cart',
      gymId: 'gym1',
      userId: 'u1',
      sessionId: null,
      items: [{ id: 'ua', productVariantId: VARIANT, qty: 1, unitPrice: 1000 }],
    };
    const anonCart: CartRow = {
      id: 'anon-cart',
      gymId: 'gym1',
      userId: null,
      sessionId: 's1',
      items: [{ id: 'aa', productVariantId: VARIANT, qty: 2, unitPrice: 1000 }],
    };
    const merged: CartRow = {
      id: 'user-cart',
      gymId: 'gym1',
      userId: 'u1',
      sessionId: null,
      items: [{ id: 'ua', productVariantId: VARIANT, qty: 3, unitPrice: 1000 }],
    };
    const { service, mocks } = setup({
      userId: 'u1',
      userCart,
      anonCart,
      reloadCart: merged,
      products: [product()],
    });

    const result = await service.getCart('s1');
    // The duplicate variant's quantities summed to 3 (1 + 2), capped at stock 10.
    expect(mocks.cartItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { qty: 3 } }),
    );
    expect(mocks.cartDelete).toHaveBeenCalledWith({ where: { id: 'anon-cart' } });
    expect(result.session.clear).toBe(true);
    expect(result.view.items[0]!.qty).toBe(3);
  });
});
