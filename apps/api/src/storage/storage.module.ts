import { Global, Module } from '@nestjs/common';
import { MediaCleanupService } from './media-cleanup.service';
import { MediaSweepService } from './media-sweep.service';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

/**
 * Provides the {@link StorageService} (Cloudflare R2 signed uploads)
 * application-wide and serves `POST /uploads`. Marked `@Global` so feature
 * modules can inject the service to mint signed URLs without re-importing.
 *
 * Also registers the two cleanup paths that keep the bucket free of objects no
 * row references: {@link MediaCleanupService} (deletes as soon as an edit drops a
 * reference) and {@link MediaSweepService}, the nightly `@Cron` that reconciles
 * whatever the fast path could not see. Their Prisma/Redis dependencies come from
 * those global modules; the cron runs off the app-wide `ScheduleModule`.
 */
@Global()
@Module({
  controllers: [StorageController],
  providers: [StorageService, MediaSweepService, MediaCleanupService],
  exports: [StorageService, MediaSweepService, MediaCleanupService],
})
export class StorageModule {}
