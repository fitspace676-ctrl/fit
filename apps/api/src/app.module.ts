import { Module, type MiddlewareConsumer, type NestModule, RequestMethod } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { SentryModule } from '@sentry/nestjs/setup';
import { LoggerModule } from 'nestjs-pino';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ClassesModule } from './classes/classes.module';
import { GymsModule } from './gyms/gyms.module';
import { HealthModule } from './health/health.module';
import { LocationsModule } from './locations/locations.module';
import { MembersModule } from './members/members.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { RedisModule } from './redis/redis.module';
import { StaffModule } from './staff/staff.module';
import { StorageModule } from './storage/storage.module';
import { SuperAdminModule } from './superadmin/superadmin.module';
import { TrainersModule } from './trainers/trainers.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { loggerConfig } from './common/logging';
import { SubdomainTenantMiddleware } from './common/middleware/subdomain-tenant.middleware';
import { PermissionsGuard } from './common/rbac/permissions.guard';
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
 *   (`POST /auth/register`, `GET /auth/verify`) and gym provisioning +
 *   owner onboarding (`POST /auth/register-gym`).
 * - {@link GymsModule} serves the SUPER_ADMIN-only platform gym roster
 *   (`GET /gyms`); {@link SuperAdminModule} serves the operator console API
 *   (`/admin/gyms` — list, suspend/reactivate, audited owner impersonation).
 * - {@link MembersModule} serves the staff console's tenant-scoped member
 *   roster + detail (`/members` — list, detail, bulk-export; `MemberRead`).
 * - {@link StaffModule} serves the staff console's tenant-scoped staff management
 *   (`/staff` — invite, list, re-role, remove; revoke invites; `StaffManage`).
 * - {@link AuditModule} serves the staff console's tenant-scoped audit-log viewer
 *   (`/audit-logs` — filtered, paginated read of the gym's action trail; `AuditRead`).
 * - {@link LocationsModule} serves the staff console's tenant-scoped location
 *   management (`/admin/locations` — CRUD with hours + amenities; `LocationRead`
 *   / `LocationWrite`).
 * - {@link ProductsModule} serves the staff console's tenant-scoped product
 *   management (`/admin/products` — CRUD with image gallery + variants;
 *   `ProductRead` / `ProductWrite`).
 * - {@link TenantModule} provides tenant scoping (context, guard, scoped Prisma);
 *   {@link TenantMiddleware} establishes the request's tenant for every route
 *   except the public ones (`/auth/*`, `/health`, `/uploads`).
 * - {@link RbacModule} provides the role/permission guards (`RolesGuard`,
 *   `PermissionsGuard`). {@link PermissionsGuard} is registered here as a global
 *   `APP_GUARD`: it runs on every route and **denies by default**, so a handler
 *   is reachable only if it declares `@Public()`, `@RequirePermissions(...)`,
 *   `@Roles(...)`, or `@AllowCrossTenant()`.
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
    ClassesModule,
    TrainersModule,
    LocationsModule,
    ProductsModule,
    MembersModule,
    StaffModule,
    AuditModule,
    GymsModule,
    SuperAdminModule,
    TenantModule,
    RbacModule,
  ],
  providers: [
    SubdomainTenantMiddleware,
    TenantMiddleware,
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      // Global deny-by-default authorization. Reuses the same instance the
      // RbacModule provides so `@RequirePermissions` routes and the global gate
      // share one guard.
      provide: APP_GUARD,
      useExisting: PermissionsGuard,
    },
  ],
})
export class AppModule implements NestModule {
  /**
   * Wire the two tenant middlewares, in order:
   *
   * 1. {@link SubdomainTenantMiddleware} runs on every route. For an
   *    unauthenticated request on a `<slug>.fit.ge` subdomain it establishes the
   *    tenant from the host; for everything else (a session-bearing request, or
   *    no tenant subdomain) it is a pass-through.
   * 2. {@link TenantMiddleware} establishes the tenant from the JWT on every
   *    route except the public ones: auth (must work before any session exists),
   *    the health probe, the public discovery listings
   *    (`GET /class-instances`, `GET /trainers`) — which an unauthenticated
   *    visitor browses on a gym subdomain and which carry their `gymId` as a
   *    query param rather than a session — and the public tenant lookup
   *    (`GET /gyms/by-subdomain/:slug`)
   *    the member site resolves before any session exists. A session always
   *    wins over the subdomain, and an
   *    unauthenticated request to a protected route is still rejected here.
   *    (`/uploads` is no longer excluded — it now runs behind the session and
   *    derives its `gymId` from the tenant context, not the request body.)
   *
   * New protected routes are tenant-scoped automatically; existing controllers
   * stay untouched, keeping both middlewares transparent.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SubdomainTenantMiddleware).forRoutes('*');
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'auth/(.*)', method: RequestMethod.ALL },
        { path: 'health', method: RequestMethod.ALL },
        { path: 'class-instances', method: RequestMethod.ALL },
        { path: 'trainers', method: RequestMethod.ALL },
        { path: 'gyms/by-subdomain/(.*)', method: RequestMethod.ALL },
      )
      .forRoutes('*');
  }
}
