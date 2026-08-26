import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockEnv } = vi.hoisted(() => {
  const mockEnv: Record<string, unknown> = {};
  return { mockEnv };
});
vi.mock('../config/env', () => ({ env: mockEnv }));

import { Role } from '@fit/db';
import type {
  ReportDigest,
  ReportDigestCadence,
  ReportKey,
  ReportQuery,
  ReportResult,
} from '@fit/types';
import { REPORT_DIGEST_KEYS } from '@fit/types';
import { ReportDeliveryService } from './report-delivery.service';
import { tenantStorage } from '../common/tenant/tenant.context';
import type { EmailService } from '../auth/email.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { ReportsService } from './reports.service';

/** A gym row as the sweep's `select` projects it. */
function gym(id: string, name: string) {
  return { id, name };
}

/** A staff `GymMember` row as `recipientsFor`'s `select` projects it. */
function staff(email: string, name: string | null) {
  return { user: { email, name } };
}

/** Build a service with fully-mocked collaborators + the delegate spies. */
function setup(
  options: {
    configured?: boolean;
    lock?: 'OK' | null;
    sendResult?: (email: string) => boolean | Promise<boolean>;
    adminUrl?: string;
  } = {},
) {
  const { configured = true, lock = 'OK', sendResult = () => true, adminUrl } = options;

  for (const key of Object.keys(mockEnv)) delete mockEnv[key];
  Object.assign(mockEnv, { REPORT_DIGEST_ENABLED: true, ADMIN_URL: adminUrl });

  const gymFindMany = vi.fn<(args: unknown) => Promise<Array<{ id: string; name: string }>>>();
  const gymMemberFindMany =
    vi.fn<
      (args: {
        where: Record<string, unknown>;
        select?: unknown;
      }) => Promise<Array<{ user: { email: string; name: string | null } }>>
    >();
  const prisma = {
    client: {
      gym: { findMany: gymFindMany },
      gymMember: { findMany: gymMemberFindMany },
    },
  } as unknown as PrismaService;

  // Each report echoes the tenant in scope at call time so we can assert scoping.
  const runReport = vi.fn(
    (key: ReportKey, _query: ReportQuery): Promise<ReportResult> =>
      Promise.resolve({
        key,
        name: key,
        range: '7d',
        currency: 'USD',
        columns: [],
        rows: [{ scopedGym: tenantStorage.getStore()?.gymId ?? null }],
      }),
  );
  const reports = { runReport } as unknown as ReportsService;

  const sendReportDigestEmail = vi.fn(
    (email: string, _digest: ReportDigest, _options?: { reportsUrl?: string }): Promise<boolean> =>
      Promise.resolve(sendResult(email)),
  );
  const email = {
    get isConfigured() {
      return configured;
    },
    sendReportDigestEmail,
  } as unknown as EmailService;

  const set = vi.fn<(...args: unknown[]) => Promise<'OK' | null>>().mockResolvedValue(lock);
  const redis = { client: { set } } as unknown as RedisService;

  return {
    service: new ReportDeliveryService(prisma, reports, email, redis),
    gymFindMany,
    gymMemberFindMany,
    runReport,
    sendReportDigestEmail,
    set,
  };
}

describe('ReportDeliveryService.deliverAll', () => {
  afterEach(() => vi.restoreAllMocks());

  it('emails every OWNER/MANAGER of each active gym and tallies the sends', async () => {
    const { service, gymFindMany, gymMemberFindMany, sendReportDigestEmail } = setup();
    gymFindMany.mockResolvedValue([gym('g1', 'Downtown'), gym('g2', 'Uptown')]);
    gymMemberFindMany
      .mockResolvedValueOnce([staff('owner@g1', 'Owner'), staff('mgr@g1', 'Manager')])
      .mockResolvedValueOnce([staff('owner@g2', null)]);

    const summary = await service.deliverAll('weekly');

    expect(summary).toMatchObject({
      cadence: 'weekly',
      gymsProcessed: 2,
      gymsWithRecipients: 2,
      emailsSent: 3,
      emailsSkipped: 0,
      emailsFailed: 0,
    });
    expect(sendReportDigestEmail).toHaveBeenCalledTimes(3);
    expect(sendReportDigestEmail.mock.calls.map((c) => c[0])).toEqual([
      'owner@g1',
      'mgr@g1',
      'owner@g2',
    ]);
  });

  it('scopes a gym recipient query to OWNER/MANAGER, ACTIVE, verified email', async () => {
    const { service, gymFindMany, gymMemberFindMany } = setup();
    gymFindMany.mockResolvedValue([gym('g1', 'Downtown')]);
    gymMemberFindMany.mockResolvedValue([staff('owner@g1', 'Owner')]);

    await service.deliverAll('weekly');

    const where = gymMemberFindMany.mock.calls[0]![0].where;
    expect(where.gymId).toBe('g1');
    expect(where.role).toEqual({ in: [Role.OWNER, Role.MANAGER] });
    expect(where.status).toBe('ACTIVE');
    expect(where.user).toEqual({ emailVerifiedAt: { not: null } });
  });

  it('skips a gym with no eligible recipients without building its digest', async () => {
    const { service, gymFindMany, gymMemberFindMany, runReport, sendReportDigestEmail } = setup();
    gymFindMany.mockResolvedValue([gym('g1', 'Downtown')]);
    gymMemberFindMany.mockResolvedValue([]);

    const summary = await service.deliverAll('monthly');

    expect(summary.gymsProcessed).toBe(1);
    expect(summary.gymsWithRecipients).toBe(0);
    expect(runReport).not.toHaveBeenCalled();
    expect(sendReportDigestEmail).not.toHaveBeenCalled();
  });

  it('computes each included report for the cadence range inside the gym tenant scope', async () => {
    const { service, gymFindMany, gymMemberFindMany, runReport } = setup();
    gymFindMany.mockResolvedValue([gym('g7', 'Downtown')]);
    gymMemberFindMany.mockResolvedValue([staff('owner@g7', 'Owner')]);

    await service.deliverAll('monthly');

    expect(runReport).toHaveBeenCalledTimes(REPORT_DIGEST_KEYS.length);
    // Monthly digest uses the 30d window for every section.
    for (const [, query] of runReport.mock.calls) {
      expect(query).toEqual({ range: '30d' });
    }
    // The report ran with the gym pinned into the tenant ALS context.
    const firstResult = (await runReport.mock.results[0]!.value) as ReportResult;
    expect(firstResult.rows[0]).toEqual({ scopedGym: 'g7' });
  });

  it('tallies a no-op send (Resend unconfigured) as skipped, not sent', async () => {
    const { service, gymFindMany, gymMemberFindMany } = setup({ sendResult: () => false });
    gymFindMany.mockResolvedValue([gym('g1', 'Downtown')]);
    gymMemberFindMany.mockResolvedValue([staff('owner@g1', 'Owner')]);

    const summary = await service.deliverAll('weekly');

    expect(summary.emailsSent).toBe(0);
    expect(summary.emailsSkipped).toBe(1);
    expect(summary.emailsFailed).toBe(0);
  });

  it('counts a throwing send as failed and continues the sweep', async () => {
    const { service, gymFindMany, gymMemberFindMany } = setup({
      sendResult: (email) => {
        if (email === 'owner@g1') throw new Error('resend 500');
        return true;
      },
    });
    gymFindMany.mockResolvedValue([gym('g1', 'Downtown')]);
    gymMemberFindMany.mockResolvedValue([staff('owner@g1', 'Owner'), staff('mgr@g1', 'Manager')]);

    const summary = await service.deliverAll('weekly');

    expect(summary.emailsFailed).toBe(1);
    expect(summary.emailsSent).toBe(1);
  });

  it('passes the ADMIN_URL reports link through to the email when set', async () => {
    const { service, gymFindMany, gymMemberFindMany, sendReportDigestEmail } = setup({
      adminUrl: 'https://admin.fit/',
    });
    gymFindMany.mockResolvedValue([gym('g1', 'Downtown')]);
    gymMemberFindMany.mockResolvedValue([staff('owner@g1', 'Owner')]);

    await service.deliverAll('weekly');

    expect(sendReportDigestEmail.mock.calls[0]![2]).toEqual({
      reportsUrl: 'https://admin.fit/reports',
      locale: 'en',
    });
  });
});

describe('ReportDeliveryService cron gates', () => {
  afterEach(() => vi.restoreAllMocks());

  async function run(cadence: ReportDigestCadence, s: ReturnType<typeof setup>) {
    if (cadence === 'weekly') await s.service.runWeekly();
    else await s.service.runMonthly();
  }

  it('does nothing when REPORT_DIGEST_ENABLED is false', async () => {
    const s = setup();
    mockEnv.REPORT_DIGEST_ENABLED = false;
    await run('weekly', s);
    expect(s.set).not.toHaveBeenCalled();
    expect(s.gymFindMany).not.toHaveBeenCalled();
  });

  it('does nothing when Resend is unconfigured', async () => {
    const s = setup({ configured: false });
    await run('weekly', s);
    expect(s.set).not.toHaveBeenCalled();
    expect(s.gymFindMany).not.toHaveBeenCalled();
  });

  it('skips the sweep when another instance holds the lock', async () => {
    const s = setup({ lock: null });
    await run('monthly', s);
    expect(s.set).toHaveBeenCalledTimes(1);
    expect(s.gymFindMany).not.toHaveBeenCalled();
  });

  it('acquires the lock and runs the sweep when all gates pass', async () => {
    const s = setup({ lock: 'OK' });
    s.gymFindMany.mockResolvedValue([]);
    await run('weekly', s);
    expect(s.set).toHaveBeenCalledTimes(1);
    // SET key value EX <ttl> NX — the single-sender guard.
    const [key, value, ex, ttl, nx] = s.set.mock.calls[0]!;
    expect(String(key)).toContain('report-digest:lock:weekly:');
    expect(value).toBe('1');
    expect(ex).toBe('EX');
    expect(typeof ttl).toBe('number');
    expect(nx).toBe('NX');
    expect(s.gymFindMany).toHaveBeenCalledTimes(1);
  });

  it('fails closed (skips) when the Redis lock call throws', async () => {
    const s = setup();
    s.set.mockRejectedValue(new Error('redis down'));
    await run('weekly', s);
    expect(s.gymFindMany).not.toHaveBeenCalled();
  });
});
