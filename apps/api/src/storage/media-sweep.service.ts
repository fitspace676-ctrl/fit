import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as Sentry from '@sentry/nestjs';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { env } from '../config/env';
import { isSweepableKey, toObjectKey } from './media-key';
import { StorageService } from './storage.service';

/** Cron: daily at 03:30 (server time) — after the member purge (03:00) has settled. */
const SWEEP_CRON = '30 3 * * *';

/** Milliseconds in an hour, for the grace cutoff. */
const HOUR_MS = 60 * 60 * 1000;

/** How long the per-day Redis lock is held — see {@link MediaSweepService.acquireLock}. */
const LOCK_TTL_SECONDS = 3_600;

/** Outcome of one sweep, for logging and for the manual runner. */
export interface MediaSweepSummary {
  /** Objects listed in the bucket under a sweepable entity prefix. */
  scanned: number;
  /** Distinct object keys some database row still points at. */
  referenced: number;
  /** Unreferenced objects older than the grace period — deletion candidates. */
  orphaned: number;
  /** Objects actually removed (always 0 in dry-run). */
  deleted: number;
  /** Unreferenced but still inside the grace period, so left alone this run. */
  skippedInGrace: number;
  /** Whether this run was report-only. */
  dryRun: boolean;
}

/**
 * Nightly reconciliation of the R2 bucket against the rows that reference it.
 *
 * Media is uploaded straight from the browser to R2 *before* the form referencing it
 * is saved, and removing a photo in the admin only rewrites a column — so the bucket
 * accumulates objects nobody points at: abandoned uploads, replaced logos, images
 * dropped from a gallery, and the media of deleted gyms. Nothing in the request path
 * can catch all four, because three of them are non-events. This job therefore
 * compares *state*: every object under a `SWEEPABLE_ENTITIES` prefix that no
 * row references, and that is older than `MEDIA_SWEEP_GRACE_HOURS`, is deleted.
 *
 * Like the member purge it is **cross-tenant** (it reads every gym's rows through the
 * unscoped {@link PrismaService}) and gated three ways, because deleting media is
 * irreversible:
 *   • `MEDIA_SWEEP_ENABLED` must be true — off in dev / CI / preview.
 *   • `MEDIA_SWEEP_DRY_RUN` (default true) reports instead of deleting.
 *   • a Redis `SET NX` lock per day means one replica sweeps, not all of them.
 *
 * Soft-deleted rows still count as references: their columns are read without any
 * `deletedAt` filter, so a restored product keeps its pictures.
 *
 * **Idempotency:** the sweep derives its candidates from current state, and deleting
 * an already-absent key is a success in S3, so a re-run or an overlapping replica
 * simply finds fewer candidates.
 */
@Injectable()
export class MediaSweepService {
  private readonly logger = new Logger(MediaSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
  ) {}

  /** Daily cron entry point (03:30). */
  @Cron(SWEEP_CRON, { name: 'media-sweep' })
  async runScheduled(): Promise<void> {
    if (!env.MEDIA_SWEEP_ENABLED) {
      this.logger.debug('Media sweep disabled (MEDIA_SWEEP_ENABLED unset) — skipping');
      return;
    }
    if (!this.storage.isConfigured) {
      this.logger.warn('Media sweep enabled but R2 is not configured — skipping');
      return;
    }
    if (!(await this.acquireLock())) {
      this.logger.debug('Another instance holds the media-sweep lock — skipping');
      return;
    }

    try {
      const summary = await this.sweep(new Date());
      this.logger.log(
        `Media sweep${summary.dryRun ? ' (dry run)' : ''}: scanned ${summary.scanned} object(s), ` +
          `${summary.referenced} referenced, ${summary.orphaned} orphaned, ` +
          `${summary.deleted} deleted, ${summary.skippedInGrace} within grace period`,
      );
    } catch (error) {
      // A total job failure is invisible to the HTTP exception filter — this is the
      // only place it can reach Sentry, and the signal the job-failure alert keys off.
      Sentry.captureException(error, { tags: { job: 'media-sweep' } });
      this.logger.error(
        `Media sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Run one reconciliation pass and report what it found. Pure of scheduling and
   * locking so it can be unit-tested and invoked directly by the manual runner.
   * Honours `MEDIA_SWEEP_DRY_RUN`, in which case nothing is deleted.
   */
  async sweep(now: Date): Promise<MediaSweepSummary> {
    const dryRun = env.MEDIA_SWEEP_DRY_RUN;
    const cutoff = new Date(now.getTime() - env.MEDIA_SWEEP_GRACE_HOURS * HOUR_MS);
    const referenced = await this.collectReferencedKeys();

    // One full listing: cheaper than a listing per gym, and it also reaches the media
    // of gyms whose rows are gone — exactly the objects a per-gym walk would miss.
    const objects = (await this.storage.listObjects('')).filter((object) =>
      isSweepableKey(object.key),
    );

    const orphans: string[] = [];
    let skippedInGrace = 0;
    for (const object of objects) {
      if (referenced.has(object.key)) continue;
      // A missing `lastModified` is treated as fresh: without an age we cannot show
      // the object is stale, and keeping a live photo beats deleting one.
      if (!object.lastModified || object.lastModified >= cutoff) {
        skippedInGrace += 1;
        continue;
      }
      orphans.push(object.key);
    }

    if (dryRun) {
      for (const key of orphans) this.logger.log(`[dry run] would delete ${key}`);
    }

    const deleted = dryRun ? 0 : await this.storage.deleteObjects(orphans);

    return {
      scanned: objects.length,
      referenced: referenced.size,
      orphaned: orphans.length,
      deleted,
      skippedInGrace,
      dryRun,
    };
  }

  /**
   * Every object key the database still points at, across all gyms.
   *
   * Three columns and one JSON field hold *public URLs*, so each is reduced to a key
   * by taking the URL's path. Matching on the path rather than on the configured
   * `R2_PUBLIC_URL` prefix is deliberate: after a move to a custom domain the stored
   * URLs still carry the old host, and a prefix match would read every one of them as
   * unreferenced — that is, delete the entire library. Invoice PDFs are not collected
   * because `invoices` is not in {@link SWEEPABLE_ENTITIES}; the sweep never considers
   * them in the first place.
   */
  private async collectReferencedKeys(): Promise<Set<string>> {
    const keys = new Set<string>();
    const add = (value: unknown): void => {
      const key = toObjectKey(value);
      if (key) keys.add(key);
    };

    const [products, trainers, locations, classTemplates, services, gyms] = await Promise.all([
      this.prisma.client.product.findMany({ select: { images: true } }),
      this.prisma.client.trainer.findMany({
        where: { photoUrl: { not: null } },
        select: { photoUrl: true },
      }),
      this.prisma.client.location.findMany({
        where: { photoUrl: { not: null } },
        select: { photoUrl: true },
      }),
      this.prisma.client.classTemplate.findMany({
        where: { imageUrl: { not: null } },
        select: { imageUrl: true },
      }),
      this.prisma.client.service.findMany({
        where: { coverUrl: { not: null } },
        select: { coverUrl: true },
      }),
      this.prisma.client.gym.findMany({ select: { settings: true } }),
    ]);

    for (const product of products) for (const image of product.images) add(image);
    for (const trainer of trainers) add(trainer.photoUrl);
    for (const location of locations) add(location.photoUrl);
    for (const template of classTemplates) add(template.imageUrl);
    for (const service of services) add(service.coverUrl);
    // The gym logo and the member portal's sign-in photograph both live inside the
    // `settings` JSON blob rather than in their own columns; read them defensively,
    // since a hand-edited row must not abort the sweep. Both land under the same
    // `logos` upload prefix, so a portal image missing from this set would be
    // deleted out from under a live sign-in screen on the next nightly run.
    for (const gym of gyms) {
      const settings = gym.settings as {
        brand?: { logoUrl?: unknown };
        memberPortal?: { loginImageUrl?: unknown };
      } | null;
      add(settings?.brand?.logoUrl);
      add(settings?.memberPortal?.loginImageUrl);
    }

    return keys;
  }

  /**
   * Take the single-runner lock for today's window via Redis `SET NX EX`, keyed by
   * the UTC date so all replicas contend for the same key. A Redis error skips the
   * run (returns false) rather than risking two replicas deleting concurrently.
   */
  private async acquireLock(): Promise<boolean> {
    const key = `media-sweep:lock:${new Date().toISOString().slice(0, 10)}`;
    try {
      const result = await this.redis.client.set(key, '1', 'EX', LOCK_TTL_SECONDS, 'NX');
      return result === 'OK';
    } catch (error) {
      this.logger.warn(
        `Could not acquire media-sweep lock (Redis error) — skipping: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}
