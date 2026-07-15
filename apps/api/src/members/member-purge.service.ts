import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as Sentry from '@sentry/nestjs';
import { Role } from '@fit/db';
import { MEMBER_TRASH_RETENTION_DAYS } from '@fit/types';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { env } from '../config/env';

/** Cron: daily at 03:00 (server time) — a quiet hour, clear of the billing sweep (02:00). */
const PURGE_CRON = '0 3 * * *';

/** Milliseconds in a day, for the retention cutoff. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** How long the per-day Redis lock is held — long enough to dedupe replicas firing at
 *  the same minute, short enough to expire well before the next daily window. */
const LOCK_TTL_SECONDS = 3_600;

/**
 * Permanent purge of trashed (soft-deleted) members past their retention window
 * (T-members-trash).
 *
 * The scheduled job that hard-deletes every gym's members whose `deletedAt` is older
 * than {@link MEMBER_TRASH_RETENTION_DAYS} days — the point at which a trashed member
 * is no longer recoverable. Deleting the `GymMember` row cascades to its member-owned
 * children (bookings, check-ins, subscriptions, notes, …); `Order`/`Invoice` are
 * `SetNull`, so the gym's financial history survives the purge. The underlying
 * cross-gym `User` is never touched (the cascade runs User→member, not the reverse).
 *
 * Like the subscription billing sweep it is **cross-tenant** — it reads and writes
 * every gym's members through the unscoped {@link PrismaService} (the purge has no
 * request tenant context) — and is gated two ways so it is safe in every environment:
 *   • `MEMBER_PURGE_ENABLED` must be true (off in dev / CI / preview by default), so
 *     it never hard-deletes unexpectedly.
 *   • a Redis `SET NX` lock per day means a multi-instance deployment purges once even
 *     though every replica fires the cron.
 *
 * **Idempotency** is inherent: the purge is a single `deleteMany` matched on
 * `deletedAt < cutoff`, so a re-run, an overlapping replica, or a retry all simply
 * find fewer (or no) rows — a row can never be deleted twice.
 */
@Injectable()
export class MemberPurgeService {
  private readonly logger = new Logger(MemberPurgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Daily cron entry point (03:00). */
  @Cron(PURGE_CRON, { name: 'member-trash-purge' })
  async runScheduled(): Promise<void> {
    if (!env.MEMBER_PURGE_ENABLED) {
      this.logger.debug('Member trash purge disabled (MEMBER_PURGE_ENABLED unset) — skipping');
      return;
    }
    if (!(await this.acquireLock())) {
      this.logger.debug('Another instance holds the member-purge lock — skipping');
      return;
    }

    try {
      const purged = await this.purgeExpired(new Date());
      this.logger.log(
        `Member trash purge: permanently deleted ${purged} member(s) past the ` +
          `${MEMBER_TRASH_RETENTION_DAYS}-day retention window`,
      );
    } catch (error) {
      // A total job failure is invisible to the HTTP exception filter — this is the
      // only place it can reach Sentry, and the signal the job-failure alert keys off.
      Sentry.captureException(error, { tags: { job: 'member-trash-purge' } });
      this.logger.error(
        `Member trash purge failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Permanently delete every `MEMBER`-role membership (across all gyms) whose
   * `deletedAt` is older than the retention window relative to `now`. Returns the
   * number of rows deleted. Pure of scheduling/locking so it can be unit-tested and
   * invoked directly. The cutoff is `now − {@link MEMBER_TRASH_RETENTION_DAYS} days`;
   * a member trashed exactly at the boundary is kept (strict `<`).
   */
  async purgeExpired(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - MEMBER_TRASH_RETENTION_DAYS * DAY_MS);
    const { count } = await this.prisma.client.gymMember.deleteMany({
      where: { role: Role.MEMBER, deletedAt: { lt: cutoff } },
    });
    return count;
  }

  /**
   * Take the single-runner lock for today's window via Redis `SET NX EX`, keyed by
   * the UTC date so all replicas contend for the same key. A Redis error skips the
   * run (returns false) rather than risking a duplicate purge.
   */
  private async acquireLock(): Promise<boolean> {
    const key = `member-trash-purge:lock:${new Date().toISOString().slice(0, 10)}`;
    try {
      const result = await this.redis.client.set(key, '1', 'EX', LOCK_TTL_SECONDS, 'NX');
      return result === 'OK';
    } catch (error) {
      this.logger.warn(
        `Could not acquire member-purge lock (Redis error) — skipping: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}
