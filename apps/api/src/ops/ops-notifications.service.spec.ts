import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockEnv } = vi.hoisted(() => {
  const mockEnv: Record<string, unknown> = {};
  return { mockEnv };
});
vi.mock('../config/env', () => ({ env: mockEnv }));

import { Role } from '@fit/db';
import type { DailySummary, EmailService, LowStockDigest } from '../auth/email.service';
import { OpsNotificationsService } from './ops-notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';

/** A gym row as both sweeps' `select` projects it. */
function gym(id: string, name: string, settings: unknown = {}) {
  return { id, name, settings };
}

/** A staff `GymMember` row as `recipientsFor`'s `select` projects it. */
function staff(email: string, name: string | null = null) {
  return { user: { email, name } };
}

/** A product row as `lowStockProductsFor`'s `select` projects it (variants as JSON). */
function product(name: string, variants: Array<{ name: string; stock: number; sku?: string }>) {
  return {
    name,
    variants: variants.map((v) => ({
      name: v.name,
      sku: v.sku ?? '',
      priceAmount: null,
      stock: v.stock,
    })),
  };
}

/** Build a service with fully-mocked collaborators + the delegate spies. */
function setup(
  options: {
    lowStockEnabled?: boolean;
    dailyEnabled?: boolean;
    configured?: boolean;
    lock?: 'OK' | null;
    threshold?: number;
    adminUrl?: string;
    lowStockSend?: (email: string) => boolean | Promise<boolean>;
    dailySend?: (email: string) => boolean | Promise<boolean>;
  } = {},
) {
  const {
    lowStockEnabled = true,
    dailyEnabled = true,
    configured = true,
    lock = 'OK',
    threshold = 5,
    adminUrl,
    lowStockSend = () => true,
    dailySend = () => true,
  } = options;

  for (const key of Object.keys(mockEnv)) delete mockEnv[key];
  Object.assign(mockEnv, {
    OPS_LOW_STOCK_DIGEST_ENABLED: lowStockEnabled,
    OPS_DAILY_SUMMARY_ENABLED: dailyEnabled,
    OPS_LOW_STOCK_THRESHOLD: threshold,
    ADMIN_URL: adminUrl,
  });

  const gymFindMany =
    vi.fn<(args: unknown) => Promise<Array<{ id: string; name: string; settings: unknown }>>>();
  const gymMemberFindMany =
    vi.fn<
      (args: {
        where: Record<string, unknown>;
      }) => Promise<Array<{ user: { email: string; name: string | null } }>>
    >();
  const gymMemberCount = vi
    .fn<(args: { where: Record<string, unknown> }) => Promise<number>>()
    .mockResolvedValue(0);
  const productFindMany = vi
    .fn<(args: unknown) => Promise<Array<{ name: string; variants: unknown }>>>()
    .mockResolvedValue([]);
  const paymentAggregate = vi
    .fn<(args: unknown) => Promise<{ _sum: { amount: number | null } }>>()
    .mockResolvedValue({ _sum: { amount: 0 } });
  const orderCount = vi.fn<(args: unknown) => Promise<number>>().mockResolvedValue(0);
  const checkInCount = vi.fn<(args: unknown) => Promise<number>>().mockResolvedValue(0);

  const prisma = {
    client: {
      gym: { findMany: gymFindMany },
      gymMember: { findMany: gymMemberFindMany, count: gymMemberCount },
      product: { findMany: productFindMany },
      payment: { aggregate: paymentAggregate },
      order: { count: orderCount },
      checkIn: { count: checkInCount },
    },
  } as unknown as PrismaService;

  const sendLowStockDigestEmail = vi.fn(
    (email: string, _digest: LowStockDigest): Promise<boolean> =>
      Promise.resolve(lowStockSend(email)),
  );
  const sendDailySummaryEmail = vi.fn(
    (email: string, _summary: DailySummary): Promise<boolean> => Promise.resolve(dailySend(email)),
  );
  const email = {
    get isConfigured() {
      return configured;
    },
    sendLowStockDigestEmail,
    sendDailySummaryEmail,
  } as unknown as EmailService;

  const set = vi.fn<(...args: unknown[]) => Promise<'OK' | null>>().mockResolvedValue(lock);
  const redis = { client: { set } } as unknown as RedisService;

  return {
    service: new OpsNotificationsService(prisma, email, redis),
    gymFindMany,
    gymMemberFindMany,
    gymMemberCount,
    productFindMany,
    paymentAggregate,
    orderCount,
    checkInCount,
    sendLowStockDigestEmail,
    sendDailySummaryEmail,
    set,
  };
}

describe('OpsNotificationsService.sweepLowStock', () => {
  afterEach(() => vi.restoreAllMocks());

  it('emails every OWNER/MANAGER of each gym with low stock and tallies the sends', async () => {
    const s = setup();
    s.gymFindMany.mockResolvedValue([gym('g1', 'Downtown'), gym('g2', 'Uptown')]);
    s.gymMemberFindMany
      .mockResolvedValueOnce([staff('owner@g1', 'Owner'), staff('mgr@g1', 'Manager')])
      .mockResolvedValueOnce([staff('owner@g2')]);
    s.productFindMany
      .mockResolvedValueOnce([product('Bar', [{ name: 'Choc', stock: 1 }])])
      .mockResolvedValueOnce([product('Shaker', [{ name: '600ml', stock: 0 }])]);

    const summary = await s.service.sweepLowStock();

    expect(summary).toMatchObject({
      job: 'low-stock',
      gymsProcessed: 2,
      gymsWithRecipients: 2,
      gymsReported: 2,
      emailsSent: 3,
      emailsSkipped: 0,
      emailsFailed: 0,
    });
    expect(s.sendLowStockDigestEmail.mock.calls.map((c) => c[0])).toEqual([
      'owner@g1',
      'mgr@g1',
      'owner@g2',
    ]);
  });

  it('skips a gym with no eligible recipients without scanning its products', async () => {
    const s = setup();
    s.gymFindMany.mockResolvedValue([gym('g1', 'Downtown')]);
    s.gymMemberFindMany.mockResolvedValue([]);

    const summary = await s.service.sweepLowStock();

    expect(summary.gymsWithRecipients).toBe(0);
    expect(s.productFindMany).not.toHaveBeenCalled();
    expect(s.sendLowStockDigestEmail).not.toHaveBeenCalled();
  });

  it('scopes the recipient query to OWNER/MANAGER, ACTIVE, verified email', async () => {
    const s = setup();
    s.gymFindMany.mockResolvedValue([gym('g1', 'Downtown')]);
    s.gymMemberFindMany.mockResolvedValue([staff('owner@g1', 'Owner')]);

    await s.service.sweepLowStock();

    const where = s.gymMemberFindMany.mock.calls[0]![0].where;
    expect(where.gymId).toBe('g1');
    expect(where.role).toEqual({ in: [Role.OWNER, Role.MANAGER] });
    expect(where.status).toBe('ACTIVE');
    expect(where.user).toEqual({ emailVerifiedAt: { not: null } });
  });

  it('skips a gym whose products are all above the threshold (nothing to reorder)', async () => {
    const s = setup({ threshold: 5 });
    s.gymFindMany.mockResolvedValue([gym('g1', 'Downtown')]);
    s.gymMemberFindMany.mockResolvedValue([staff('owner@g1', 'Owner')]);
    s.productFindMany.mockResolvedValue([product('Bar', [{ name: 'Choc', stock: 20 }])]);

    const summary = await s.service.sweepLowStock();

    expect(summary.gymsWithRecipients).toBe(1);
    expect(summary.gymsReported).toBe(0);
    expect(s.sendLowStockDigestEmail).not.toHaveBeenCalled();
  });

  it('keeps only the variants at/below the threshold and leads with the most urgent product', async () => {
    const s = setup({ threshold: 5 });
    s.gymFindMany.mockResolvedValue([gym('g1', 'Downtown')]);
    s.gymMemberFindMany.mockResolvedValue([staff('owner@g1', 'Owner')]);
    s.productFindMany.mockResolvedValue([
      product('Shaker', [{ name: '600ml', stock: 5 }]),
      product('Bar', [
        { name: 'Choc', stock: 0 },
        { name: 'Vanilla', stock: 8 },
      ]),
    ]);

    await s.service.sweepLowStock();

    const digest = s.sendLowStockDigestEmail.mock.calls[0]![1];
    expect(digest.threshold).toBe(5);
    // Most-urgent product (lowest stock) first.
    expect(digest.products.map((p) => p.name)).toEqual(['Bar', 'Shaker']);
    // The above-threshold Vanilla variant is dropped.
    expect(digest.products[0]!.variants).toEqual([{ label: 'Choc', stock: 0 }]);
  });

  it('passes the ADMIN_URL products link into the digest when set', async () => {
    const s = setup({ adminUrl: 'https://admin.fit/' });
    s.gymFindMany.mockResolvedValue([gym('g1', 'Downtown')]);
    s.gymMemberFindMany.mockResolvedValue([staff('owner@g1', 'Owner')]);
    s.productFindMany.mockResolvedValue([product('Bar', [{ name: 'Choc', stock: 1 }])]);

    await s.service.sweepLowStock();

    expect(s.sendLowStockDigestEmail.mock.calls[0]![1].productsUrl).toBe(
      'https://admin.fit/products',
    );
  });

  it('tallies a no-op send (Resend unconfigured) as skipped, not sent', async () => {
    const s = setup({ lowStockSend: () => false });
    s.gymFindMany.mockResolvedValue([gym('g1', 'Downtown')]);
    s.gymMemberFindMany.mockResolvedValue([staff('owner@g1', 'Owner')]);
    s.productFindMany.mockResolvedValue([product('Bar', [{ name: 'Choc', stock: 1 }])]);

    const summary = await s.service.sweepLowStock();

    expect(summary.emailsSent).toBe(0);
    expect(summary.emailsSkipped).toBe(1);
  });

  it('counts a throwing send as failed and continues the sweep', async () => {
    const s = setup({
      lowStockSend: (email) => {
        if (email === 'owner@g1') throw new Error('resend 500');
        return true;
      },
    });
    s.gymFindMany.mockResolvedValue([gym('g1', 'Downtown')]);
    s.gymMemberFindMany.mockResolvedValue([staff('owner@g1', 'Owner'), staff('mgr@g1', 'Manager')]);
    s.productFindMany.mockResolvedValue([product('Bar', [{ name: 'Choc', stock: 1 }])]);

    const summary = await s.service.sweepLowStock();

    expect(summary.emailsFailed).toBe(1);
    expect(summary.emailsSent).toBe(1);
  });
});

describe('OpsNotificationsService.sweepDailySummary', () => {
  afterEach(() => vi.restoreAllMocks());

  // 2026-07-05T09:00:00Z is still 2026-07-05 in every zone at/east of UTC-9.
  const now = new Date('2026-07-05T09:00:00Z');

  it('emails the day figures to each gym and skips a completely quiet day', async () => {
    const s = setup();
    s.gymFindMany.mockResolvedValue([
      gym('g1', 'Downtown', { locale: { currency: 'USD', timezone: 'UTC' } }),
      gym('g2', 'Quiet'),
    ]);
    s.gymMemberFindMany
      .mockResolvedValueOnce([staff('owner@g1', 'Owner')])
      .mockResolvedValueOnce([staff('owner@g2', 'Owner')]);
    // g1 had activity; g2's mocks stay at the zero defaults (a quiet day).
    s.paymentAggregate.mockResolvedValueOnce({ _sum: { amount: 12500 } });
    s.orderCount.mockResolvedValueOnce(4);
    s.checkInCount.mockResolvedValueOnce(27);
    s.gymMemberCount.mockResolvedValueOnce(2);

    const summary = await s.service.sweepDailySummary({ now });

    expect(summary).toMatchObject({
      job: 'daily-summary',
      gymsProcessed: 2,
      gymsWithRecipients: 2,
      gymsReported: 1,
      emailsSent: 1,
    });
    expect(s.sendDailySummaryEmail).toHaveBeenCalledTimes(1);
    expect(s.sendDailySummaryEmail.mock.calls[0]![1]).toMatchObject({
      gymName: 'Downtown',
      date: '2026-07-05',
      currency: 'USD',
      revenue: 12500,
      orders: 4,
      checkIns: 27,
      newMembers: 2,
      lowStockProducts: 0,
    });
  });

  it('counts new members by MEMBER role within the gym-local day window', async () => {
    const s = setup();
    s.gymFindMany.mockResolvedValue([
      gym('g1', 'Downtown', { locale: { currency: 'USD', timezone: 'UTC' } }),
    ]);
    s.gymMemberFindMany.mockResolvedValue([staff('owner@g1', 'Owner')]);
    s.checkInCount.mockResolvedValue(1); // make the day non-quiet

    await s.service.sweepDailySummary({ now });

    const where = s.gymMemberCount.mock.calls[0]![0].where;
    expect(where.gymId).toBe('g1');
    expect(where.role).toBe(Role.MEMBER);
    expect(where.joinedAt).toEqual({
      gte: new Date('2026-07-05T00:00:00Z'),
      lt: new Date('2026-07-06T00:00:00Z'),
    });
  });

  it('does not email a quiet day even to a gym with recipients', async () => {
    const s = setup();
    s.gymFindMany.mockResolvedValue([gym('g1', 'Downtown')]);
    s.gymMemberFindMany.mockResolvedValue([staff('owner@g1', 'Owner')]);

    const summary = await s.service.sweepDailySummary({ now });

    expect(summary.gymsReported).toBe(0);
    expect(s.sendDailySummaryEmail).not.toHaveBeenCalled();
  });
});

describe('OpsNotificationsService cron gates', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does nothing when the low-stock flag is off', async () => {
    const s = setup({ lowStockEnabled: false });
    await s.service.runLowStockDigest();
    expect(s.set).not.toHaveBeenCalled();
    expect(s.gymFindMany).not.toHaveBeenCalled();
  });

  it('does nothing when the daily-summary flag is off', async () => {
    const s = setup({ dailyEnabled: false });
    await s.service.runDailySummary();
    expect(s.set).not.toHaveBeenCalled();
    expect(s.gymFindMany).not.toHaveBeenCalled();
  });

  it('does nothing when Resend is unconfigured', async () => {
    const s = setup({ configured: false });
    await s.service.runLowStockDigest();
    expect(s.set).not.toHaveBeenCalled();
    expect(s.gymFindMany).not.toHaveBeenCalled();
  });

  it('skips the sweep when another instance holds the lock', async () => {
    const s = setup({ lock: null });
    await s.service.runLowStockDigest();
    expect(s.set).toHaveBeenCalledTimes(1);
    expect(s.gymFindMany).not.toHaveBeenCalled();
  });

  it('acquires a job+day scoped lock and runs the sweep when all gates pass', async () => {
    const s = setup({ lock: 'OK' });
    s.gymFindMany.mockResolvedValue([]);
    await s.service.runLowStockDigest();

    expect(s.set).toHaveBeenCalledTimes(1);
    const [key, value, ex, ttl, nx] = s.set.mock.calls[0]!;
    expect(String(key)).toContain('ops:lock:low-stock:');
    expect(value).toBe('1');
    expect(ex).toBe('EX');
    expect(typeof ttl).toBe('number');
    expect(nx).toBe('NX');
    expect(s.gymFindMany).toHaveBeenCalledTimes(1);
  });

  it('fails closed (skips) when the Redis lock call throws', async () => {
    const s = setup();
    s.set.mockRejectedValue(new Error('redis down'));
    await s.service.runDailySummary();
    expect(s.gymFindMany).not.toHaveBeenCalled();
  });
});
