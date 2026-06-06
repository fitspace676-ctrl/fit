import { Module } from '@nestjs/common';
import { AdminClassTemplatesController } from './admin-class-templates.controller';
import { AdminClassTemplatesService } from './admin-class-templates.service';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';

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
 */
@Module({
  controllers: [ClassesController, AdminClassTemplatesController, BookingsController],
  providers: [ClassesService, AdminClassTemplatesService, BookingsService],
})
export class ClassesModule {}
