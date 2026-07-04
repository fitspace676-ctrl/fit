import { Module } from '@nestjs/common';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';

/**
 * Activity: the staff console's unified event stream (`/admin/activity`, T3.8).
 *
 * Serves the Activity screen's newest-first feed, merged read-time from the
 * gym's real signups / bookings / check-ins / sales / subscription rows — no new
 * write path. Registers only its controller + service; the tenant-scoped Prisma
 * client (`TenantPrismaService`), the tenant context, the `TenantGuard`, and the
 * global `PermissionsGuard` all come from the app-wide `TenantModule` /
 * `RbacModule`. The routes are session-bound and tenant-scoped, so they sit
 * behind the default `TenantMiddleware` with no `AppModule` exclusion.
 */
@Module({
  controllers: [ActivityController],
  providers: [ActivityService],
})
export class ActivityModule {}
