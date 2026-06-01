import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { SentryModule } from '@sentry/nestjs/setup';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
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
 * - {@link PrismaModule} exposes a shared Prisma client; {@link RedisModule}
 *   exposes a shared Redis client; {@link HealthModule} serves `GET /health`.
 * - {@link StorageModule} exposes the Cloudflare R2 signed-upload service and
 *   serves `POST /uploads`.
 * - {@link AuthModule} serves email/password registration + verification
 *   (`POST /auth/register`, `GET /auth/verify`).
 */
@Module({
  imports: [
    SentryModule.forRoot(),
    LoggerModule.forRoot(loggerConfig()),
    PrismaModule,
    RedisModule,
    HealthModule,
    StorageModule,
    AuthModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
