import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { AdminClassTemplatesController } from './admin-class-templates.controller';
import { AdminClassTemplatesService } from './admin-class-templates.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';
import { MemberBookingsController } from './member-bookings.controller';
import { MemberBookingsService } from './member-bookings.service';

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
 */
@Module({
  imports: [BillingModule],
  controllers: [
    ClassesController,
    AdminClassTemplatesController,
    BookingsController,
    AttendanceController,
    MemberBookingsController,
  ],
  providers: [
    ClassesService,
    AdminClassTemplatesService,
    BookingsService,
    AttendanceService,
    MemberBookingsService,
  ],
})
export class ClassesModule {}
