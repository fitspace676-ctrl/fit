import { describe, expect, it, vi } from 'vitest';
import type { AutomationExecutorService } from '../automation/automation-executor.service';
import type { CreditPacksService } from '../billing/credit-packs.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import type { PromoRedemptionService } from '../marketing/promo-redemption.service';
import type { SubscriptionEnrollmentService } from '../subscriptions/subscription-enrollment.service';
import { CheckoutService } from './checkout.service';

/** A plain-package purchase over a mock tenant client, with the automation executor spied. */
function setup() {
  const orderCreate = vi.fn((_args: unknown) => Promise.resolve({ id: 'order-1' }));
  const client = {
    gymMember: { findFirst: vi.fn(() => Promise.resolve({ id: 'mem-1' })) },
    packagePlan: {
      findFirst: vi.fn(() =>
        Promise.resolve({
          id: 'pkg-1',
          name: 'Drop-in',
          priceAmount: 1500,
          currency: 'GEL',
          sessionCount: null,
          status: 'ACTIVE',
        }),
      ),
    },
    location: { findFirst: vi.fn(() => Promise.resolve(null)) },
    order: { create: orderCreate },
    payment: { create: vi.fn(() => Promise.resolve({ id: 'pay-1' })) },
    $transaction: (cb: (tx: unknown) => unknown) => cb(client),
  };
  const dispatchForGym = vi.fn((..._args: unknown[]) => Promise.resolve(0));
  const service = new CheckoutService(
    { client } as unknown as TenantPrismaService,
    { gymId: 'gym-1', userId: 'u-1' } as unknown as TenantContext,
    {} as unknown as CreditPacksService,
    {} as unknown as SubscriptionEnrollmentService,
    { resolve: vi.fn(() => Promise.resolve(null)) } as unknown as PromoRedemptionService,
    { dispatchForGym } as unknown as AutomationExecutorService,
  );
  return { service, dispatchForGym, orderCreate };
}

describe('CheckoutService — package purchase automation', () => {
  it('fires purchase_completed for the paid package order, logged against the order', async () => {
    const { service, dispatchForGym, orderCreate } = setup();

    const result = await service.checkout({ productType: 'package', productId: 'pkg-1' });

    expect(result.orderId).toBe('order-1');
    expect(orderCreate.mock.calls[0]![0]).toMatchObject({
      data: { status: 'PAID', memberId: 'mem-1' },
    });
    expect(dispatchForGym).toHaveBeenCalledWith('gym-1', 'purchase_completed', {
      entityId: 'order-1',
      entityType: 'order',
    });
    // A package holds no stock, so the stock trigger is never considered.
    expect(dispatchForGym).not.toHaveBeenCalledWith(
      'gym-1',
      'product_stock_low',
      expect.anything(),
    );
  });
});
