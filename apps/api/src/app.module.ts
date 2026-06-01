import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { SentryModule } from '@sentry/nestjs/setup';
import { LoggerModule } from 'nestjs-pino';
import { HealthModule } from './health/health.module';
import { RedisModule } from './redis/redis.module';
import { StorageModule } from './storage/storage.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { loggerConfig } from './common/logging';

/**
 * Root module.
 *
 * - {@link SentryModule} + {@link AllExceptionsFilter} catch every unhandled
 *   exception: the filter normalises the response body and forwards 5xx errors
 *   to Sentry (no-op when `SENTRY_DSN` is unset — see `instrument.ts`).
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
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
