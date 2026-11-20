import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@fit/db';
import { MARKETING_MERGE_FIELD_DEFS } from '@fit/types';
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
    // Stage 7 exclusivity: NULL means "redeemable at every branch", which is what
    // almost every code holds — so it is the fixture's default.
    locationId: null,
    location: null,
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

/**
 * The gym row `catalog()` reads settings from — mutable per test, reset in
 * `beforeEach`. `null` models a tenant context pointing at a gym row that no
 * longer exists (e.g. a deleted gym).
 */
let gymRow: { name: string; settings: unknown } | null;

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
    gym: make({
      findFirst: vi.fn(() => Promise.resolve(gymRow)),
      findUnique: vi.fn(() => Promise.resolve(gymRow)),
      ...models?.gym,
    }),
    loyaltyLedgerEntry: make(),
    // Redemption writes the ledger row and bumps the counter together, so the
    // transaction runs its callback against this same mock client.
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(client)),
  };

  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym-1', userId: 'u-1' } as unknown as TenantContext;
  const service = new MarketingService(prisma, tenant);
  const mailer = {
    isConfigured: true,
    send: vi.fn(() => Promise.resolve({ sent: true, id: 'msg-1' })),
  };
  const sms = {
    isEnabled: vi.fn().mockResolvedValue(true),
    send: vi.fn().mockResolvedValue({ status: 'sent', messageId: 'sms1' }),
  };
  Object.assign(service, { mailer, sms });
  return { service, client, mailer, sms };
}

beforeEach(() => {
  gymRow = { name: 'FitSpace', settings: {} };
});

afterEach(() => vi.restoreAllMocks());

describe('MarketingService.catalog', () => {
  it('returns the channel catalog', async () => {
    const { service } = setup();
    const catalog = await service.catalog();
    expect(catalog.channels.map((c) => c.value)).toContain('email');
  });

  it('offers every built-in field by default', async () => {
    const { service } = setup();
    const catalog = await service.catalog();

    expect(catalog.mergeFields.some((m) => m.token === '{{first_name}}')).toBe(true);
    expect(catalog.mergeFields).toHaveLength(MARKETING_MERGE_FIELD_DEFS.length);
  });

  // The gym settings once carried a per-field switch list; the screen behind it is
  // gone, so a stale copy of those toggles left in a gym's stored settings must not
  // quietly keep a field out of the picker.
  it('ignores a legacy switch list left in the gym settings', async () => {
    gymRow!.settings = { marketingFields: { phone: false } };
    const { service } = setup();

    const catalog = await service.catalog();

    expect(catalog.mergeFields.some((m) => m.token === '{{phone}}')).toBe(true);
    expect(catalog.mergeFields).toHaveLength(MARKETING_MERGE_FIELD_DEFS.length);
  });

  // A retired token must never come back through the picker.
  it('never offers a retired token', async () => {
    const { service } = setup();
    const catalog = await service.catalog();

    expect(catalog.mergeFields.some((m) => m.token === '{{class_name}}')).toBe(false);
    expect(catalog.mergeFields.some((m) => m.token === '{{location}}')).toBe(false);
  });

  // A tenant context can point at a gym row that no longer exists (e.g. a
  // deleted gym); `findFirst` then resolves null, and the missing row must
  // fall through to the full default palette rather than throwing a 500.
  it('falls back to the default palette when the gym row is missing', async () => {
    gymRow = null;
    const { service } = setup();

    const catalog = await service.catalog();

    expect(catalog.mergeFields).toHaveLength(MARKETING_MERGE_FIELD_DEFS.length);
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

  it('honours a gym-wide code at any till, and at none', async () => {
    const { service } = setup({
      promoCode: { findFirst: vi.fn(() => Promise.resolve(promoRecord())) },
    });
    // A NULL branch on the code constrains nothing — the opposite of what a NULL
    // branch means on an order or a payment.
    expect((await service.validatePromoCode({ code: 'SPRING25', locationId: 'loc-9' })).valid).toBe(
      true,
    );
    expect((await service.validatePromoCode({ code: 'SPRING25' })).valid).toBe(true);
  });

  it('refuses a branch-exclusive code at another till', async () => {
    const { service } = setup({
      promoCode: { findFirst: vi.fn(() => Promise.resolve(promoRecord({ locationId: 'loc-1' }))) },
    });
    expect(
      (await service.validatePromoCode({ code: 'SPRING25', locationId: 'loc-2' })).reason,
    ).toBe('wrong_location');
    // Its own branch still works.
    expect((await service.validatePromoCode({ code: 'SPRING25', locationId: 'loc-1' })).valid).toBe(
      true,
    );
  });

  it('refuses a branch-exclusive code when the purchase has no branch', async () => {
    // The online shop sends none. Refusing is the conservative direction, the same
    // one `out_of_scope` takes for a purchase whose catalogue is unknown.
    const { service } = setup({
      promoCode: { findFirst: vi.fn(() => Promise.resolve(promoRecord({ locationId: 'loc-1' }))) },
    });
    expect((await service.validatePromoCode({ code: 'SPRING25' })).reason).toBe('wrong_location');
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

describe('MarketingService.listPromoCodes', () => {
  const whereOf = (client: ReturnType<typeof setup>['client']) =>
    client.promoCode.findMany.mock.calls[0]?.[0]?.where;

  it('lists every code in the gym when no branch is given', async () => {
    const { service, client } = setup({
      promoCode: {
        findMany: vi.fn(() =>
          Promise.resolve([promoRecord(), promoRecord({ id: 'promo-2', locationId: 'loc-1' })]),
        ),
      },
    });

    const res = await service.listPromoCodes();
    await service.listPromoCodes({ locationId: undefined });

    expect(res.data).toHaveLength(2);
    // "All branches" is no predicate at all — not an empty OR that matches nothing.
    expect(whereOf(client)).toEqual({});
    expect((client.promoCode.findMany.mock.calls[1]?.[0] as AnyArgs).where).toEqual({});
  });

  it("narrows to the branch's own codes AND every gym-wide one", async () => {
    const { service, client } = setup();

    await service.listPromoCodes({ locationId: 'loc-1' });

    // A NULL branch on a code means "redeemable everywhere", so equality alone would
    // hide nearly every code from every branch's view.
    expect(whereOf(client)).toEqual({
      AND: { OR: [{ locationId: null }, { locationId: 'loc-1' }] },
    });
  });

  it("matches nothing extra for another gym's branch id", async () => {
    const { service, client } = setup();

    await service.listPromoCodes({ locationId: 'loc-other-gym' });

    // The foreign id only adds a disjunct no row of THIS gym carries; the gym
    // itself is pinned by the tenant-scoped client, so at most the gym-wide codes
    // of the caller's own gym come back — never the other gym's.
    expect(whereOf(client)).not.toHaveProperty('gymId');
    expect(whereOf(client)).toEqual({
      AND: { OR: [{ locationId: null }, { locationId: 'loc-other-gym' }] },
    });
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
        // NULL is the Stage 7 default: redeemable at every branch.
        locationId: null,
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
  function deliverySetup(over: Record<string, unknown> = {}, members = 2) {
    return setup({
      campaign: {
        findFirst: vi.fn(() => Promise.resolve(campaignRecord(over))),
        update: vi.fn((a: AnyArgs) => Promise.resolve(campaignRecord(a.data))),
      },
      gymMember: {
        findMany: vi.fn(() =>
          Promise.resolve(
            Array.from({ length: members }, (_, i) => ({
              id: `m-${i}`,
              status: 'ACTIVE',
              joinedAt: new Date(),
              dateOfBirth: null,
              user: { name: i === 0 ? 'Nino' : 'Ana', email: `nino${i}@example.com`, phone: null },
              loyaltyLedger: [{ balanceAfter: i * 10 }],
              subscriptions: [],
              _count: { checkIns: 0 },
            })),
          ),
        ),
      },
    });
  }

  it('sends personalized mail to each recipient and counts provider acceptances', async () => {
    const { service, mailer } = deliverySetup({ subject: 'Hi {{first_name}}' });
    const result = await service.sendCampaign('camp-1');
    expect(mailer.send).toHaveBeenCalledTimes(2);
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'nino0@example.com',
        subject: 'Hi Nino',
        from: expect.stringContaining('FitSpace') as string,
      }),
    );
    expect(result).toMatchObject({ status: 'sent', audienceSize: 2, sentCount: 2 });
  });

  it('fills subject and body per recipient, blanks missing and unknown fields without N+1', async () => {
    const { service, client, mailer } = deliverySetup({
      subject: 'Hi {{firstName}} {{unknown}}',
      body: '{{member_first_name}}/{{membership_plan}}/{{phone}}/{{member_points_balance}}/{{typo}}',
    });
    await service.sendCampaign('camp-1');
    expect(mailer.send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        subject: 'Hi Nino ',
        text: 'Nino///0/',
      }),
    );
    expect(mailer.send).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        subject: 'Hi Ana ',
        text: 'Ana///10/',
      }),
    );
    expect(client.loyaltyLedgerEntry.findFirst).not.toHaveBeenCalled();
    expect(client.gymMember.findMany).toHaveBeenCalledTimes(1);
    expect(client.gymMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          loyaltyLedger: expect.objectContaining({
            where: { gymId: 'gym-1' },
            take: 1,
          }) as unknown,
        }) as unknown,
      }),
    );
  });

  it('previews filled member values without sending, scoped to the current gym', async () => {
    const { service, client, mailer } = deliverySetup();
    client.gymMember.findFirst.mockResolvedValueOnce({
      id: 'm-1',
      status: 'ACTIVE',
      joinedAt: new Date(),
      dateOfBirth: null,
      user: { name: 'Nino', email: 'nino@example.com', phone: null },
      subscriptions: [],
      loyaltyLedger: [],
      _count: { checkIns: 0 },
    });
    expect(
      await service.previewMessage({ subject: '{{firstName}}', body: '{{phone}}/{{bad}}' }),
    ).toEqual({ recipient: 'nino@example.com', subject: 'Nino', body: '/' });
    expect(client.gymMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { gymId: 'gym-1', deletedAt: null },
      }),
    );
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it.each(['push'])('does not pretend unsupported %s campaigns are delivered', async (channel) => {
    const { service, mailer } = deliverySetup({ channel });
    await expect(service.sendCampaign('camp-1')).rejects.toMatchObject({
      response: { code: 'CAMPAIGN_CHANNEL_UNSUPPORTED' },
    });
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('sends interpolated advertising SMS without a subject or email transport', async () => {
    const { service, sms, mailer } = deliverySetup({ channel: 'sms', body: 'Hi {{first_name}}' });
    mailer.isConfigured = false;
    expect(await service.sendCampaign('camp-1')).toMatchObject({ status: 'sent', sentCount: 2 });
    expect(sms.send).toHaveBeenNthCalledWith(1, 'gym-1', {
      to: null,
      content: 'Hi Nino',
      kind: 'advertising',
    });
    expect(mailer.send).not.toHaveBeenCalled();
  });
  it('rejects SMS before claiming a campaign when the provider is disabled', async () => {
    const { service, sms, client } = deliverySetup({ channel: 'sms' });
    sms.isEnabled.mockResolvedValue(false);
    await expect(service.sendCampaign('camp-1')).rejects.toMatchObject({
      response: { code: 'SMS_NOT_CONFIGURED' },
    });
    expect(client.campaign.updateMany).not.toHaveBeenCalled();
    expect(sms.send).not.toHaveBeenCalled();
  });
  it.each(['invalid_phone', 'not_configured', 'rejected', 'unreachable'])(
    'counts SMS failure %s and preserves partial delivery',
    async (reason) => {
      const { service, sms, client } = deliverySetup({ channel: 'sms' });
      sms.send.mockResolvedValueOnce({ status: 'skipped', reason });
      await expect(service.sendCampaign('camp-1')).rejects.toMatchObject({
        response: { code: 'SMS_SEND_FAILED', sentCount: 1, failedCount: 1 },
      });
      expect(client.campaign.update.mock.calls[0]?.[0]?.data).toMatchObject({
        status: 'sent',
        sentCount: 1,
      });
    },
  );
  it('does not send SMS after losing the atomic claim', async () => {
    const { service, sms, client } = deliverySetup({ channel: 'sms' });
    client.campaign.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.sendCampaign('camp-1')).rejects.toBeInstanceOf(ConflictException);
    expect(sms.send).not.toHaveBeenCalled();
  });

  it('records partial delivery and surfaces the failure', async () => {
    const { service, client, mailer } = deliverySetup();
    mailer.send.mockRejectedValueOnce(new Error('Provider rejected recipient'));
    await expect(service.sendCampaign('camp-1')).rejects.toMatchObject({
      response: { code: 'EMAIL_SEND_FAILED', sentCount: 1, failedCount: 1 },
    });
    expect(client.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'sent', sentCount: 1 }) as object,
      }),
    );
  });

  it('never reports missing configuration or an empty audience as sent', async () => {
    const empty = deliverySetup({}, 0);
    await expect(empty.service.sendCampaign('camp-1')).rejects.toMatchObject({
      response: { code: 'CAMPAIGN_NO_RECIPIENTS' },
    });
    expect(empty.client.campaign.update).not.toHaveBeenCalled();
    const disabled = deliverySetup();
    disabled.mailer.isConfigured = false;
    await expect(disabled.service.sendCampaign('camp-1')).rejects.toMatchObject({
      response: { code: 'EMAIL_NOT_CONFIGURED' },
    });
    expect(disabled.mailer.send).not.toHaveBeenCalled();
  });

  it.each(['sent', 'active'])('rejects duplicate delivery for %s campaigns', async (status) => {
    const { service, mailer } = deliverySetup({ status });
    await expect(service.sendCampaign('camp-1')).rejects.toBeInstanceOf(ConflictException);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('does not send if another request wins the atomic claim', async () => {
    const { service, client, mailer } = deliverySetup();
    client.campaign.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.sendCampaign('camp-1')).rejects.toBeInstanceOf(ConflictException);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('applies saved segment criteria and excludes trashed members', async () => {
    const { service, client } = deliverySetup({ audienceSegmentId: 'seg-1' });
    client.audienceSegment.findFirst.mockResolvedValueOnce({ criteria: { status: ['ACTIVE'] } });
    await service.sendCampaign('camp-1');
    expect(client.gymMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            expect.objectContaining({ status: { in: ['ACTIVE'] } }),
            { gymId: 'gym-1', deletedAt: null },
          ],
        },
      }),
    );
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
