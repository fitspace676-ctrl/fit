import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import type { AutomationExecutorService } from '../automation/automation-executor.service';
import type { CreditPacksService } from '../billing/credit-packs.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import type { PromoRedemptionService } from '../marketing/promo-redemption.service';
import type { OnlinePaymentsService } from '../payments/online-payments.service';
import type { SubscriptionEnrollmentService } from '../subscriptions/subscription-enrollment.service';
import { CheckoutService } from './checkout.service';

const stub = vi.hoisted(() => ({ enabled: true }));
vi.mock('../config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config/env')>();
  return { ...actual, onlinePaymentsStubEnabled: () => stub.enabled };
});

/** A plain-package purchase over a mock tenant client, with a payments double. */
function setup(payments?: Partial<OnlinePaymentsService>) {
  const orderCreate = vi.fn((_args: unknown) => Promise.resolve({ id: 'order-1' }));
  const paymentCreate = vi.fn((_args: unknown) => Promise.resolve({ id: 'pay-1' }));
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
    payment: { create: paymentCreate },
    $transaction: (cb: (tx: unknown) => unknown) => cb(client),
  };
  const service = new CheckoutService(
    { client } as unknown as TenantPrismaService,
    { gymId: 'gym-1', userId: 'u-1' } as unknown as TenantContext,
    {} as unknown as CreditPacksService,
    {} as unknown as SubscriptionEnrollmentService,
    { resolve: vi.fn(() => Promise.resolve(null)) } as unknown as PromoRedemptionService,
    { dispatchForGym: vi.fn(() => Promise.resolve(0)) } as unknown as AutomationExecutorService,
    payments as OnlinePaymentsService | undefined,
  );
  return { service, orderCreate, paymentCreate };
}

describe('CheckoutService — online payment policy', () => {
  beforeEach(() => {
    stub.enabled = true;
  });

  it('refuses a package with 409 ONLINE_PAYMENTS_UNAVAILABLE when there is no Flitt and no stub', async () => {
    stub.enabled = false;
    const { service, orderCreate } = setup();
    const error = await service
      .checkout({ productType: 'package', productId: 'pkg-1' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'ONLINE_PAYMENTS_UNAVAILABLE',
    });
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it('keeps the stub purchase exactly as it was when the flag is on', async () => {
    const purchaseMode = vi.fn(() => Promise.resolve({ mode: 'stub' as const }));
    const begin = vi.fn();
    const { service, orderCreate, paymentCreate } = setup({ purchaseMode, begin });

    const result = await service.checkout({ productType: 'package', productId: 'pkg-1' });

    // Byte-for-byte the old response: no `payment` key at all.
    expect(result).toStrictEqual({
      productType: 'package',
      orderId: 'order-1',
      subscriptionId: null,
    });
    expect(JSON.stringify(result)).toBe(
      '{"productType":"package","orderId":"order-1","subscriptionId":null}',
    );
    expect(orderCreate.mock.calls[0]![0]).toMatchObject({ data: { status: 'PAID' } });
    expect(paymentCreate.mock.calls[0]![0]).toMatchObject({
      data: { status: 'CAPTURED', provider: 'stub' },
    });
    expect(begin).not.toHaveBeenCalled();
  });

  it('hands a Flitt gym’s package to the payment flow and returns its checkout', async () => {
    const credentials = { merchantId: '1549901', secretKey: 'k' };
    const payment = {
      status: 'requires_action' as const,
      orderId: 'order-9',
      checkoutUrl: 'https://pay.flitt.com/x',
      expiresAt: '2026-11-20T12:30:00.000Z',
    };
    const begin = vi.fn((..._args: unknown[]) => Promise.resolve({ orderId: 'order-9', payment }));
    const { service, orderCreate } = setup({
      purchaseMode: vi.fn(() => Promise.resolve({ mode: 'flitt' as const, credentials })),
      begin: begin as unknown as OnlinePaymentsService['begin'],
    });

    const result = await service.checkout({
      productType: 'package',
      productId: 'pkg-1',
      returnTo: 'app',
    });

    expect(result).toEqual({
      productType: 'package',
      orderId: 'order-9',
      subscriptionId: null,
      payment,
    });
    expect(orderCreate).not.toHaveBeenCalled();
    expect(begin.mock.calls[0]![0]).toMatchObject({
      gymId: 'gym-1',
      memberId: 'mem-1',
      purpose: 'package',
      returnTo: 'app',
      order: { total: 1500, currency: 'GEL', packageId: 'pkg-1' },
    });
    expect(begin.mock.calls[0]![1]).toBe(credentials);
  });
});
