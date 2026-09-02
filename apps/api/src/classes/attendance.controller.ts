import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  Permission,
  markAttendanceSchema,
  type GetAttendanceRosterResponse,
  type MarkAttendanceResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { AttendanceService } from './attendance.service';

/**
 * Staff-console class-attendance API (`/admin/class-instances/:id/attendance`,
 * T5.7).
 *
 * Mounted under `/admin/class-instances` so it sits alongside the staff console's
 * other tenant-scoped management surfaces — and distinct from both the public
 * `GET /class-instances` discovery endpoint ({@link ClassesController}) and the
 * member-facing `POST/DELETE /class-instances/:id/bookings` booking surface
 * ({@link BookingsController}). Every route is tenant-scoped staff access:
 * {@link TenantGuard} pins the request to one gym and the global
 * {@link PermissionsGuard} enforces the capability. Reading the roster requires
 * {@link Permission.ClassRead}; recording attendance requires
 * {@link Permission.ClassAttendance} — the front-desk / trainer capability, narrower than
 * management. The service runs on the tenant-scoped Prisma client, so no handler
 * ever passes a `gymId`.
 */
@Controller('admin/class-instances')
@UseGuards(TenantGuard, PermissionsGuard)
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  /**
   * `GET /admin/class-instances/:id/attendance` — the occurrence's attendance
   * roster: its held-seat bookings (in booking order) with each member's
   * identity and current attendance status, plus the live seat totals and the
   * attended / no-show tallies. An unknown / cross-tenant id is a `404
   * CLASS_INSTANCE_NOT_FOUND`.
   */
  @Get(':id/attendance')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ClassRead)
  async getRoster(@Param('id') id: string): Promise<GetAttendanceRosterResponse> {
    return this.attendance.getRoster(id);
  }

  /**
   * `POST /admin/class-instances/:id/attendance` — record attendance for one or
   * more held seats in a single call. The body (`{ entries: [{ bookingId, status
   * }] }`) is validated up front: at least one entry, each `bookingId` at most
   * once, `status` either `ATTENDED` or `NO_SHOW`. Recording transitions the
   * occurrence to `COMPLETED` and returns the refreshed roster. Failure modes:
   * `404 CLASS_INSTANCE_NOT_FOUND`, `409 ATTENDANCE_NOT_AVAILABLE` (canceled
   * occurrence), `409 CLASS_NOT_STARTED`, `404 BOOKING_NOT_FOUND`, and `409
   * BOOKING_NOT_ATTENDABLE` (a referenced booking held no seat).
   */
  @Post(':id/attendance')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ClassAttendance)
  async mark(@Param('id') id: string, @Body() body: unknown): Promise<MarkAttendanceResponse> {
    return this.attendance.markAttendance(id, parse(markAttendanceSchema, body));
  }
}

/**
 * Parse `data` with `schema`, raising a `400` whose body lists each failing field
 * as `path: message` — mirroring the other controllers so validation errors read
 * identically across the API.
 */
function parse<TSchema extends z.ZodTypeAny>(schema: TSchema, data: unknown): z.infer<TSchema> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues.map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      }),
    );
  }
  return result.data as z.infer<TSchema>;
}
