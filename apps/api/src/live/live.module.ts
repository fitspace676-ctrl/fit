import { Global, Module } from '@nestjs/common';
import { ActivityStreamService } from './activity-stream.service';

/**
 * Live push infrastructure (Phase 8, T8.9).
 *
 * Provides the app-wide {@link ActivityStreamService} — the Redis-backed pub/sub
 * seam that turns the polling reception board and activity feed into server-pushed
 * events. Marked `@Global` so any producer (the reception check-in flow, and later
 * bookings/sales) can inject it to publish, and the activity SSE endpoint can
 * inject it to subscribe, without re-importing this module. The shared
 * {@link RedisService} it builds its subscriber connection from comes from the
 * global `RedisModule`.
 */
@Global()
@Module({
  providers: [ActivityStreamService],
  exports: [ActivityStreamService],
})
export class LiveModule {}
