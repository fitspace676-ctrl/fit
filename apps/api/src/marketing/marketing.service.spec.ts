import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@fit/db';
import { MarketingService } from './marketing.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';

interface AnyArgs {
  where?: Record<string, unknown>;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

/** A promo row as the service's `toPromoRow` expects it. */
function promoRecord(over?: Record<string, unknown>) {
  return {
    id: 'promo-1',
    code: 'SPRING25',
    description: '',
    discountType: 'percentage',
    discountValue: 25,
    minPurchase: null,
    usageLimit: 100,
    usedCount: 10,
    appliesTo: 'all',
    startsAt: null,
    expiryDate: null,
    oncePerMember: false,
    status: 'active',
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    ...over,
  };
}

function campaignRecord(over?: Record<string, unknown>) {
  return {
    id: 'camp-1',
    name: 'Spring Blast',
    channel: 'email',
    audienceSegmentId: null,
    inlineCriteria: null,
    subject: 'Hi',
    body: 'Body',
    scheduleType: 'now',
    scheduledAt: null,
    status: 'draft',
    audienceSize: 0,
    sentCount: 0,
    sentAt: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    createdBy: { id: 'u-1', name: 'Nino', email: 'nino@example.com' },
    ...over,
  };
}

function setup(models?: Record<string, Record<string, unknown>>) {
  const make = (overrides?: Record<string, unknown>) => ({
    findMany: vi.fn<(a: AnyArgs) => Promise<unknown[]>>(() => Promise.resolve([])),
    findFirst: vi.fn<(a: AnyArgs) => Promise<unknown>>(() => Promise.resolve(null)),
    count: vi.fn<(a: AnyArgs) => Promise<number>>(() => Promise.resolve(0)),
    create: vi.fn<(a: AnyArgs) => Promise<unknown>>((a) => Promise.resolve(a.data)),
    update: vi.fn<(a: AnyArgs) => Promise<unknown>>((a) => Promise.resolve(a.data)),
    updateMany: vi.fn<(a: AnyArgs) => Promise<{ count: number }>>(() =>
      Promise.resolve({ count: 1 }),
    ),
    delete: vi.fn<(a: AnyArgs) => Promise<unknown>>(() => Promise.resolve({})),
    groupBy: vi.fn<(a: AnyArgs) => Promise<unknown[]>>(() => Promise.resolve([])),
    ...overrides,
  });

  const client = {
    audienceSegment: make(models?.audienceSegment),
    messageTemplate: make(models?.messageTemplate),
    promoCode: make(models?.promoCode),
    campaign: make(models?.campaign),
    gymMember: make(models?.gymMember),
    booking: make(models?.booking),
    order: make(models?.order),
    promoRedemption: make(models?.promoRedemption),
    // Redemption writes the ledger row and bumps the counter together, so the
    // transaction runs its callback against this same mock client.
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(client)),
  };

  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym-1', userId: 'u-1' } as unknown as TenantContext;
  return { service: new MarketingService(prisma, tenant), client };
}

afterEach(() => vi.restoreAllMocks());

describe('MarketingService.catalog', () => {
  it('returns the channel + merge-field catalogs', () => {
    const { service } = setup();
    const catalog = service.catalog();
    expect(catalog.channels.map((c) => c.value)).toContain('email');
    expect(catalog.mergeFields.some((m) => m.token === '{{first_name}}')).toBe(true);
  });
});

describe('MarketingService promo validate/redeem', () => {
  it('validates an active, in-limit code and computes a percentage discount', async () => {
    const { service, client } = setup({
      promoCode: {
        findFirst: vi.fn(() => Promise.resolve(promoRecord({ discountValue: 25 }))),
      },
    });
    const res = await service.validatePromoCode({ code: 'spring25', amount: 10000 });
    expect(res.valid).toBe(true);
    expect(res.discountAmount).toBe(2500);
    // matched case-insensitively
    const call = (client.promoCode.findFirst as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as
      | AnyArgs
      | undefined;
    expect(call?.where?.code).toEqual({ equals: 'spring25', mode: 'insensitive' });
  });

  it('rejects an unknown code as not_found', async () => {
    const { service } = setup();
    const res = await service.validatePromoCode({ code: 'NOPE' });
    expect(res).toEqual({ valid: false, reason: 'not_found' });
  });

  it('rejects an inactive code', async () => {
    const { service } = setup({
      promoCode: { findFirst: vi.fn(() => Promise.resolve(promoRecord({ status: 'inactive' }))) },
    });
    expect((await service.validatePromoCode({ code: 'SPRING25' })).reason).toBe('inactive');
  });

  it('rejects an expired code', async () => {
    const { service } = setup({
      promoCode: {
        findFirst: vi.fn(() =>
          Promise.resolve(promoRecord({ expiryDate: new Date('2020-01-01T00:00:00.000Z') })),
        ),
      },
    });
    expect((await service.validatePromoCode({ code: 'SPRING25' })).reason).toBe('expired');
  });

  it('rejects a used-up code', async () => {
    const { service } = setup({
      promoCode: {
        findFirst: vi.fn(() => Promise.resolve(promoRecord({ usageLimit: 10, usedCount: 10 }))),
      },
    });
    expect((await service.validatePromoCode({ code: 'SPRING25' })).reason).toBe(
      'usage_limit_reached',
    );
  });

  it('rejects below the minimum purchase', async () => {
    const { service } = setup({
      promoCode: {
        findFirst: vi.fn(() => Promise.resolve(promoRecord({ minPurchase: 5000 }))),
      },
    });
    expect((await service.validatePromoCode({ code: 'SPRING25', amount: 1000 })).reason).toBe(
      'below_min_purchase',
    );
  });

  it('redeem increments usedCount only while under the limit', async () => {
    const updateMany = vi.fn((_a: AnyArgs) => Promise.resolve({ count: 1 }));
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(promoRecord({ usageLimit: 100, usedCount: 10 }))
      .mockResolvedValueOnce(promoRecord({ usageLimit: 100, usedCount: 11 }));
    const { service } = setup({ promoCode: { findFirst, updateMany } });
    const res = await service.redeemPromoCode({ code: 'SPRING25', amount: 10000 });
    expect(res.discountAmount).toBe(2500);
    expect(res.promo.usedCount).toBe(11);
    const guard = updateMany.mock.calls[0]?.[0].where as Record<string, unknown>;
    expect(guard.usedCount).toEqual({ lt: 100 });
  });

  it('redeem throws 409 when the atomic guard finds the limit already hit', async () => {
    const findFirst = vi.fn(() => Promise.resolve(promoRecord({ usageLimit: 100, usedCount: 50 })));
    const updateMany = vi.fn(() => Promise.resolve({ count: 0 }));
    const { service } = setup({ promoCode: { findFirst, updateMany } });
    await expect(service.redeemPromoCode({ code: 'SPRING25' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('redeem throws 409 for an invalid (inactive) code', async () => {
    const { service } = setup({
      promoCode: { findFirst: vi.fn(() => Promise.resolve(promoRecord({ status: 'inactive' }))) },
    });
    await expect(service.redeemPromoCode({ code: 'SPRING25' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('MarketingService promo create conflicts', () => {
  it('rejects a duplicate code (case-insensitive) with 409', async () => {
    const { service } = setup({
      promoCode: { findFirst: vi.fn(() => Promise.resolve(promoRecord())) },
    });
    await expect(
      service.createPromoCode({
        code: 'spring25',
        description: '',
        discountType: 'percentage',
        discountValue: 20,
        appliesTo: 'all',
        oncePerMember: false,
        status: 'active',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('MarketingService.buildMemberWhere (via previewCriteria)', () => {
  it('maps status, plan, join date, and last-visit criteria to a member where', async () => {
    const count = vi.fn((_a: AnyArgs) => Promise.resolve(3));
    const findMany = vi.fn(() => Promise.resolve([]));
    const { service, client } = setup({ gymMember: { count, findMany } });
    await service.previewCriteria({
      criteria: {
        status: ['ACTIVE'],
        membershipPlanIds: ['plan-1'],
        joinedAfter: '2026-01-01T00:00:00.000Z',
        notVisitedForDays: 30,
      },
    });
    const where = count.mock.calls[0]?.[0].where as Record<string, unknown>;
    expect(where.role).toBe('MEMBER');
    expect(where.status).toEqual({ in: ['ACTIVE'] });
    expect(where.subscriptions).toBeDefined();
    expect(where.joinedAt).toHaveProperty('gte');
    expect(Array.isArray(where.AND)).toBe(true);
    expect(client.gymMember.findMany).toHaveBeenCalledOnce();
  });

  it('intersects aggregate-threshold ids into the where', async () => {
    const count = vi.fn((_a: AnyArgs) => Promise.resolve(1));
    const bookingGroupBy = vi.fn(() =>
      Promise.resolve([
        { memberId: 'm-1', _count: { id: 5 } },
        { memberId: 'm-2', _count: { id: 1 } },
      ]),
    );
    const orderGroupBy = vi.fn(() =>
      Promise.resolve([
        { memberId: 'm-1', _sum: { total: 9000 } },
        { memberId: 'm-3', _sum: { total: 100 } },
      ]),
    );
    const { service } = setup({
      gymMember: { count, findMany: vi.fn(() => Promise.resolve([])) },
      booking: { groupBy: bookingGroupBy },
      order: { groupBy: orderGroupBy },
    });
    await service.previewCriteria({ criteria: { minClassAttendance: 3, minSpent: 5000 } });
    const where = count.mock.calls[0]?.[0].where as Record<string, unknown>;
    // m-1 clears both thresholds; m-2/m-3 clear only one → intersection = [m-1]
    expect(where.id).toEqual({ in: ['m-1'] });
  });

  it('samples matching members with name falling back to email', async () => {
    const findMany = vi.fn(() =>
      Promise.resolve([
        { id: 'm-1', user: { name: 'Ana', email: 'ana@example.com' } },
        { id: 'm-2', user: { name: null, email: 'no-name@example.com' } },
      ]),
    );
    const { service } = setup({ gymMember: { count: vi.fn(() => Promise.resolve(2)), findMany } });
    const res = await service.previewCriteria({ criteria: {} });
    expect(res.count).toBe(2);
    expect(res.sample[0]).toEqual({ id: 'm-1', name: 'Ana', email: 'ana@example.com' });
    expect(res.sample[1]?.name).toBe('no-name@example.com');
  });
});

describe('MarketingService.sendCampaign', () => {
  it('resolves the audience, marks sent, and snapshots sentCount', async () => {
    const findFirst = vi.fn(() => Promise.resolve(campaignRecord()));
    const update = vi.fn((a: AnyArgs) => Promise.resolve(campaignRecord(a.data)));
    const memberCount = vi.fn((_a: AnyArgs) => Promise.resolve(42));
    const { service } = setup({
      campaign: { findFirst, update },
      gymMember: { count: memberCount },
    });
    const res = await service.sendCampaign('camp-1');
    expect(res.status).toBe('sent');
    expect(res.audienceSize).toBe(42);
    expect(res.sentCount).toBe(42);
    expect(res.sentAt).not.toBeNull();
  });

  it('rejects sending an already-sent campaign', async () => {
    const findFirst = vi.fn(() => Promise.resolve(campaignRecord({ status: 'sent' })));
    const { service } = setup({ campaign: { findFirst } });
    await expect(service.sendCampaign('camp-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('resolves a segment-targeted campaign via the segment criteria', async () => {
    const findFirst = vi.fn(() => Promise.resolve(campaignRecord({ audienceSegmentId: 'seg-1' })));
    const segFindFirst = vi.fn(() =>
      Promise.resolve({
        id: 'seg-1',
        name: 'VIP',
        criteria: { status: ['ACTIVE'] },
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    const memberCount = vi.fn((_a: AnyArgs) => Promise.resolve(7));
    const { service } = setup({
      campaign: {
        findFirst,
        update: vi.fn((a: AnyArgs) => Promise.resolve(campaignRecord(a.data))),
      },
      audienceSegment: { findFirst: segFindFirst },
      gymMember: { count: memberCount },
    });
    const res = await service.sendCampaign('camp-1');
    expect(res.sentCount).toBe(7);
    const where = memberCount.mock.calls[0]?.[0].where as Record<string, unknown>;
    expect(where.status).toEqual({ in: ['ACTIVE'] });
  });
});

describe('MarketingService.createCampaign', () => {
  it('404s when the named segment does not exist', async () => {
    const { service } = setup({
      audienceSegment: { findFirst: vi.fn(() => Promise.resolve(null)) },
    });
    await expect(
      service.createCampaign({
        name: 'Blast',
        channel: 'email',
        audienceSegmentId: 'missing',
        body: '',
        scheduleType: 'now',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('stores inline criteria and the session author', async () => {
    const create = vi.fn((a: AnyArgs) => Promise.resolve(campaignRecord(a.data)));
    const { service } = setup({ campaign: { create } });
    await service.createCampaign({
      name: 'Blast',
      channel: 'email',
      inlineCriteria: { status: ['ACTIVE'] },
      body: 'Hi',
      scheduleType: 'now',
    });
    const data = create.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(data.createdById).toBe('u-1');
    expect(data.gymId).toBe('gym-1');
    expect(data.inlineCriteria).toEqual({ status: ['ACTIVE'] });
  });

  it('clears inline criteria to Prisma.DbNull when null', async () => {
    const create = vi.fn((a: AnyArgs) => Promise.resolve(campaignRecord(a.data)));
    const { service } = setup({ campaign: { create } });
    await service.createCampaign({
      name: 'Blast',
      channel: 'email',
      inlineCriteria: null,
      body: '',
      scheduleType: 'now',
    });
    const data = create.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(data.inlineCriteria).toBe(Prisma.DbNull);
  });
});

describe('MarketingService.saveCampaignAsTemplate', () => {
  it('creates a template from the campaign message', async () => {
    const findFirst = vi.fn(() =>
      Promise.resolve(campaignRecord({ subject: 'Subj', body: 'Body', channel: 'email' })),
    );
    const create = vi.fn((a: AnyArgs) =>
      Promise.resolve({
        id: 't-1',
        name: (a.data as Record<string, unknown>).name,
        channel: 'email',
        subject: 'Subj',
        body: 'Body',
        category: 'Promos',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    const { service } = setup({ campaign: { findFirst }, messageTemplate: { create } });
    const res = await service.saveCampaignAsTemplate('camp-1', {
      name: 'My Tpl',
      category: 'Promos',
    });
    expect(res.name).toBe('My Tpl');
    expect(res.body).toBe('Body');
    const data = create.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(data.channel).toBe('email');
    expect(data.subject).toBe('Subj');
  });
});

describe('MarketingService not-found guards', () => {
  it('404s previewing an unknown segment', async () => {
    const { service } = setup();
    await expect(service.previewSegment('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s getting an unknown campaign', async () => {
    const { service } = setup();
    await expect(service.getCampaign('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
