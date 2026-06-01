import { Module, type MiddlewareConsumer, type NestModule, RequestMethod } from '@nestjs/common';
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
import { RbacModule } from './common/rbac/rbac.module';
import { TenantModule } from './common/tenant/tenant.module';
import { TenantMiddleware } from './common/tenant/tenant.middleware';

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
 * - {@link TenantModule} provides tenant scoping (context, guard, scoped Prisma);
 *   {@link TenantMiddleware} establishes the request's tenant for every route
 *   except the public ones (`/auth/*`, `/health`, `/uploads`).
 * - {@link RbacModule} provides the role/permission guards (`RolesGuard`,
 *   `PermissionsGuard`) that gate handlers via `@Roles` / `@RequirePermissions`.
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
    TenantModule,
    RbacModule,
  ],
  providers: [
    TenantMiddleware,
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule implements NestModule {
  /**
   * Apply {@link TenantMiddleware} to every route except the public ones: auth
   * (must work before any session exists), the health probe, and uploads (which
   * carries its own `gymId` in the body and predates tenant scoping). New
   * protected routes are tenant-scoped automatically; existing controllers stay
   * untouched, keeping the middleware transparent.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'auth/(.*)', method: RequestMethod.ALL },
        { path: 'health', method: RequestMethod.ALL },
        { path: 'uploads', method: RequestMethod.ALL },
      )
      .forRoutes('*');
  }
}
