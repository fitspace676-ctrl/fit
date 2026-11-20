// T5.3 — subscription enrolment service unit tests.
//
// A hand-rolled fake Prisma client (mirroring subscription-freeze.service.spec)
// drives the enrolment invariants: plan lookup + INACTIVE guard, the caller /
// member resolution, the one-live-subscription pre-check, the snapshotted price and
// computed period on the created row, and the P2002 race backstop. `new Date()` is
// pinned with fake timers so the period maths is deterministic.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ConflictException,
  ForbiddenException,
  type HttpException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SubscriptionPlanStatus, SubscriptionStatus } from '@fit/db';
import { SubscriptionEnrollmentService } from './subscription-enrollment.service';
import type { InvoiceService } from '../billing/invoice.service';
import type { OnlinePaymentsService } from '../payments/online-payments.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';

/** A subscription plan row as the enrolment projection selects it. */
interface PlanRecord {
  id: string;
  name: string;
  status: SubscriptionPlanStatus;
  priceAmount: number;
  currency: string;
  interval: 'MONTH' | 'YEAR';
  trialDays: number;
}

const plan = (over?: Partial<PlanRecord>): PlanRecord => ({
  id: 'plan-1',
  name: 'Premium',
  status: SubscriptionPlanStatus.ACTIVE,
  priceAmount: 12000,
  currency: 'GEL',
  interval: 'MONTH',
  trialDays: 0,
  ...over,
});

/** The row `subscription.create` echoes back (ENROLLED_SUBSCRIPTION_SELECT shape). */
const createdRow = (over?: Record<string, unknown>) => ({
  id: 'sub-new',
  status: SubscriptionStatus.ACTIVE,
  planId: 'plan-1',
  priceAmount: 12000,
  currency: 'GEL',
  interval: 'MONTH',
  currentPeriodStart: new Date('2026-06-01T00:00:00.000Z'),
  currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
  cancelAtPeriodEnd: false,
  createdAt: new Date('2026-06-01T00:00:00.000Z'),
  plan: { name: 'Premium' },
  ...over,
});

function setup(overrides?: {
  member?: { id: string } | null;
  plan?: PlanRecord | null;
  existingLive?: { id: string } | null;
  createError?: Error;
  gymId?: string | null;
  payments?: Partial<OnlinePaymentsService>;
}) {
  const memberFindFirst = vi.fn(() =>
    Promise.resolve(overrides?.member === undefined ? { id: 'member-1' } : overrides.member),
  );
  const planFindFirst = vi.fn(() =>
    Promise.resolve(overrides?.plan === undefined ? plan() : overrides.plan),
  );
  // The created row, read back by id after the shared `startSubscription` inserts it
  // (the live-slot pre-check is the other `findFirst`, keyed by member).
  let created: ReturnType<typeof createdRow> | null = null;
  const subscriptionFindFirst = vi.fn((args?: { where?: { id?: string } }) =>
    Promise.resolve(args?.where?.id ? created : (overrides?.existingLive ?? null)),
  );
  const subscriptionCreate = vi.fn((args: { data: Record<string, unknown> }) => {
    if (overrides?.createError) {
      return Promise.reject(overrides.createError);
    }
    created = createdRow({ ...args.data, plan: { name: 'Premium' } });
    return Promise.resolve({ id: created.id });
  });

  const client: Record<string, unknown> = {
    gymMember: { findFirst: memberFindFirst },
    subscriptionPlan: { findFirst: planFindFirst },
    subscription: { findFirst: subscriptionFindFirst, create: subscriptionCreate },
    $transaction: (cb: (tx: unknown) => unknown) => cb(client),
  };

  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = {
    userId: 'user-1',
    gymId: overrides?.gymId === undefined ? 'gym-1' : overrides.gymId,
  } as unknown as TenantContext;

  // A stubbed invoice mint: the numbering itself is proven in the InvoiceService /
  // billing suites, so here we only assert enrolment *invokes* it with the right
  // charge (and skips it for a trial).
  const invoiceIssue = vi.fn<
    (
      tx: unknown,
      input: unknown,
    ) => Promise<{ id: string; number: string; seq: number; year: number }>
  >(() => Promise.resolve({ id: 'inv-1', number: '2026-0001', seq: 1, year: 2026 }));
  // `payment_received` is announced through the invoice seam once the enrolment
  // transaction has committed (T12.5).
  const announcePaid = vi.fn<(input: unknown, issued: unknown) => void>();
  const invoices = { issue: invoiceIssue, announcePaid } as unknown as InvoiceService;

  return {
    service: new SubscriptionEnrollmentService(
      prisma,
      tenant,
      invoices,
      overrides?.payments as OnlinePaymentsService | undefined,
    ),
    memberFindFirst,
    planFindFirst,
    subscriptionFindFirst,
    subscriptionCreate,
    invoiceIssue,
    announcePaid,
  };
}

/** Run `promise`, returning the rejection so a test can assert on its type + code. */
async function rejection(promise: Promise<unknown>): Promise<HttpException> {
  return promise.then(
    () => {
      throw new Error('Expected the call to reject, but it resolved');
    },
    (error: HttpException) => error,
  );
}

const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
  code: 'P2002',
  clientVersion: 'test',
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SubscriptionEnrollmentService.enrollSelf', () => {
  it('enrols the calling member, snapshotting the plan price and computing the period', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
    const { service, subscriptionCreate, invoiceIssue } = setup();

    const result = await service.enrollSelf('plan-1');

    const data = subscriptionCreate.mock.calls[0]?.[0]?.data;
    expect(data).toMatchObject({
      gymId: 'gym-1',
      planId: 'plan-1',
      memberId: 'member-1',
      status: SubscriptionStatus.ACTIVE,
      priceAmount: 12000,
      currency: 'GEL',
      interval: 'MONTH',
      currentPeriodStart: new Date('2026-06-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
    });
    // A paid enrolment mints the first-period invoice inside the transaction, billed
    // for the snapshotted price against the created subscription.
    expect(invoiceIssue).toHaveBeenCalledTimes(1);
    expect(invoiceIssue.mock.calls[0]?.[1]).toMatchObject({
      gymId: 'gym-1',
      memberId: 'member-1',
      subscriptionId: 'sub-new',
      amount: 12000,
      currency: 'GEL',
      issuedAt: new Date('2026-06-01T00:00:00.000Z'),
    });
    expect(result.subscription).toMatchObject({
      id: 'sub-new',
      status: SubscriptionStatus.ACTIVE,
      planName: 'Premium',
      priceAmount: 12000,
      currency: 'GEL',
      interval: 'MONTH',
      currentPeriodStart: '2026-06-01T00:00:00.000Z',
      currentPeriodEnd: '2026-07-01T00:00:00.000Z',
      cancelAtPeriodEnd: false,
    });
  });

  it('403s when there is no member session', async () => {
    const tenantless = new SubscriptionEnrollmentService(
      { client: { gymMember: { findFirst: vi.fn() } } } as unknown as TenantPrismaService,
      { userId: null, gymId: 'gym-1' } as unknown as TenantContext,
      { issue: vi.fn() } as unknown as InvoiceService,
    );
    const error = await rejection(tenantless.enrollSelf('plan-1'));
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error.getResponse() as { code: string }).code).toBe('MEMBER_SESSION_REQUIRED');
  });

  it('403s when the caller is not a member of this gym', async () => {
    const { service } = setup({ member: null });
    const error = await rejection(service.enrollSelf('plan-1'));
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error.getResponse() as { code: string }).code).toBe('NOT_A_MEMBER');
  });

  it('404s when the plan does not exist', async () => {
    const { service, subscriptionCreate } = setup({ plan: null });
    const error = await rejection(service.enrollSelf('missing'));
    expect(error).toBeInstanceOf(NotFoundException);
    expect((error.getResponse() as { code: string }).code).toBe('SUBSCRIPTION_PLAN_NOT_FOUND');
    expect(subscriptionCreate).not.toHaveBeenCalled();
  });

  it('409s when the plan is inactive', async () => {
    const { service, subscriptionCreate } = setup({
      plan: plan({ status: SubscriptionPlanStatus.INACTIVE }),
    });
    const error = await rejection(service.enrollSelf('plan-1'));
    expect(error).toBeInstanceOf(ConflictException);
    expect((error.getResponse() as { code: string }).code).toBe('SUBSCRIPTION_PLAN_INACTIVE');
    expect(subscriptionCreate).not.toHaveBeenCalled();
  });

  it('409s when the member already holds a live subscription (pre-check)', async () => {
    const { service, subscriptionCreate } = setup({ existingLive: { id: 'sub-old' } });
    const error = await rejection(service.enrollSelf('plan-1'));
    expect(error).toBeInstanceOf(ConflictException);
    expect((error.getResponse() as { code: string }).code).toBe('ALREADY_SUBSCRIBED');
    expect(subscriptionCreate).not.toHaveBeenCalled();
  });

  it('maps a P2002 unique violation on create to 409 ALREADY_SUBSCRIBED (race backstop)', async () => {
    const { service } = setup({ createError: p2002 });
    const error = await rejection(service.enrollSelf('plan-1'));
    expect(error).toBeInstanceOf(ConflictException);
    expect((error.getResponse() as { code: string }).code).toBe('ALREADY_SUBSCRIBED');
  });

  it('advances a YEAR plan by a full year', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
    const { service, subscriptionCreate } = setup({ plan: plan({ interval: 'YEAR' }) });

    await service.enrollSelf('plan-1');

    expect(subscriptionCreate.mock.calls[0]?.[0]?.data).toMatchObject({
      interval: 'YEAR',
      currentPeriodEnd: new Date('2027-06-01T00:00:00.000Z'),
    });
  });

  it('starts a TRIAL for a plan with trialDays, ending the period at the trial end (T5.6)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
    const { service, subscriptionCreate, invoiceIssue } = setup({ plan: plan({ trialDays: 14 }) });

    const result = await service.enrollSelf('plan-1');

    const data = subscriptionCreate.mock.calls[0]?.[0]?.data;
    expect(data).toMatchObject({
      status: SubscriptionStatus.TRIAL,
      // The trial runs a fixed 14 days from enrolment; the paid terms are still
      // snapshotted so the first charge at trial end uses them.
      priceAmount: 12000,
      interval: 'MONTH',
      currentPeriodStart: new Date('2026-06-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-06-15T00:00:00.000Z'),
    });
    expect(result.subscription!.status).toBe(SubscriptionStatus.TRIAL);
    // A trial charges nothing yet, so no invoice is minted at enrolment — the
    // recurring-billing job raises the first one when the trial converts.
    expect(invoiceIssue).not.toHaveBeenCalled();
  });
});

describe('SubscriptionEnrollmentService.enrollMember', () => {
  it('enrols a validated member on a plan', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
    const { service, subscriptionCreate } = setup({ member: { id: 'member-42' } });

    const result = await service.enrollMember('member-42', 'plan-1');

    expect(subscriptionCreate.mock.calls[0]?.[0]?.data).toMatchObject({ memberId: 'member-42' });
    expect(result.subscription.status).toBe(SubscriptionStatus.ACTIVE);
  });

  it('404s when the member is not in this gym', async () => {
    const { service, subscriptionCreate } = setup({ member: null });
    const error = await rejection(service.enrollMember('ghost', 'plan-1'));
    expect(error).toBeInstanceOf(NotFoundException);
    expect((error.getResponse() as { code: string }).code).toBe('MEMBER_NOT_FOUND');
    expect(subscriptionCreate).not.toHaveBeenCalled();
  });
});

describe('SubscriptionEnrollmentService payment_received (T12.5)', () => {
  it('announces the first-period invoice after the enrolment commits', async () => {
    const { service, announcePaid } = setup();

    await service.enrollSelf('plan-1');

    expect(announcePaid).toHaveBeenCalledTimes(1);
    expect(announcePaid).toHaveBeenCalledWith(
      { gymId: 'gym-1' },
      expect.objectContaining({ id: 'inv-1' }),
    );
  });

  it('announces nothing for a TRIAL enrolment (no charge, no invoice)', async () => {
    const { service, announcePaid } = setup({ plan: plan({ trialDays: 7 }) });

    await service.enrollMember('member-1', 'plan-1');

    expect(announcePaid).not.toHaveBeenCalled();
  });

  it('announces nothing when the enrolment transaction rolls back', async () => {
    const { service, announcePaid } = setup({ createError: p2002 });

    await expect(service.enrollSelf('plan-1')).rejects.toBeInstanceOf(ConflictException);

    expect(announcePaid).not.toHaveBeenCalled();
  });
});

describe('SubscriptionEnrollmentService at a gym that takes Flitt', () => {
  const CREDS = { merchantId: '1549901', secretKey: 'test' };
  const ACTION = {
    status: 'requires_action' as const,
    orderId: 'order-1',
    checkoutUrl: 'https://pay.flitt.com/merchants/test/a-1',
    expiresAt: '2026-06-01T00:30:00.000Z',
  };

  function flittPayments() {
    const begin = vi.fn((_spec: unknown, _creds: unknown) =>
      Promise.resolve({ orderId: 'order-1', payment: ACTION }),
    );
    const retry = vi.fn(() => Promise.resolve(ACTION));
    const findOpenOrder = vi.fn(() => Promise.resolve(null as string | null));
    const payments = {
      purchaseMode: vi.fn(() => Promise.resolve({ mode: 'flitt' as const, credentials: CREDS })),
      begin,
      retry,
      findOpenOrder,
    } as unknown as Partial<OnlinePaymentsService>;
    return { payments, begin, retry, findOpenOrder };
  }

  it('opens a first-period order and creates no subscription before payment', async () => {
    const { payments, begin } = flittPayments();
    const { service, subscriptionCreate, invoiceIssue } = setup({ payments });

    const result = await service.purchaseSelf('plan-1', 'app');

    expect(result).toEqual({ subscriptionId: null, orderId: 'order-1', payment: ACTION });
    expect(subscriptionCreate).not.toHaveBeenCalled();
    expect(invoiceIssue).not.toHaveBeenCalled();
    expect(begin.mock.calls[0]![0]).toMatchObject({
      gymId: 'gym-1',
      memberId: 'member-1',
      purpose: 'subscription_start',
      returnTo: 'app',
      promo: null,
      fulfilment: {
        kind: 'subscription_start',
        planId: 'plan-1',
        planName: 'Premium',
        priceAmount: 12000,
        currency: 'GEL',
        interval: 'MONTH',
      },
      order: { total: 12000, currency: 'GEL', items: [{ label: 'Premium', amount: 12000 }] },
    });
    expect(begin.mock.calls[0]![1]).toBe(CREDS);
  });

  it('refuses with 409 ALREADY_SUBSCRIBED before opening any order', async () => {
    const { payments, begin } = flittPayments();
    const { service } = setup({ payments, existingLive: { id: 'sub-old' } });

    const error = await rejection(service.purchaseSelf('plan-1', 'web'));

    expect((error.getResponse() as { code: string }).code).toBe('ALREADY_SUBSCRIBED');
    expect(begin).not.toHaveBeenCalled();
  });

  it('hands back the open order for the same plan instead of a second one', async () => {
    const { payments, begin, retry, findOpenOrder } = flittPayments();
    findOpenOrder.mockResolvedValueOnce('order-open');
    const { service } = setup({ payments });

    const result = await service.purchaseSelf('plan-1', 'web');

    expect(result.orderId).toBe('order-open');
    expect(retry).toHaveBeenCalledWith({
      gymId: 'gym-1',
      orderId: 'order-open',
      memberId: 'member-1',
      returnTo: 'web',
    });
    expect(begin).not.toHaveBeenCalled();
  });

  it('starts a trial at once, stamped for manual payment', async () => {
    const { payments, begin } = flittPayments();
    const { service, subscriptionCreate } = setup({ payments, plan: plan({ trialDays: 7 }) });

    const result = await service.purchaseSelf('plan-1', 'web');

    expect(result.subscriptionId).toBe('sub-new');
    expect(subscriptionCreate.mock.calls[0]?.[0]?.data).toMatchObject({
      status: SubscriptionStatus.TRIAL,
      provider: 'flitt',
    });
    expect(begin).not.toHaveBeenCalled();
  });

  it('legacy POST /subscriptions applies the same policy: a paid plan opens a payment, enrols nothing', async () => {
    const { payments, begin } = flittPayments();
    const { service, subscriptionCreate } = setup({ payments });

    const result = await service.enrollSelf('plan-1', 'app');

    expect(result).toEqual({ subscription: null, orderId: 'order-1', payment: ACTION });
    expect(subscriptionCreate).not.toHaveBeenCalled();
    expect(begin.mock.calls[0]![0]).toMatchObject({
      purpose: 'subscription_start',
      returnTo: 'app',
    });
  });

  it('legacy POST /subscriptions still enrols a trial at once (provider flitt)', async () => {
    const { payments, begin } = flittPayments();
    const { service } = setup({ payments, plan: plan({ trialDays: 7 }) });

    const result = await service.enrollSelf('plan-1');

    expect(result.subscription).toMatchObject({ id: 'sub-new', status: SubscriptionStatus.TRIAL });
    expect(result.payment).toBeUndefined();
    expect(begin).not.toHaveBeenCalled();
  });

  it('legacy POST /subscriptions 409s ONLINE_PAYMENTS_UNAVAILABLE with neither Flitt nor stub', async () => {
    const payments = {
      purchaseMode: vi.fn(() =>
        Promise.reject(new ConflictException({ code: 'ONLINE_PAYMENTS_UNAVAILABLE' })),
      ),
    };
    const { service, subscriptionCreate } = setup({
      payments: payments as unknown as Partial<OnlinePaymentsService>,
    });

    const error = await rejection(service.enrollSelf('plan-1'));

    expect((error.getResponse() as { code: string }).code).toBe('ONLINE_PAYMENTS_UNAVAILABLE');
    expect(subscriptionCreate).not.toHaveBeenCalled();
  });

  it('legacy POST /subscriptions is unchanged in stub mode', async () => {
    const payments = {
      purchaseMode: vi.fn(() => Promise.resolve({ mode: 'stub' as const })),
      begin: vi.fn(),
    };
    const { service } = setup({ payments: payments as unknown as Partial<OnlinePaymentsService> });

    const result = await service.enrollSelf('plan-1');

    expect(Object.keys(result)).toEqual(['subscription']);
    expect(result.subscription).toMatchObject({ id: 'sub-new', status: SubscriptionStatus.ACTIVE });
    expect(payments.begin).not.toHaveBeenCalled();
  });

  it('keeps the stub enrolment byte-for-byte when the purchase mode is stub', async () => {
    const payments = {
      purchaseMode: vi.fn(() => Promise.resolve({ mode: 'stub' as const })),
      begin: vi.fn(),
    };
    const { service, subscriptionCreate } = setup({
      payments: payments as unknown as Partial<OnlinePaymentsService>,
    });

    const result = await service.purchaseSelf('plan-1', 'web');

    expect(result).toEqual({ subscriptionId: 'sub-new', orderId: null });
    expect(subscriptionCreate.mock.calls[0]?.[0]?.data).toMatchObject({ provider: 'stub' });
    expect(payments.begin).not.toHaveBeenCalled();
  });

  it('409s ONLINE_PAYMENTS_UNAVAILABLE when the gym has neither Flitt nor the stub', async () => {
    const payments = {
      purchaseMode: vi.fn(() =>
        Promise.reject(new ConflictException({ code: 'ONLINE_PAYMENTS_UNAVAILABLE' })),
      ),
    };
    const { service, subscriptionCreate } = setup({
      payments: payments as unknown as Partial<OnlinePaymentsService>,
    });

    const error = await rejection(service.purchaseSelf('plan-1', 'web'));

    expect((error.getResponse() as { code: string }).code).toBe('ONLINE_PAYMENTS_UNAVAILABLE');
    expect(subscriptionCreate).not.toHaveBeenCalled();
  });
});
