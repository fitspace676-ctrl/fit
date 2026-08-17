import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isSweepableKey, toObjectKey } from './media-key';
import { StorageService } from './storage.service';

/**
 * Deletes an uploaded object the moment the row that referenced it stops doing so —
 * a photo removed from a product gallery, a replaced trainer picture or gym logo.
 *
 * This is the fast path, not the guarantee. {@link MediaSweepService} is what makes
 * the bucket converge (it also catches uploads abandoned before any row was saved,
 * and the media of deleted gyms); this service only means the space is freed in
 * seconds rather than by tomorrow morning. Because it is an optimisation, it is
 * deliberately **best-effort**: every failure is logged and swallowed, since a
 * storage hiccup must never fail an edit the database has already committed — the
 * sweep collects whatever is left behind.
 *
 * Call it *after* the write commits, so {@link isStillReferenced} sees the new state.
 */
@Injectable()
export class MediaCleanupService {
  private readonly logger = new Logger(MediaCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Delete the objects behind `previous` that `next` no longer references. Both
   * arguments are the raw stored references (public URLs) in any order; `null` and
   * blank entries are ignored, so a nullable column can be passed straight in.
   *
   * Only objects under an upload prefix are eligible (see `isSweepableKey`), and each
   * dropped reference is re-checked against the database first: an admin who puts the
   * same image on two products must not lose it when one of them drops it.
   */
  async discardUnreferenced(
    previous: readonly (string | null | undefined)[],
    next: readonly (string | null | undefined)[],
  ): Promise<void> {
    const kept = new Set(next.filter(isPresent));
    const dropped = [...new Set(previous.filter(isPresent))].filter(
      (reference) => !kept.has(reference) && isDeletable(reference),
    );
    if (dropped.length === 0) return;

    try {
      const orphaned: string[] = [];
      for (const reference of dropped) {
        if (await this.isStillReferenced(reference)) continue;
        // Non-null by `isDeletable`, which already resolved the key.
        orphaned.push(toObjectKey(reference)!);
      }
      const deleted = await this.storage.deleteObjects(orphaned);
      if (deleted > 0) this.logger.debug(`Discarded ${deleted} unreferenced object(s)`);
    } catch (error) {
      // Never propagate: the row is already saved, and the nightly sweep is the
      // backstop for exactly this case.
      this.logger.warn(
        `Could not discard replaced media (${dropped.join(', ')}) — leaving it to the ` +
          `nightly sweep: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * True when any row still stores `reference`.
   *
   * Matching is exact-string, not path-based like the sweep's: here both sides were
   * written by this application from the same `R2_PUBLIC_URL`, so a second row
   * pointing at the same image holds a byte-identical URL. (The sweep needs the
   * looser rule because it compares a *bucket key* against a stored URL.)
   */
  private async isStillReferenced(reference: string): Promise<boolean> {
    const [products, trainers, locations, gyms] = await Promise.all([
      this.prisma.client.product.count({ where: { images: { has: reference } } }),
      this.prisma.client.trainer.count({ where: { photoUrl: reference } }),
      this.prisma.client.location.count({ where: { photoUrl: reference } }),
      this.prisma.client.gym.count({
        where: { settings: { path: ['brand', 'logoUrl'], equals: reference } },
      }),
    ]);

    return products > 0 || trainers > 0 || locations > 0 || gyms > 0;
  }
}

/** Narrows a nullable column value to a reference actually worth looking at. */
function isPresent(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** True when a reference resolves to an object key cleanup is allowed to delete. */
function isDeletable(reference: string): boolean {
  const key = toObjectKey(reference);
  return key !== null && isSweepableKey(key);
}
