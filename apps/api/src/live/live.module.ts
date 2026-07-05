import { Global, Module } from '@nestjs/common';
import { ActivityStreamService } from './activity-stream.service';
import { OccupancyStreamService } from './occupancy-stream.service';

/**
 * Live push infrastructure (Phase 8, T8.9 / T8.10).
 *
 * Provides the app-wide Redis-backed pub/sub seams that turn polling surfaces into
 * server-pushed streams:
 *
 * - {@link ActivityStreamService} (T8.9) — the reception board and activity feed.
 * - {@link OccupancyStreamService} (T8.10) — live class occupancy for the staff
 *   schedule and the member class-detail views.
 *
 * Marked `@Global` so any producer (the reception check-in flow, the booking
 * flow, the front-desk schedule actions) can inject a stream to publish, and the
 * SSE endpoints can inject one to subscribe, without re-importing this module. The
 * shared {@link RedisService} both build their subscriber connection from comes
 * from the global `RedisModule`.
 */
@Global()
@Module({
  providers: [ActivityStreamService, OccupancyStreamService],
  exports: [ActivityStreamService, OccupancyStreamService],
})
export class LiveModule {}
