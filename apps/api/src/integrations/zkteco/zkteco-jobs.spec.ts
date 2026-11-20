import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ZKTECO_SETTINGS } from '@fit/types';

const { jobsEnabled } = vi.hoisted(() => ({ jobsEnabled: { value: true } }));
vi.mock('../../config/env', () => ({ env: {}, zktecoJobsEnabled: () => jobsEnabled.value }));

import type { PrismaService } from '../../prisma/prisma.service';
import type { RedisService } from '../../redis/redis.service';
import type { ZktecoEventImport } from './zkteco-event-import.service';
import { ZktecoUnavailableError, type ZktecoTarget } from './zkteco-gateway';
import { ZktecoJobs } from './zkteco-jobs.service';
import type { ZktecoMemberSync } from './zkteco-member-sync.service';
import type { ZktecoTargets } from './zkteco-targets.service';

const target: ZktecoTarget = {
  type: 'zkbio',
  zkbio: { baseUrl: 'https://bio.example.ge', apiToken: 't' },
  options: DEFAULT_ZKTECO_SETTINGS,
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup() {
  const db = {
    zktecoSyncState: {
      findUnique: vi.fn().mockResolvedValue({ lastSyncAt: new Date() }),
      upsert: vi.fn().mockResolvedValue({}),
    },
    zktecoMember: { count: vi.fn().mockResolvedValue(0) },
  };
  const locks = new Map<string, string>();
  const redis = {
    client: {
      set: vi.fn((key: string, token: string) => {
        if (locks.has(key)) return Promise.resolve(null);
        locks.set(key, token);
        return Promise.resolve('OK');
      }),
      eval: vi.fn((_s: string, _n: number, key: string, token: string) => {
        if (locks.get(key) === token) locks.delete(key);
        return Promise.resolve(1);
      }),
      exists: vi.fn((key: string) => Promise.resolve(locks.has(key) ? 1 : 0)),
    },
  };
  const targets = {
    enabledGymIds: vi.fn().mockResolvedValue(['g1', 'g2']),
    load: vi.fn().mockResolvedValue(target),
    recordError: vi.fn().mockResolvedValue(undefined),
  };
  const sync = {
    scanChanges: vi.fn().mockResolvedValue(0),
    markAll: vi.fn().mockResolvedValue(0),
    pushDirty: vi.fn().mockResolvedValue({ synced: 0, failed: 0 }),
    reconcileRemote: vi.fn().mockResolvedValue(0),
  };
  const events = { importGym: vi.fn().mockResolvedValue({ imported: 0 }) };
  const jobs = new ZktecoJobs(
    { client: db } as unknown as PrismaService,
    redis as unknown as RedisService,
    targets as unknown as ZktecoTargets,
    sync as unknown as ZktecoMemberSync,
    events as unknown as ZktecoEventImport,
  );
  return { jobs, db, redis, locks, targets, sync, events };
}
let ctx: ReturnType<typeof setup>;
beforeEach(() => {
  jobsEnabled.value = true;
  ctx = setup();
});

describe('ZktecoJobs.tick', () => {
  it('does nothing when the jobs are switched off for this environment', async () => {
    jobsEnabled.value = false;
    await ctx.jobs.tick();
    expect(ctx.targets.enabledGymIds).not.toHaveBeenCalled();
  });
  it('works every enabled gym and releases the per-gym lock', async () => {
    await ctx.jobs.tick();
    await flush();
    await flush();
    expect(ctx.sync.scanChanges).toHaveBeenCalledTimes(2);
    expect(ctx.events.importGym).toHaveBeenCalledTimes(2);
    expect(ctx.locks.size).toBe(0);
  });
  it('lets one failing gym fail alone', async () => {
    ctx.sync.scanChanges.mockImplementation((gymId: string) => {
      if (gymId === 'g1') return Promise.reject(new ZktecoUnavailableError('unreachable'));
      return Promise.resolve(0);
    });
    await ctx.jobs.tick();
    await flush();
    await flush();
    expect(ctx.targets.recordError).toHaveBeenCalledWith('g1', 'unreachable', expect.any(Date));
    expect(ctx.events.importGym).toHaveBeenCalledWith('g2', target, expect.any(Date));
  });
  it('never stacks a second run on a gym that is still busy', async () => {
    let release!: () => void;
    ctx.sync.scanChanges.mockImplementationOnce(
      () => new Promise<number>((resolve) => (release = () => resolve(0))),
    );
    ctx.targets.enabledGymIds.mockResolvedValue(['g1']);
    await ctx.jobs.tick();
    await flush();
    await ctx.jobs.tick();
    await flush();
    expect(ctx.targets.load).toHaveBeenCalledTimes(1);
    release();
    await flush();
    await flush();
  });
  it('skips a gym another instance holds', async () => {
    ctx.locks.set('zkteco:gym:g1', 'other');
    await ctx.jobs.tick();
    await flush();
    await flush();
    expect(ctx.targets.load).toHaveBeenCalledWith('g2', { enabledOnly: true });
    expect(ctx.targets.load).not.toHaveBeenCalledWith('g1', expect.anything());
    expect(ctx.locks.get('zkteco:gym:g1')).toBe('other');
  });
  it('pushes everyone once for a gym that was never synced', async () => {
    ctx.db.zktecoSyncState.findUnique.mockResolvedValue(null);
    await ctx.jobs.tickGym('g1', new Date());
    expect(ctx.sync.markAll).toHaveBeenCalled();
    expect(ctx.sync.scanChanges).not.toHaveBeenCalled();
  });
});

describe('ZktecoJobs full sync', () => {
  it('refuses a second manual sync while one runs and needs an enabled gym', async () => {
    ctx.locks.set('zkteco:full:g1', 'other');
    expect(await ctx.jobs.requestFullSync('g1')).toEqual({
      accepted: false,
      reason: 'already_running',
    });
    ctx.targets.load.mockResolvedValueOnce(null);
    expect(await ctx.jobs.requestFullSync('g2')).toEqual({
      accepted: false,
      reason: 'not_enabled',
    });
  });
  it('reconciles with the remote list and stamps the run', async () => {
    const now = new Date('2026-11-20T00:30:00Z');
    await ctx.jobs.fullSyncGym('g1', true, now);
    expect(ctx.sync.markAll).toHaveBeenCalledWith('g1', target, now);
    expect(ctx.sync.reconcileRemote).toHaveBeenCalledWith('g1', target, now);
    expect(ctx.db.zktecoSyncState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { lastSyncAt: now, lastReconcileAt: now } }),
    );
  });
  it('stops draining and reports when the connection fails', async () => {
    ctx.sync.pushDirty.mockResolvedValue({ synced: 0, failed: 0, error: 'timeout' });
    await ctx.jobs.fullSyncGym('g1', false, new Date());
    expect(ctx.sync.pushDirty).toHaveBeenCalledTimes(1);
    const last = ctx.db.zktecoSyncState.upsert.mock.calls.at(-1)![0] as { update: object };
    expect(last.update).toMatchObject({ lastError: 'timeout' });
  });
});
