import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { RecordPosSaleInput, SendReceiptInput } from '@fit/types';
import type { EmailService } from '../auth/email.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { LoyaltyPointsService } from '../loyalty/loyalty-points.service';
import type { SubscriptionEnrollmentService } from '../subscriptions/subscription-enrollment.service';
import type { PromoRedemptionService } from '../marketing/promo-redemption.service';
import { OrdersService, utcDayRange } from './orders.service';

/** A no-op loyalty earn-hook stub — the sale flow calls it fire-and-forget. */
/**
 * A promo service that never finds a code — the default for sales rung up with
 * no discount, which is every existing case here.
 */
function promoStub(): PromoRedemptionService {
  return {
    resolve: vi.fn(() => Promise.resolve(null)),
    consume: vi.fn(() => Promise.resolve()),
  } as unknown as PromoRedemptionService;
}

function loyaltyStub(): LoyaltyPointsService {
  return {
    awardForPurchase: vi.fn<() => Promise<void>>().mockResolvedValue(),
  } as unknown as LoyaltyPointsService;
}

/** Enrolment stub — the membership-sale tests assert against its calls. */
function enrollmentStub(
  enrollMember = vi.fn().mockResolvedValue({}),
): SubscriptionEnrollmentService {
  return { enrollMember } as unknown as SubscriptionEnrollmentService;
}

const input: SendReceiptInput = {
  email: 'buyer@example.com',
  receipt: {
    currency: 'USD',
    items: [{ name: 'Protein bar', quantity: 2, unitPrice: 250, amount: 500 }],
    subtotal: 500,
    discountTotal: 0,
    total: 500,
    paymentMethod: 'cash',
    cashTendered: 1000,
    changeDue: 500,
  },
};

function setup(over?: {
  gymName?: string | null;
  delivered?: boolean;
  settings?: unknown;
  grouped?: Array<{ method: string; _sum: { amount: number | null }; _count: { _all: number } }>;
  enrollMember?: ReturnType<typeof vi.fn>;
  /** JWT `sub` on the request; omitted for an unauthenticated (subdomain) caller. */
  userId?: string;
  /** The caller's staff row at this gym, or null when they hold no membership here. */
  staff?: { id: string } | null;
  /** The product rows the sale's stock draw-down reads back. */
  productFindMany?: unknown[];
  /** The catalogue service rows a service line on the receipt resolves against. */
  services?: Array<{ id: string; status: string }>;
}) {
  const sendReceiptEmail = vi.fn<() => Promise<boolean>>(() =>
    Promise.resolve(over?.delivered ?? true),
  );
  const findUnique = vi.fn(() =>
    Promise.resolve(
      over?.settings !== undefined
        ? { name: over.gymName ?? 'Downtown', settings: over.settings }
        : over?.gymName === undefined
          ? { name: 'Downtown' }
          : { name: over.gymName },
    ),
  );
  // `recordSale` reads the gym's accepted payment methods; `findFirst`, not
  // `findUnique`, because `Gym` is the tenant root and the read pins its own id.
  // Undefined settings mean "never configured", which defaults to accepting everything.
  const gymFindFirst = vi.fn((_args: unknown) => Promise.resolve({ settings: over?.settings }));
  const orderCreate = vi.fn((_args: unknown) => Promise.resolve({ id: 'order-1' }));
  const paymentCreate = vi.fn((_args: unknown) => Promise.resolve({ id: 'pay-1' }));
  const groupBy = vi.fn((_args: unknown) => Promise.resolve(over?.grouped ?? []));
  // The sale draws its sold units down in the same transaction, so the mock
  // transaction has to carry the product + ledger writes as well as the money.
  const productFindMany = vi.fn((_args: unknown) => Promise.resolve(over?.productFindMany ?? []));
  const productUpdate = vi.fn((_args: unknown) => Promise.resolve({ id: 'p1' }));
  const movementCreateMany = vi.fn((_args: unknown) => Promise.resolve({ count: 1 }));
  const tx = {
    order: { create: orderCreate },
    payment: { create: paymentCreate },
    product: { findMany: productFindMany, update: productUpdate },
    stockMovement: { createMany: movementCreateMany },
  };
  const $transaction = vi.fn((cb: (client: typeof tx) => unknown) => cb(tx));
  const email = { sendReceiptEmail } as unknown as EmailService;
  const tenant = { gymId: 'gym-1', userId: over?.userId } as unknown as TenantContext;
  // `findFirst`, not `findUnique` — the tenant extension scopes reads by injecting
  // `gymId` into the `where`, and `findUnique` is not one of the operations it
  // scopes, so a compound-unique lookup here would run across every gym.
  const gymMemberFindFirst = vi.fn((_args: unknown) => Promise.resolve(over?.staff ?? null));
  const serviceFindMany = vi.fn((_args: unknown) => Promise.resolve(over?.services ?? []));
  const prisma = {
    client: {
      gym: { findUnique, findFirst: gymFindFirst },
      gymMember: { findFirst: gymMemberFindFirst },
      service: { findMany: serviceFindMany },
      payment: { groupBy },
      $transaction,
    },
  } as unknown as TenantPrismaService;
  const enrollMember = over?.enrollMember ?? vi.fn().mockResolvedValue({});
  const enrollment = enrollmentStub(enrollMember);
  return {
    service: new OrdersService(email, tenant, prisma, loyaltyStub(), enrollment, promoStub()),
    enrollMember,
    sendReceiptEmail,
    findUnique,
    gymFindFirst,
    gymMemberFindFirst,
    serviceFindMany,
    orderCreate,
    paymentCreate,
    groupBy,
    productFindMany,
    productUpdate,
    movementCreateMany,
  };
}

describe('OrdersService.sendReceipt', () => {
  afterEach(() => vi.clearAllMocks());

  it('resolves the tenant gym name and forwards it to the email service', async () => {
    const { service, sendReceiptEmail, findUnique } = setup();

    const result = await service.sendReceipt(input);

    expect(result).toEqual({ delivered: true });
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'gym-1' },
      select: { name: true, settings: true },
    });
    expect(sendReceiptEmail).toHaveBeenCalledWith(
      'buyer@example.com',
      input.receipt,
      'Downtown',
      {
        address: null,
        phone: null,
        email: null,
        website: null,
      },
      'en',
    );
  });

  it('passes undefined for the gym name when the tenant lookup misses', async () => {
    const { service, sendReceiptEmail } = setup({ gymName: null });

    await service.sendReceipt(input);

    expect(sendReceiptEmail).toHaveBeenCalledWith(
      'buyer@example.com',
      input.receipt,
      undefined,
      {
        address: null,
        phone: null,
        email: null,
        website: null,
      },
      'en',
    );
  });

  it('forwards the gym’s business contact details so they print on the receipt', async () => {
    const { service, sendReceiptEmail } = setup({
      settings: {
        business: {
          address: '12 Rustaveli Ave',
          phone: '+995 322 00 00 00',
          email: 'hello@downtown.example',
          website: 'downtown.example',
        },
      },
    });

    await service.sendReceipt(input);

    expect(sendReceiptEmail).toHaveBeenCalledWith(
      'buyer@example.com',
      input.receipt,
      'Downtown',
      {
        address: '12 Rustaveli Ave',
        phone: '+995 322 00 00 00',
        email: 'hello@downtown.example',
        website: 'downtown.example',
      },
      'en',
    );
  });

  it('reports delivered:false when email delivery is unconfigured', async () => {
    const { service } = setup({ delivered: false });

    expect(await service.sendReceipt(input)).toEqual({ delivered: false });
  });

  it('refuses to email a receipt when the gym has switched emailed receipts off', async () => {
    // The till hides the control, but a stale tab or a direct call still reaches here
    // — and "we do not email customers" is not a decision either may overrule.
    const { service, sendReceiptEmail } = setup({ settings: { receipt: { emailEnabled: false } } });

    await expect(service.sendReceipt(input)).rejects.toBeInstanceOf(BadRequestException);
    expect(sendReceiptEmail).not.toHaveBeenCalled();
  });

  it('still emails when only printed receipts are switched off', async () => {
    const { service, sendReceiptEmail } = setup({ settings: { receipt: { printEnabled: false } } });

    expect(await service.sendReceipt(input)).toEqual({ delivered: true });
    expect(sendReceiptEmail).toHaveBeenCalled();
  });
});

const saleInput: RecordPosSaleInput = {
  memberId: 'mem-1',
  receipt: {
    currency: 'USD',
    items: [
      { name: 'Protein bar', quantity: 2, unitPrice: 250, amount: 500 },
      { name: 'Towel', quantity: 1, unitPrice: 300, amount: 300 },
    ],
    subtotal: 800,
    discountTotal: 0,
    total: 800,
    paymentMethod: 'card',
    cashTendered: 0,
    changeDue: 0,
    memberName: 'Dana',
  },
};

describe('OrdersService.recordSale', () => {
  afterEach(() => vi.clearAllMocks());

  it('persists a PAID order with its lines and a CAPTURED payment in one transaction', async () => {
    const { service, orderCreate, paymentCreate } = setup();

    const result = await service.recordSale(saleInput);

    expect(result).toEqual({ orderId: 'order-1', paymentId: 'pay-1' });

    const orderArgs = orderCreate.mock.calls[0]![0] as {
      data: Record<string, unknown> & {
        items: { create: Array<{ label: string; amount: number; qty: number }> };
        statusEvents: { create: { status: string } };
      };
    };
    expect(orderArgs.data).toMatchObject({
      gymId: 'gym-1',
      total: 800,
      currency: 'USD',
      status: 'PAID',
      memberId: 'mem-1',
    });
    // Quantity is folded into the line label only when more than one was sold, but
    // the raw `qty` is recorded on each line (for refund restock) regardless.
    expect(orderArgs.data.items.create).toEqual([
      { label: 'Protein bar ×2', amount: 500, qty: 2, productVariantId: null, serviceId: null },
      { label: 'Towel', amount: 300, qty: 1, productVariantId: null, serviceId: null },
    ]);
    // The opening PAID transition is logged for the status timeline (T7.9). This
    // `setup()` has no authenticated caller, so the transition has no actor.
    expect(orderArgs.data.statusEvents.create).toEqual({ status: 'PAID', actor: null });

    const paymentArgs = paymentCreate.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(paymentArgs.data).toMatchObject({
      gymId: 'gym-1',
      orderId: 'order-1',
      amount: 800,
      status: 'CAPTURED',
      method: 'CARD',
      provider: 'pos',
    });
  });

  it('attributes the sale to the staff member who rang it', async () => {
    const { service, orderCreate, gymMemberFindFirst } = setup({
      userId: 'user-7',
      staff: { id: 'staff-7' },
    });

    await service.recordSale(saleInput);

    // Looked up by user id alone: the tenant extension injects the gym, so this
    // can never resolve a staff row belonging to another gym.
    expect(gymMemberFindFirst).toHaveBeenCalledWith({
      where: { userId: 'user-7' },
      select: { id: true },
    });
    const orderArgs = orderCreate.mock.calls[0]![0] as {
      data: Record<string, unknown> & { statusEvents: { create: Record<string, unknown> } };
    };
    // The staff row, not the user id: "sales by staff member" is a question about
    // this gym's roster.
    expect(orderArgs.data.soldById).toBe('staff-7');
    // The opening transition names the same operator, which it never used to.
    expect(orderArgs.data.statusEvents.create).toEqual({ status: 'PAID', actor: 'user-7' });
  });

  it('leaves the sale unattributed when the request carries no authenticated user', async () => {
    const { service, orderCreate, gymMemberFindFirst } = setup();

    await service.recordSale(saleInput);

    // No user to resolve, so the lookup is skipped entirely rather than run with
    // an undefined id.
    expect(gymMemberFindFirst).not.toHaveBeenCalled();
    const orderArgs = orderCreate.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(orderArgs.data.soldById).toBeNull();
  });

  it('leaves the sale unattributed when the caller holds no membership at this gym', async () => {
    const { service, orderCreate } = setup({ userId: 'user-7', staff: null });

    await service.recordSale(saleInput);

    // A null seller is the honest answer. Falling back to the user id would put a
    // value in the column that is not a staff row and would break the report's join.
    const orderArgs = orderCreate.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(orderArgs.data.soldById).toBeNull();
  });

  it('rejects a member-account sale with no member attached', async () => {
    const { service, orderCreate } = setup();

    await expect(
      service.recordSale({
        receipt: { ...saleInput.receipt, paymentMethod: 'member_account' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it('refuses a sale settled by a method the gym has switched off', async () => {
    // Settings → Payments with Card off; the till would not offer the button, but a
    // stale tab or a direct API call still can — and must not get a sale through.
    const { service, orderCreate, paymentCreate } = setup({
      settings: { payments: { acceptCard: false } },
    });

    await expect(service.recordSale(saleInput)).rejects.toBeInstanceOf(BadRequestException);
    expect(orderCreate).not.toHaveBeenCalled();
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it('refuses before enrolling, so a blocked method never leaves a subscription behind', async () => {
    const { service, enrollMember } = setup({ settings: { payments: { acceptCard: false } } });

    await expect(service.recordSale({ ...saleInput, planId: 'plan-1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(enrollMember).not.toHaveBeenCalled();
  });

  it('accepts a method the gym still has switched on', async () => {
    const { service, orderCreate, gymFindFirst } = setup({
      settings: { payments: { acceptCash: false, acceptCard: true } },
    });

    await service.recordSale(saleInput);

    expect(gymFindFirst).toHaveBeenCalledWith({
      where: { id: 'gym-1' },
      select: { settings: true },
    });
    expect(orderCreate).toHaveBeenCalled();
  });

  it('does not enrol anyone on an ordinary product sale', async () => {
    const { service, enrollMember } = setup();

    await service.recordSale(saleInput);

    expect(enrollMember).not.toHaveBeenCalled();
  });

  it('enrols the member on the plan when the sale carries one', async () => {
    const { service, enrollMember, orderCreate } = setup();

    await service.recordSale({ ...saleInput, planId: 'plan-1' });

    expect(enrollMember).toHaveBeenCalledWith('mem-1', 'plan-1');
    expect(orderCreate).toHaveBeenCalled();
  });

  it('enrols before taking the money, so a refused enrolment leaves no payment', async () => {
    const enrollMember = vi.fn().mockRejectedValue(new Error('ALREADY_SUBSCRIBED'));
    const { service, orderCreate, paymentCreate } = setup({ enrollMember });

    await expect(service.recordSale({ ...saleInput, planId: 'plan-1' })).rejects.toThrow(
      'ALREADY_SUBSCRIBED',
    );
    // The drawer never opened for a membership that could not be created.
    expect(orderCreate).not.toHaveBeenCalled();
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it('refuses a membership sale with no member to enrol', async () => {
    const { service, enrollMember, orderCreate } = setup();

    await expect(
      service.recordSale({ receipt: saleInput.receipt, planId: 'plan-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(enrollMember).not.toHaveBeenCalled();
    expect(orderCreate).not.toHaveBeenCalled();
  });
});

describe('OrdersService.recordSale — service lines', () => {
  afterEach(() => vi.clearAllMocks());

  const serviceLine = {
    name: 'Massage',
    quantity: 2,
    unitPrice: 8000,
    amount: 16000,
    productId: null,
    variantIndex: null,
    serviceId: 'svc-1',
  };

  it('records the service on the order item and skips stock', async () => {
    const { service, orderCreate } = setup({ services: [{ id: 'svc-1', status: 'ACTIVE' }] });

    await service.recordSale({
      ...saleInput,
      memberId: null,
      receipt: {
        ...saleInput.receipt,
        items: [serviceLine],
        subtotal: 16000,
        discountTotal: 0,
        total: 16000,
      },
    });

    const orderArgs = orderCreate.mock.calls[0]![0] as {
      data: { items: { create: Array<Record<string, unknown>> } };
    };
    const items = orderArgs.data.items.create;
    expect(items).toContainEqual(
      expect.objectContaining({
        label: 'Massage ×2',
        amount: 16000,
        qty: 2,
        serviceId: 'svc-1',
        productVariantId: null,
      }),
    );
  });

  it('refuses an archived service', async () => {
    const { service } = setup({ services: [{ id: 'svc-1', status: 'ARCHIVED' }] });

    await expect(
      service.recordSale({
        ...saleInput,
        memberId: null,
        receipt: {
          ...saleInput.receipt,
          items: [serviceLine],
          subtotal: 16000,
          discountTotal: 0,
          total: 16000,
        },
      }),
    ).rejects.toMatchObject({ response: { code: 'SERVICE_ARCHIVED' } });
  });

  it('refuses a service from another gym or that does not exist', async () => {
    const { service } = setup({ services: [] });

    await expect(
      service.recordSale({
        ...saleInput,
        memberId: null,
        receipt: {
          ...saleInput.receipt,
          items: [serviceLine],
          subtotal: 16000,
          discountTotal: 0,
          total: 16000,
        },
      }),
    ).rejects.toMatchObject({ response: { code: 'SERVICE_NOT_FOUND' } });
  });
});

// ── The till's stock draw-down ────────────────────────────────────────────────
//
// A sale across the counter moves inventory exactly like one through the online
// shop. Before this, the till recorded only money: the day's takings reconciled
// while the shelves silently disagreed with the catalogue.

/** A till sale of two units of one catalogue product, sold at its base position. */
const stockSaleInput: RecordPosSaleInput = {
  memberId: null,
  receipt: {
    currency: 'USD',
    items: [
      {
        name: 'Protein bar',
        quantity: 2,
        unitPrice: 250,
        amount: 500,
        productId: 'p1',
        variantIndex: null,
      },
    ],
    subtotal: 500,
    discountTotal: 0,
    total: 500,
    paymentMethod: 'cash',
    cashTendered: 500,
    changeDue: 0,
  },
};

describe('OrdersService.recordSale — stock', () => {
  afterEach(() => vi.clearAllMocks());

  it('draws the sold units down from the base position', async () => {
    const { service, productUpdate } = setup({
      productFindMany: [{ id: 'p1', variants: [], stock: 10 }],
    });

    await service.recordSale(stockSaleInput);

    const updateArgs = productUpdate.mock.calls[0]![0] as { data: { stock: number } };
    expect(updateArgs.data.stock).toBe(8);
  });

  it('draws down the named variant when the line sells one', async () => {
    const { service, productUpdate } = setup({
      productFindMany: [
        {
          id: 'p1',
          variants: [{ name: 'M', sku: 'BAR-M', priceAmount: null, stock: 5 }],
          stock: null,
        },
      ],
    });

    await service.recordSale({
      ...stockSaleInput,
      receipt: {
        ...stockSaleInput.receipt,
        items: [{ ...stockSaleInput.receipt.items[0]!, variantIndex: 0 }],
      },
    });

    const updateArgs = productUpdate.mock.calls[0]![0] as {
      data: { variants: Array<{ stock: number }> };
    };
    expect(updateArgs.data.variants[0]!.stock).toBe(3);
  });

  it('records a SALE movement tied to the order, so the count is explained', async () => {
    const { service, movementCreateMany } = setup({
      productFindMany: [{ id: 'p1', variants: [], stock: 10 }],
    });

    await service.recordSale(stockSaleInput);

    const args = movementCreateMany.mock.calls[0]![0] as { data: unknown[] };
    expect(args.data).toEqual([
      {
        gymId: 'gym-1',
        productId: 'p1',
        variantIndex: null,
        variantLabel: '',
        delta: -2,
        resultingStock: 8,
        reason: 'SALE',
        orderId: 'order-1',
      },
    ]);
  });

  it('stamps the sold position on the order line, so a refund can restock it', async () => {
    const { service, orderCreate } = setup({
      productFindMany: [{ id: 'p1', variants: [], stock: 10 }],
    });

    await service.recordSale(stockSaleInput);

    const orderArgs = orderCreate.mock.calls[0]![0] as {
      data: { items: { create: Array<{ productVariantId: string | null }> } };
    };
    expect(orderArgs.data.items.create[0]!.productVariantId).toBe('p1:base');
  });

  it('leaves stock alone for a membership line — a plan owns no shelf', async () => {
    const { service, productFindMany, productUpdate } = setup();

    await service.recordSale(saleInput);

    expect(productFindMany).not.toHaveBeenCalled();
    expect(productUpdate).not.toHaveBeenCalled();
  });

  it('leaves an untracked product alone rather than starting it at zero', async () => {
    const { service, productUpdate, movementCreateMany } = setup({
      productFindMany: [{ id: 'p1', variants: [], stock: null }],
    });

    await service.recordSale(stockSaleInput);

    expect(productUpdate).not.toHaveBeenCalled();
    expect(movementCreateMany).not.toHaveBeenCalled();
  });

  it('completes an oversold sale, landing the position at zero', async () => {
    // The goods are already in the customer's hands — the till must not refuse a
    // sale because the count was wrong. The ledger records the units that existed.
    const { service, productUpdate, movementCreateMany, paymentCreate } = setup({
      productFindMany: [{ id: 'p1', variants: [], stock: 1 }],
    });

    await service.recordSale(stockSaleInput);

    const updateArgs = productUpdate.mock.calls[0]![0] as { data: { stock: number } };
    expect(updateArgs.data.stock).toBe(0);
    const movements = movementCreateMany.mock.calls[0]![0] as { data: Array<{ delta: number }> };
    expect(movements.data[0]!.delta).toBe(-1);
    expect(paymentCreate).toHaveBeenCalled();
  });
});

describe('OrdersService.reconcile', () => {
  afterEach(() => vi.clearAllMocks());

  it('aggregates the day’s captured payments by method into the report', async () => {
    const { service, groupBy } = setup({
      settings: { locale: { currency: 'GEL', timezone: 'Asia/Tbilisi' } },
      grouped: [
        { method: 'CASH', _sum: { amount: 1500 }, _count: { _all: 3 } },
        { method: 'CARD', _sum: { amount: 4000 }, _count: { _all: 2 } },
      ],
    });

    const report = await service.reconcile({ date: '2026-06-07' });

    expect(report.currency).toBe('GEL');
    expect(report.date).toBe('2026-06-07');
    expect(report.expectedCash).toBe(1500);
    expect(report.grossTotal).toBe(5500);
    expect(report.salesCount).toBe(5);
    expect(report.methods.map((m) => m.method)).toEqual([
      'cash',
      'card',
      'bank_transfer',
      'member_account',
    ]);

    // The groupBy is constrained to captured payments inside the day window.
    const args = groupBy.mock.calls[0]![0] as {
      where: { status: string; createdAt: { gte: Date; lt: Date } };
    };
    expect(args.where.status).toBe('CAPTURED');
    expect(args.where.createdAt.lt.getTime() - args.where.createdAt.gte.getTime()).toBe(
      24 * 60 * 60 * 1000,
    );
  });

  it('falls back to default locale when the gym has no settings', async () => {
    const { service } = setup({ settings: null, grouped: [] });

    const report = await service.reconcile({ date: '2026-06-07' });

    expect(report.grossTotal).toBe(0);
    expect(report.methods).toHaveLength(4);
    expect(report.currency).toHaveLength(3);
  });
});

describe('utcDayRange', () => {
  it('spans local midnight to local midnight for a positive-offset zone', () => {
    const { gte, lt } = utcDayRange('2026-06-07', 'Asia/Tbilisi');
    // Tbilisi is UTC+4 year-round, so local midnight is 20:00 UTC the day before.
    expect(gte.toISOString()).toBe('2026-06-06T20:00:00.000Z');
    expect(lt.toISOString()).toBe('2026-06-07T20:00:00.000Z');
  });

  it('treats UTC as a midnight-to-midnight window', () => {
    const { gte, lt } = utcDayRange('2026-06-07', 'UTC');
    expect(gte.toISOString()).toBe('2026-06-07T00:00:00.000Z');
    expect(lt.toISOString()).toBe('2026-06-08T00:00:00.000Z');
  });
});

// ── Admin order management (T7.9) ──────────────────────────────────────────

/**
 * A mock tenant-scoped Prisma client for the admin order management methods.
 * Each model method is a spy seeded from `over`, and `$transaction` runs its
 * callback against the same mock so the refund flow can be exercised end-to-end.
 */
function adminSetup(over?: {
  orderFindMany?: unknown[];
  orderCount?: number;
  orderFindFirst?: unknown;
  orderAggregate?: { _sum: { total: number | null } };
  paymentAggregate?: { _sum: { refundedAmount: number | null } };
  productFindMany?: unknown[];
  /** The caller's staff row at this gym; pass `null` for a caller with none. */
  staff?: { id: string } | null;
}) {
  const orderFindMany = vi.fn((_args: unknown) => Promise.resolve(over?.orderFindMany ?? []));
  const orderCount = vi.fn((_args: unknown) => Promise.resolve(over?.orderCount ?? 0));
  const orderFindFirst = vi.fn((_args: unknown) => Promise.resolve(over?.orderFindFirst ?? null));
  const orderAggregate = vi.fn((_args: unknown) =>
    Promise.resolve(over?.orderAggregate ?? { _sum: { total: null } }),
  );
  const paymentAggregate = vi.fn((_args: unknown) =>
    Promise.resolve(over?.paymentAggregate ?? { _sum: { refundedAmount: null } }),
  );
  const orderUpdate = vi.fn((_args: unknown) => Promise.resolve({ id: 'order-1' }));
  const refundCreate = vi.fn((_args: unknown) => Promise.resolve({ id: 'refund-1' }));
  const paymentUpdate = vi.fn((_args: unknown) => Promise.resolve({ id: 'pay-1' }));
  const statusEventCreate = vi.fn((_args: unknown) => Promise.resolve({ id: 'evt-1' }));
  const productFindMany = vi.fn((_args: unknown) => Promise.resolve(over?.productFindMany ?? []));
  const productUpdate = vi.fn((_args: unknown) => Promise.resolve({ id: 'p1' }));
  const movementCreateMany = vi.fn((_args: unknown) => Promise.resolve({ count: 1 }));

  const tx = {
    order: { findFirst: orderFindFirst, update: orderUpdate },
    refund: { create: refundCreate },
    payment: { update: paymentUpdate },
    orderStatusEvent: { create: statusEventCreate },
    product: { findMany: productFindMany, update: productUpdate },
    stockMovement: { createMany: movementCreateMany },
  };
  const $transaction = vi.fn((cb: (client: typeof tx) => unknown) => cb(tx));

  const email = {} as unknown as EmailService;
  const tenant = { gymId: 'gym-1', userId: 'user-1' } as unknown as TenantContext;
  const gymMemberFindFirst = vi.fn((_args: unknown) =>
    Promise.resolve(over?.staff === undefined ? { id: 'staff-1' } : over.staff),
  );
  const prisma = {
    client: {
      order: {
        findMany: orderFindMany,
        count: orderCount,
        findFirst: orderFindFirst,
        aggregate: orderAggregate,
      },
      gymMember: { findFirst: gymMemberFindFirst },
      payment: { aggregate: paymentAggregate },
      $transaction,
    },
  } as unknown as TenantPrismaService;

  const enrollment = enrollmentStub();
  return {
    service: new OrdersService(email, tenant, prisma, loyaltyStub(), enrollment, promoStub()),
    gymMemberFindFirst,
    orderFindMany,
    orderCount,
    orderFindFirst,
    orderAggregate,
    paymentAggregate,
    orderUpdate,
    refundCreate,
    paymentUpdate,
    statusEventCreate,
    productFindMany,
    productUpdate,
    movementCreateMany,
  };
}

/** A roster row record as the scoped select returns it (Date `createdAt`). */
function orderRecord(over?: Partial<Record<string, unknown>>) {
  return {
    id: 'order-1',
    status: 'PAID',
    total: 1000,
    currency: 'USD',
    memberId: 'mem-1',
    customerName: null,
    fulfillment: 'PICKUP',
    deliveryAddress: null,
    createdAt: new Date('2026-06-07T10:00:00.000Z'),
    payment: { provider: 'pos', method: 'CARD', refundedAmount: 0 },
    _count: { items: 2 },
    ...over,
  };
}

describe('OrdersService.listOrders', () => {
  afterEach(() => vi.clearAllMocks());

  it('maps rows to admin order rows and derives the channel from the payment provider', async () => {
    const { service } = adminSetup({
      orderFindMany: [
        orderRecord({ payment: { provider: 'pos', method: 'CASH', refundedAmount: 0 } }),
        orderRecord({
          id: 'order-2',
          payment: { provider: 'stub', method: 'CARD', refundedAmount: 200 },
        }),
        orderRecord({ id: 'order-3', payment: null }),
      ],
      orderCount: 3,
    });

    const result = await service.listOrders({ page: 1, limit: 20 });

    expect(result.total).toBe(3);
    expect(result.data.map((row) => row.channel)).toEqual(['POS', 'ONLINE', 'ONLINE']);
    expect(result.data[0]!.paymentMethod).toBe('cash');
    expect(result.data[1]!.refundedAmount).toBe(200);
    expect(result.data[2]!.paymentMethod).toBeNull();
    expect(result.data[0]!.itemCount).toBe(2);
  });

  it('filters POS by a pos provider and applies the date range + pagination', async () => {
    const { service, orderFindMany } = adminSetup();

    await service.listOrders({
      page: 2,
      limit: 10,
      channel: 'POS',
      status: 'PAID',
      memberId: 'mem-9',
      from: new Date('2026-06-01T00:00:00.000Z'),
      to: new Date('2026-06-30T23:59:59.999Z'),
    });

    const args = orderFindMany.mock.calls[0]![0] as {
      where: Record<string, unknown> & { createdAt?: { gte?: Date; lte?: Date } };
      skip: number;
      take: number;
    };
    expect(args.where.payment).toEqual({ is: { provider: 'pos' } });
    expect(args.where.status).toBe('PAID');
    expect(args.where.memberId).toBe('mem-9');
    expect(args.where.createdAt?.gte?.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(args.skip).toBe(10);
    expect(args.take).toBe(10);
  });

  it('filters ONLINE as the negation of a pos payment', async () => {
    const { service, orderFindMany } = adminSetup();

    await service.listOrders({ page: 1, limit: 20, channel: 'ONLINE' });

    const args = orderFindMany.mock.calls[0]![0] as { where: { NOT?: unknown } };
    expect(args.where.NOT).toEqual({ payment: { is: { provider: 'pos' } } });
  });

  it('summarises the whole filtered set — gross, refunded, net and currency', async () => {
    const { service, orderAggregate, paymentAggregate } = adminSetup({
      orderCount: 42,
      orderAggregate: { _sum: { total: 128_000 } },
      paymentAggregate: { _sum: { refundedAmount: 5_500 } },
      orderFindFirst: { currency: 'GEL' },
    });

    const result = await service.listOrders({ page: 1, limit: 20, status: 'PAID' });

    expect(result.summary).toEqual({
      orderCount: 42,
      grossTotal: 128_000,
      refundedTotal: 5_500,
      netTotal: 122_500,
      currency: 'GEL',
    });
    // The summary spans the filter, not the page: no skip/take on the aggregates,
    // and the refund sum reaches through the matching orders' payments.
    expect(orderAggregate).toHaveBeenCalledWith({
      where: { status: 'PAID' },
      _sum: { total: true },
    });
    expect(paymentAggregate).toHaveBeenCalledWith({
      where: { order: { status: 'PAID' } },
      _sum: { refundedAmount: true },
    });
  });

  it('zeroes the summary and falls back to GEL when no order matches', async () => {
    const { service } = adminSetup({ orderCount: 0 });

    const result = await service.listOrders({ page: 1, limit: 20 });

    expect(result.summary).toEqual({
      orderCount: 0,
      grossTotal: 0,
      refundedTotal: 0,
      netTotal: 0,
      currency: 'GEL',
    });
  });
});

describe('OrdersService.getOrder', () => {
  afterEach(() => vi.clearAllMocks());

  it('404s an unknown order', async () => {
    const { service } = adminSetup({ orderFindFirst: null });
    await expect(service.getOrder('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('projects items, payments, refunds and the status timeline from the event log', async () => {
    const { service } = adminSetup({
      orderFindFirst: {
        ...orderRecord({ fulfillment: 'DELIVERY', deliveryAddress: '1 Main St' }),
        items: [{ id: 'i1', label: 'Towel', amount: 300, productVariantId: 'p1:0', qty: 1 }],
        payment: {
          id: 'pay-1',
          amount: 1000,
          currency: 'USD',
          status: 'CAPTURED',
          method: 'CARD',
          provider: 'pos',
          refundedAmount: 0,
          createdAt: new Date('2026-06-07T10:00:00.000Z'),
        },
        refunds: [],
        statusEvents: [
          { status: 'PAID', at: new Date('2026-06-07T10:00:00.000Z') },
          { status: 'REFUNDED', at: new Date('2026-06-08T09:00:00.000Z') },
        ],
      },
    });

    const detail = await service.getOrder('order-1');

    expect(detail.items).toHaveLength(1);
    expect(detail.payments).toHaveLength(1);
    expect(detail.payments[0]!.method).toBe('card');
    expect(detail.statusTimeline.map((e) => e.status)).toEqual(['PAID', 'REFUNDED']);
    expect(detail.fulfillment).toBe('DELIVERY');
    expect(detail.deliveryAddress).toBe('1 Main St');
  });

  it('synthesises a single timeline entry when no events were logged', async () => {
    const { service } = adminSetup({
      orderFindFirst: {
        ...orderRecord({ status: 'PAID' }),
        items: [],
        payment: null,
        refunds: [],
        statusEvents: [],
      },
    });

    const detail = await service.getOrder('order-1');

    expect(detail.statusTimeline).toEqual([{ status: 'PAID', at: '2026-06-07T10:00:00.000Z' }]);
    expect(detail.payments).toEqual([]);
  });
});

describe('OrdersService.refundOrder', () => {
  afterEach(() => vi.clearAllMocks());

  it('rejects an amount over the net paid figure with 422 EXCEEDS_PAID_AMOUNT', async () => {
    const { service, refundCreate } = adminSetup({
      orderFindFirst: {
        id: 'order-1',
        status: 'PAID',
        payment: { id: 'pay-1', amount: 1000, refundedAmount: 200 },
        items: [],
      },
    });

    let caught: unknown;
    await service
      .refundOrder('order-1', { amount: 801, reason: 'x', restockItems: false })
      .catch((error) => {
        caught = error;
      });

    expect(caught).toBeInstanceOf(UnprocessableEntityException);
    expect((caught as UnprocessableEntityException).getResponse()).toMatchObject({
      code: 'EXCEEDS_PAID_AMOUNT',
    });
    expect(refundCreate).not.toHaveBeenCalled();
  });

  it('422s an order with no captured payment to refund', async () => {
    const { service } = adminSetup({
      orderFindFirst: { id: 'order-1', status: 'PENDING', payment: null, items: [] },
    });

    await expect(
      service.refundOrder('order-1', { amount: 100, reason: 'x', restockItems: false }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('records a full refund, flips the payment + order to REFUNDED, and logs the transition', async () => {
    const { service, refundCreate, paymentUpdate, orderUpdate, statusEventCreate } = adminSetup({
      orderFindFirst: {
        id: 'order-1',
        status: 'PAID',
        payment: { id: 'pay-1', amount: 1000, refundedAmount: 0 },
        items: [],
      },
    });

    const result = await service.refundOrder('order-1', {
      amount: 1000,
      reason: 'Returned',
      restockItems: false,
    });

    expect(result).toEqual({ refundId: 'refund-1' });
    expect(refundCreate.mock.calls[0]![0]).toMatchObject({
      data: { gymId: 'gym-1', orderId: 'order-1', paymentId: 'pay-1', amount: 1000 },
    });
    expect(paymentUpdate.mock.calls[0]![0]).toMatchObject({
      data: { refundedAmount: 1000, status: 'REFUNDED' },
    });
    expect(orderUpdate.mock.calls[0]![0]).toMatchObject({ data: { status: 'REFUNDED' } });
    expect(statusEventCreate.mock.calls[0]![0]).toMatchObject({
      data: { status: 'REFUNDED', actor: 'user-1' },
    });
  });

  it('records the operator on the refund row itself', async () => {
    const { service, refundCreate, gymMemberFindFirst } = adminSetup({
      orderFindFirst: {
        id: 'order-1',
        status: 'PAID',
        payment: { id: 'pay-1', amount: 1000, refundedAmount: 0 },
        items: [],
      },
    });

    await service.refundOrder('order-1', { amount: 1000, reason: 'Returned', restockItems: false });

    expect(gymMemberFindFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { id: true },
    });
    expect(refundCreate.mock.calls[0]![0]).toMatchObject({ data: { processedById: 'staff-1' } });
  });

  it('records the operator on a PARTIAL refund, which logs no status event to carry one', async () => {
    const { service, refundCreate, statusEventCreate } = adminSetup({
      orderFindFirst: {
        id: 'order-1',
        status: 'PAID',
        payment: { id: 'pay-1', amount: 1000, refundedAmount: 0 },
        items: [],
      },
    });

    await service.refundOrder('order-1', { amount: 400, reason: 'Partial', restockItems: false });

    // This is the case the order-level status event could never cover: a partial
    // refund writes no transition, so before this the operator was unrecorded.
    expect(statusEventCreate).not.toHaveBeenCalled();
    expect(refundCreate.mock.calls[0]![0]).toMatchObject({ data: { processedById: 'staff-1' } });
  });

  it('leaves the refund unattributed when the caller holds no membership at this gym', async () => {
    const { service, refundCreate } = adminSetup({
      staff: null,
      orderFindFirst: {
        id: 'order-1',
        status: 'PAID',
        payment: { id: 'pay-1', amount: 1000, refundedAmount: 0 },
        items: [],
      },
    });

    await service.refundOrder('order-1', { amount: 400, reason: 'Partial', restockItems: false });

    expect(refundCreate.mock.calls[0]![0]).toMatchObject({ data: { processedById: null } });
  });

  it('leaves a partial refund PAID without a status event', async () => {
    const { service, paymentUpdate, orderUpdate, statusEventCreate } = adminSetup({
      orderFindFirst: {
        id: 'order-1',
        status: 'PAID',
        payment: { id: 'pay-1', amount: 1000, refundedAmount: 0 },
        items: [],
      },
    });

    await service.refundOrder('order-1', { amount: 400, reason: 'Partial', restockItems: false });

    expect(paymentUpdate.mock.calls[0]![0]).toMatchObject({ data: { refundedAmount: 400 } });
    expect((paymentUpdate.mock.calls[0]![0] as { data: Record<string, unknown> }).data.status).toBe(
      undefined,
    );
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(statusEventCreate).not.toHaveBeenCalled();
  });

  it('restocks the sold variants when restockItems is set', async () => {
    const { service, productFindMany, productUpdate } = adminSetup({
      orderFindFirst: {
        id: 'order-1',
        status: 'PAID',
        payment: { id: 'pay-1', amount: 1000, refundedAmount: 0 },
        items: [
          { productVariantId: 'p1:0', qty: 3 },
          { productVariantId: 'p1:base', qty: 1 },
          { productVariantId: null, qty: 1 },
        ],
      },
      productFindMany: [
        { id: 'p1', variants: [{ name: 'S', sku: 'A', priceAmount: null, stock: 5 }], stock: null },
      ],
    });

    await service.refundOrder('order-1', { amount: 1000, reason: 'Returned', restockItems: true });

    expect(productFindMany).toHaveBeenCalledOnce();
    const updateArgs = productUpdate.mock.calls[0]![0] as {
      where: { id: string };
      data: { variants: Array<{ stock: number }> };
    };
    expect(updateArgs.where.id).toBe('p1');
    expect(updateArgs.data.variants[0]!.stock).toBe(8); // 5 + 3
  });

  it('records the restock in the product ledger, tied to the refunded order', async () => {
    // The counterpart to the SALE rows checkout writes: without this the history
    // would show stock rising with no explanation.
    const { service, movementCreateMany } = adminSetup({
      orderFindFirst: {
        id: 'order-1',
        status: 'PAID',
        payment: { id: 'pay-1', amount: 1000, refundedAmount: 0 },
        items: [{ productVariantId: 'p1:0', qty: 3 }],
      },
      productFindMany: [
        { id: 'p1', variants: [{ name: 'S', sku: 'A', priceAmount: null, stock: 5 }], stock: null },
      ],
    });

    await service.refundOrder('order-1', { amount: 1000, reason: 'Returned', restockItems: true });

    const args = movementCreateMany.mock.calls[0]![0] as {
      data: Array<Record<string, unknown>>;
    };
    expect(args.data).toEqual([
      expect.objectContaining({
        productId: 'p1',
        variantIndex: 0,
        variantLabel: 'S',
        delta: 3,
        resultingStock: 8,
        reason: 'REFUND_RESTOCK',
        orderId: 'order-1',
      }),
    ]);
  });

  it('does not credit units back to a product that was never counted', async () => {
    // The sale drew nothing down, so returning units would invent stock the gym
    // never said it had — and would silently start it tracking.
    const { service, productUpdate, movementCreateMany } = adminSetup({
      orderFindFirst: {
        id: 'order-1',
        status: 'PAID',
        payment: { id: 'pay-1', amount: 1000, refundedAmount: 0 },
        items: [{ productVariantId: 'p1:base', qty: 2 }],
      },
      productFindMany: [{ id: 'p1', variants: [], stock: null }],
    });

    await service.refundOrder('order-1', { amount: 1000, reason: 'Returned', restockItems: true });

    expect(productUpdate).not.toHaveBeenCalled();
    expect(movementCreateMany).not.toHaveBeenCalled();
  });

  it('does not touch stock when restockItems is false', async () => {
    const { service, productFindMany } = adminSetup({
      orderFindFirst: {
        id: 'order-1',
        status: 'PAID',
        payment: { id: 'pay-1', amount: 1000, refundedAmount: 0 },
        items: [{ productVariantId: 'p1:0', qty: 3 }],
      },
    });

    await service.refundOrder('order-1', { amount: 1000, reason: 'Damaged', restockItems: false });

    expect(productFindMany).not.toHaveBeenCalled();
  });
});

describe('OrdersService.streamOrdersCsv', () => {
  afterEach(() => vi.clearAllMocks());

  it('yields a header line then one line per order, paginating until drained', async () => {
    const { service, orderFindMany } = adminSetup();
    orderFindMany
      .mockResolvedValueOnce([orderRecord({ id: 'order-1', customerName: 'Ann, Lee' })])
      .mockResolvedValueOnce([]);

    const chunks: string[] = [];
    for await (const chunk of service.streamOrdersCsv({ page: 1, limit: 20 })) {
      chunks.push(chunk);
    }

    const csv = chunks.join('');
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe(
      'id,createdAt,channel,status,currency,total,refundedAmount,netTotal,paymentMethod,memberId,customerName,itemCount',
    );
    expect(lines).toHaveLength(2);
    // A value containing a comma is quoted per RFC 4180.
    expect(lines[1]).toContain('"Ann, Lee"');
    // Money is exported as major-unit decimals (1000 minor → 10.00) and the
    // per-row net (total − refunded) reconciles against the gross figures.
    expect(lines[1]).toContain(',USD,10.00,0.00,10.00,');
  });
});
