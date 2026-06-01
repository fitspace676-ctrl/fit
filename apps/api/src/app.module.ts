import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { LoggerModule } from 'nestjs-pino';
import { HealthModule } from './health/health.module';
import { RedisModule } from './redis/redis.module';
import { StorageModule } from './storage/storage.module';
import { loggerConfig } from './common/logging';

/**
 * Root module.
 *
 * - {@link SentryModule} + {@link SentryGlobalFilter} forward unhandled
 *   exceptions to Sentry (no-op when `SENTRY_DSN` is unset — see `instrument.ts`).
 * - {@link LoggerModule} (nestjs-pino) provides structured request logging with
 *   a per-request `requestId`.
 * - {@link RedisModule} exposes a shared Redis client; {@link HealthModule}
 *   serves `GET /health`.
 * - {@link StorageModule} exposes the Cloudflare R2 signed-upload service and
 *   serves `POST /uploads`.
 */
@Module({
  imports: [
    SentryModule.forRoot(),
    LoggerModule.forRoot(loggerConfig()),
    RedisModule,
    HealthModule,
    StorageModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
  ],
})
export class AppModule {}
