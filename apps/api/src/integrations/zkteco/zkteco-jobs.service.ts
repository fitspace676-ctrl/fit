import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { zktecoJobsEnabled } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { ZktecoEventImport } from './zkteco-event-import.service';
import { ZktecoUnavailableError } from './zkteco-gateway';
import { ZktecoMemberSync } from './zkteco-member-sync.service';
import { ZktecoTargets } from './zkteco-targets.service';

/** Every 15 seconds: membership changes out, passages in. */
const TICK_CRON = '*/15 * * * * *';
/** 03:30 server time: the full reconcile, when gyms are closed. */
const RECONCILE_CRON = '0 30 3 * * *';
/** Gyms worked on at once by one instance; the rest wait for a later tick. */
const MAX_CONCURRENT_GYMS = 8;
/** Longer than any run should take; a crashed holder frees the gym after this. */
const TICK_LOCK_SECONDS = 120;
const FULL_LOCK_SECONDS = 30 * 60;
/** A requested full sync waits this long for a running tick of the same gym to finish. */
const FULL_WAIT_MS = 90_000;
const WAIT_STEP_MS = 3_000;
/** Delete the lock only if it is still ours. */
const RELEASE_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

export type FullSyncStart =
  | { accepted: true }
  | { accepted: false; reason: 'already_running' | 'not_enabled' };

/**
 * Schedules the ZKTeco work per gym. A gym is worked on by one run at a time:
 * an in-process set stops a slow gym from stacking ticks on this instance and a
 * Redis lock does the same across instances. Every gym runs on its own and
 * catches its own failure, so one unreachable turnstile never holds up another
 * gym. Nothing here retries a door opening; that is never scheduled at all.
 */
@Injectable()
export class ZktecoJobs {
  private readonly logger = new Logger(ZktecoJobs.name);
  private readonly running = new Set<string>();
  private readonly fullRunning = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly targets: ZktecoTargets,
    private readonly sync: ZktecoMemberSync,
    private readonly events: ZktecoEventImport,
  ) {}

  @Cron(TICK_CRON, { name: 'zkteco-tick' })
  async tick(): Promise<void> {
    if (!zktecoJobsEnabled()) return;
    let gymIds: string[];
    try {
      gymIds = await this.targets.enabledGymIds();
    } catch {
      this.logger.warn('ZKTeco tick could not list gyms');
      return;
    }
    for (const gymId of gymIds) {
      if (this.running.has(gymId) || this.running.size >= MAX_CONCURRENT_GYMS) continue;
      // Not awaited: a slow gym must not delay the others or the next tick.
      void this.runExclusive(gymId, 'tick', TICK_LOCK_SECONDS, () => this.tickGym(gymId));
    }
  }

  @Cron(RECONCILE_CRON, { name: 'zkteco-reconcile' })
  async reconcileAll(): Promise<void> {
    if (!zktecoJobsEnabled()) return;
    let gymIds: string[];
    try {
      gymIds = await this.targets.enabledGymIds();
    } catch {
      this.logger.warn('ZKTeco reconcile could not list gyms');
      return;
    }
    // One gym after another: the nightly run is not in a hurry, the turnstiles are.
    for (const gymId of gymIds) {
      await this.runFull(gymId, true);
    }
  }

  /** The owner's "sync now". Runs in the background; the card polls the status. */
  async requestFullSync(gymId: string): Promise<FullSyncStart> {
    if (this.fullRunning.has(gymId) || (await this.isLocked(`zkteco:full:${gymId}`)))
      return { accepted: false, reason: 'already_running' };
    const target = await this.targets.load(gymId, { enabledOnly: true });
    if (!target) return { accepted: false, reason: 'not_enabled' };
    void this.runFull(gymId, false);
    return { accepted: true };
  }

  /** Whether a full sync or reconcile is running for the gym on any instance. */
  async isFullSyncRunning(gymId: string): Promise<boolean> {
    return this.fullRunning.has(gymId) || (await this.isLocked(`zkteco:full:${gymId}`));
  }

  /** One tick for one gym; exported for tests through the public method. */
  async tickGym(gymId: string, now: Date = new Date()): Promise<void> {
    const target = await this.targets.load(gymId, { enabledOnly: true });
    if (!target) return;
    const errors: string[] = [];
    const state = await this.prisma.client.zktecoSyncState.findUnique({
      where: { gymId },
      select: { lastSyncAt: true },
    });
    if (target.options.syncMembers) {
      // A gym that was never fully synced (just enabled) gets everyone, once.
      if (!state?.lastSyncAt) await this.sync.markAll(gymId, target, now);
      else await this.sync.scanChanges(gymId, target, now);
      const pushed = await this.sync.pushDirty(gymId, target, now);
      if (pushed.error) errors.push(pushed.error);
      else if (!state?.lastSyncAt) await this.stampSync(gymId, now, false);
    }
    const imported = await this.events.importGym(gymId, target, now);
    if (imported.error) errors.push(imported.error);
    await this.finish(gymId, errors, now);
  }

  /** Full sync (and, nightly, the remote comparison) for one gym. */
  async fullSyncGym(gymId: string, reconcile: boolean, now: Date = new Date()): Promise<void> {
    const target = await this.targets.load(gymId, { enabledOnly: true });
    if (!target || !target.options.syncMembers) return;
    const errors: string[] = [];
    await this.sync.markAll(gymId, target, now);
    if (reconcile) {
      try {
        await this.sync.reconcileRemote(gymId, target, now);
      } catch (error) {
        errors.push(reasonOf(error));
      }
    }
    // Drain in bounded passes; whatever is left goes out on the next ticks.
    for (let pass = 0; pass < 50; pass += 1) {
      const pushed = await this.sync.pushDirty(gymId, target, now);
      if (pushed.error) {
        errors.push(pushed.error);
        break;
      }
      if (pushed.synced + pushed.failed === 0) break;
      const left = await this.prisma.client.zktecoMember.count({ where: { gymId, dirty: true } });
      if (left === 0) break;
    }
    if (errors.length === 0) await this.stampSync(gymId, now, reconcile);
    await this.finish(gymId, errors, now);
  }

  private async runFull(gymId: string, reconcile: boolean): Promise<void> {
    if (this.fullRunning.has(gymId)) return;
    this.fullRunning.add(gymId);
    try {
      await this.runExclusive(
        gymId,
        'full',
        FULL_LOCK_SECONDS,
        () => this.fullSyncGym(gymId, reconcile),
        FULL_WAIT_MS,
      );
    } finally {
      this.fullRunning.delete(gymId);
    }
  }

  /**
   * Run `work` for the gym unless another run holds it. The tick and the full
   * sync share the per-gym lock, so they never push the same members at once.
   */
  private async runExclusive(
    gymId: string,
    kind: 'tick' | 'full',
    ttlSeconds: number,
    work: () => Promise<void>,
    waitMs = 0,
  ): Promise<void> {
    const deadline = Date.now() + waitMs;
    while (this.running.has(gymId)) {
      if (Date.now() >= deadline) return;
      await delay(WAIT_STEP_MS);
    }
    this.running.add(gymId);
    const keys =
      kind === 'full' ? [`zkteco:full:${gymId}`, `zkteco:gym:${gymId}`] : [`zkteco:gym:${gymId}`];
    const token = randomUUID();
    const held: string[] = [];
    try {
      for (const key of keys) {
        // Another instance's tick holds the gym for a few seconds at most.
        while (!(await this.acquire(key, token, ttlSeconds))) {
          if (Date.now() >= deadline) return;
          await delay(WAIT_STEP_MS);
        }
        held.push(key);
      }
      await work();
    } catch (error) {
      const reason = reasonOf(error);
      this.logger.warn(`ZKTeco ${kind} failed for gym ${gymId} (${reason})`);
      try {
        await this.targets.recordError(gymId, reason, new Date());
      } catch {
        /* the next run records it */
      }
    } finally {
      for (const key of held) await this.release(key, token);
      this.running.delete(gymId);
    }
  }

  private async finish(gymId: string, errors: string[], now: Date): Promise<void> {
    await this.prisma.client.zktecoSyncState.upsert({
      where: { gymId },
      create: errors.length ? { gymId, lastError: errors[0]!, lastErrorAt: now } : { gymId },
      update: errors.length ? { lastError: errors[0]!, lastErrorAt: now } : { lastError: null },
    });
  }

  private async stampSync(gymId: string, now: Date, reconcile: boolean): Promise<void> {
    const data = { lastSyncAt: now, ...(reconcile ? { lastReconcileAt: now } : {}) };
    await this.prisma.client.zktecoSyncState.upsert({
      where: { gymId },
      create: { gymId, ...data },
      update: data,
    });
  }

  private async acquire(key: string, token: string, ttlSeconds: number): Promise<boolean> {
    try {
      return (await this.redis.client.set(key, token, 'EX', ttlSeconds, 'NX')) === 'OK';
    } catch {
      // Without Redis there is no cross-instance guard: skip rather than double-run.
      return false;
    }
  }

  private async release(key: string, token: string): Promise<void> {
    try {
      await this.redis.client.eval(RELEASE_SCRIPT, 1, key, token);
    } catch {
      /* expires on its own */
    }
  }

  private async isLocked(key: string): Promise<boolean> {
    try {
      return (await this.redis.client.exists(key)) === 1;
    } catch {
      return false;
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function reasonOf(error: unknown): string {
  if (error instanceof ZktecoUnavailableError) return error.reason;
  return error instanceof Error && error.name === 'ServiceUnavailableException'
    ? 'secret_unreadable'
    : 'internal';
}
