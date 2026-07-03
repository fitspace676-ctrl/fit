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
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';

/** A subscription plan row as the enrolment projection selects it. */
interface PlanRecord {
  id: string;
  status: SubscriptionPlanStatus;
  priceAmount: number;
  currency: string;
  interval: 'MONTH' | 'YEAR';
}

const plan = (over?: Partial<PlanRecord>): PlanRecord => ({
  id: 'plan-1',
  status: SubscriptionPlanStatus.ACTIVE,
  priceAmount: 12000,
  currency: 'GEL',
  interval: 'MONTH',
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
}) {
  const memberFindFirst = vi.fn(() =>
    Promise.resolve(overrides?.member === undefined ? { id: 'member-1' } : overrides.member),
  );
  const planFindFirst = vi.fn(() =>
    Promise.resolve(overrides?.plan === undefined ? plan() : overrides.plan),
  );
  const subscriptionFindFirst = vi.fn(() => Promise.resolve(overrides?.existingLive ?? null));
  const subscriptionCreate = vi.fn((args: { data: Record<string, unknown> }) => {
    if (overrides?.createError) {
      return Promise.reject(overrides.createError);
    }
    return Promise.resolve(createdRow({ ...args.data, plan: { name: 'Premium' } }));
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

  return {
    service: new SubscriptionEnrollmentService(prisma, tenant),
    memberFindFirst,
    planFindFirst,
    subscriptionFindFirst,
    subscriptionCreate,
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
    const { service, subscriptionCreate } = setup();

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
