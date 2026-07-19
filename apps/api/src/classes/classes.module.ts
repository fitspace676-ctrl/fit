import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminClassTemplatesController } from './admin-class-templates.controller';
import { AdminClassTemplatesService } from './admin-class-templates.service';
import { AdminScheduleController } from './admin-schedule.controller';
import { AdminScheduleService } from './admin-schedule.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { BookingReminderService } from './booking-reminder.service';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { ClassOccupancyPublisher } from './class-occupancy.publisher';
import { ClassTypesController } from './class-types.controller';
import { ClassTypesService } from './class-types.service';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';
import { MemberBookingsController } from './member-bookings.controller';
import { MemberBookingsService } from './member-bookings.service';
import { AdminPtSessionsController } from './pt-sessions.controller';
import { PtSessionsService } from './pt-sessions.service';

/**
 * Classes: the public class-discovery surface (`GET /class-instances`) plus the
 * staff console's tenant-scoped recurring class-template management
 * (`/admin/classes` — CRUD with a visual RRULE editor; `ClassRead` /
 * `ClassWrite`, T5.2).
 *
 * The public {@link ClassesController} endpoint is `@Public()` and excluded from
 * the JWT `TenantMiddleware` (see `AppModule`), so an unauthenticated visitor on a
 * gym subdomain can browse the schedule. The {@link AdminClassTemplatesController}
 * sits behind the `TenantGuard` + global `PermissionsGuard`; the tenant-scoped
 * Prisma client, the guards, and the tenant context all come from the app-wide
 * `TenantModule` / `RbacModule`. The real `ClassInstance`-backed discovery query
 * is wired in Phase 5 (see {@link ClassesService}).
 *
 * The {@link AdminScheduleController} adds the staff console's schedule week-view
 * (`GET /admin/schedule`, T3.1) — the gym's materialised occurrences in a date
 * window, each with its occupancy / trainer / branch / status, shaped for the
 * calendar grid (T3.2) — tenant-scoped and read-only (`ClassRead`), projected in
 * {@link AdminScheduleService} off the `(gymId, startsAt)` index.
 *
 * The {@link BookingsController} adds the member-facing booking surface (`POST`
 * to book, `DELETE` to cancel `/class-instances/:id/bookings`, T5.4 / T5.5) on the
 * same prefix — authenticated and tenant-scoped (behind `TenantGuard` +
 * `PermissionsGuard`, `ClassBook`), with the atomic capacity gate + idempotent
 * retry and the waitlist auto-promote-on-cancellation logic in
 * {@link BookingsService}.
 *
 * The {@link AttendanceController} adds the staff-console attendance surface
 * (`GET`/`POST /admin/class-instances/:id/attendance`, T5.7) — read the roster
 * (`ClassRead`) and record attended / no-show outcomes (`ClassWrite`),
 * completing the occurrence, in {@link AttendanceService}.
 *
 * The {@link MemberBookingsController} adds the member-panel booking-history
 * surface (`GET /me/bookings`, T5.10) — the caller's own bookings across every
 * status, scoped to upcoming / past / all — authenticated and tenant-scoped
 * (behind `TenantGuard` + `PermissionsGuard`, reusing `ClassBook`), projected in
 * {@link MemberBookingsService}.
 *
 * {@link BookingReminderService} is the scheduled cross-tenant job that reminds
 * members ahead of a class they hold a confirmed seat for (T8.6) — it fans each
 * reminder out over the member's preferred channels through the
 * {@link NotificationService} dispatch seam (from the imported
 * {@link NotificationsModule}). Prisma + Redis come from their global modules; the
 * cron runs off the app-wide `ScheduleModule`.
 */
@Module({
  imports: [BillingModule, NotificationsModule],
  controllers: [
    ClassesController,
    AdminClassTemplatesController,
    ClassTypesController,
    AdminScheduleController,
    AdminPtSessionsController,
    BookingsController,
    AttendanceController,
    MemberBookingsController,
  ],
  providers: [
    ClassesService,
    AdminClassTemplatesService,
    ClassTypesService,
    AdminScheduleService,
    PtSessionsService,
    BookingsService,
    BookingReminderService,
    AttendanceService,
    MemberBookingsService,
    ClassOccupancyPublisher,
  ],
})
export class ClassesModule {}
