import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RateLimitGuard } from './rate-limit.guard';

/**
 * Registers {@link RateLimitGuard} as a global `APP_GUARD` (T9.7). Runs on every
 * route but only throttles handlers that declare a {@link RateLimit} policy, so
 * importing this module is the single switch that turns per-IP rate limiting on
 * for the whole API. Depends on the (global) `RedisService` for its shared,
 * cross-replica counters.
 */
@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
})
export class RateLimitModule {}
