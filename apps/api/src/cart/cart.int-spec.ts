import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { GymStatus, ProductStatus, Role } from '@fit/db';
import { encodeVariantRef } from '@fit/types';
import { PromoRedemptionService } from '../marketing/promo-redemption.service';
import { CartService } from './cart.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { asTenant, disconnect, prisma, resetDb } from '../test/integration-db';
import type { TenantState } from '../common/tenant/tenant.context';

/**
 * The online-shop cart, proven against a real Postgres (T7.7): the anon→user
 * merge on sign-in, the stale-price `PRICE_CHANGED` gate, and the out-of-stock
 * removal at checkout — the three behaviours the acceptance criteria turn on,
 * exercised through the real Prisma queries the migration's tables back.
 */
const prismaForCart = new PrismaService();
const service = new CartService(
  prismaForCart,
  new TenantContext(),
  new PromoRedemptionService(prismaForCart),
);

function anon(gymId: string): TenantState {
  return { userId: null, gymId, role: Role.MEMBER, allowCrossTenant: false };
}
function member(gymId: string, userId: string): TenantState {
  return { userId, gymId, role: Role.MEMBER, allowCrossTenant: false };
}

describe('CartService (integration)', () => {
  let gymId: string;
  let userId: string;
  let productId: string;
  let variantRef: string;

  beforeEach(async () => {
    await resetDb();
    const gym = await prisma.gym.create({
      data: { name: 'Cart Gym', slug: 'cart-gym', status: GymStatus.ACTIVE },
    });
    gymId = gym.id;
    const user = await prisma.user.create({ data: { email: 'shopper@example.com' } });
    userId = user.id;
    const product = await prisma.product.create({
      data: {
        gymId,
        name: 'Protein Bar',
        priceAmount: 500,
        currency: 'USD',
        status: ProductStatus.ACTIVE,
        variants: [{ name: 'Chocolate', sku: 'PB-CHOC', priceAmount: 500, stock: 5 }],
      },
    });
    productId = product.id;
    variantRef = encodeVariantRef(productId, 0);
  });

  afterAll(disconnect);

  it('adds an anon line and reads it back, re-pricing live', async () => {
    const added = await asTenant(anon(gymId), () =>
      service.addItem('sess-1', { variantId: variantRef, qty: 2 }),
    );
    expect(added.session.assign).toBeUndefined(); // session supplied, not minted
    expect(added.view.items).toHaveLength(1);
    expect(added.view.subtotal).toBe(1000);

    const fetched = await asTenant(anon(gymId), () => service.getCart('sess-1'));
    expect(fetched.view.items[0]).toMatchObject({ qty: 2, unitPrice: 500, available: true });
  });

  it('mints a session id for a brand-new anon cart', async () => {
    const added = await asTenant(anon(gymId), () =>
      service.addItem(undefined, { variantId: variantRef, qty: 1 }),
    );
    expect(added.session.assign).toBeTruthy();
  });

  it('merges the anon cart into the user cart on sign-in without duplicates', async () => {
    // Guest adds 2, then (signed-in) the user already has 1 of the same variant.
    await asTenant(anon(gymId), () =>
      service.addItem('sess-merge', { variantId: variantRef, qty: 2 }),
    );
    await asTenant(member(gymId, userId), () =>
      service.addItem(undefined, { variantId: variantRef, qty: 1 }),
    );

    const merged = await asTenant(member(gymId, userId), () => service.getCart('sess-merge'));
    expect(merged.session.clear).toBe(true);
    expect(merged.view.items).toHaveLength(1);
    expect(merged.view.items[0]!.qty).toBe(3); // 1 (user) + 2 (anon), capped at stock 5

    // The anon cart is gone; the user cart is the single survivor.
    const carts = await prisma.cart.findMany({ where: { gymId } });
    expect(carts).toHaveLength(1);
    expect(carts[0]!.userId).toBe(userId);
  });

  it('rejects checkout with PRICE_CHANGED when a price drifted, then succeeds on retry', async () => {
    await asTenant(member(gymId, userId), () =>
      service.addItem(undefined, { variantId: variantRef, qty: 1 }),
    );

    // The shop raises the variant price after the line was added.
    await prisma.product.update({
      where: { id: productId },
      data: { variants: [{ name: 'Chocolate', sku: 'PB-CHOC', priceAmount: 700, stock: 5 }] },
    });

    const drifted = await asTenant(member(gymId, userId), () =>
      service.checkout('', { fulfillment: 'PICKUP', locationId: undefined }),
    );
    expect(drifted).toEqual({
      kind: 'price_changed',
      newPrices: [{ variantId: variantRef, priceAmount: 700 }],
    });

    // The stored price was refreshed, so an immediate retry now goes through.
    const retried = await asTenant(member(gymId, userId), () =>
      service.checkout('', { fulfillment: 'DELIVERY', deliveryAddress: '1 Main St' }),
    );
    expect(retried.kind).toBe('created');
    const orders = await prisma.order.findMany({ where: { gymId }, include: { items: true } });
    expect(orders).toHaveLength(1);
    expect(orders[0]!.total).toBe(700);
    expect(orders[0]!.status).toBe('PENDING');
    // The delivery fulfilment + destination are persisted on the order (T7.10).
    expect(orders[0]!.fulfillment).toBe('DELIVERY');
    expect(orders[0]!.deliveryAddress).toBe('1 Main St');
    expect(orders[0]!.locationId).toBeNull();
  });

  it('removes out-of-stock lines at checkout with OUT_OF_STOCK', async () => {
    await asTenant(member(gymId, userId), () =>
      service.addItem(undefined, { variantId: variantRef, qty: 2 }),
    );

    // Stock drops below the cart quantity.
    await prisma.product.update({
      where: { id: productId },
      data: { variants: [{ name: 'Chocolate', sku: 'PB-CHOC', priceAmount: 500, stock: 0 }] },
    });

    const outcome = await asTenant(member(gymId, userId), () =>
      service.checkout('', { fulfillment: 'PICKUP', locationId: 'loc-1' }),
    );
    expect(outcome).toEqual({ kind: 'out_of_stock', removedItems: [variantRef] });

    // The line was removed from the cart.
    const fetched = await asTenant(member(gymId, userId), () => service.getCart(''));
    expect(fetched.view.items).toHaveLength(0);
  });
});
