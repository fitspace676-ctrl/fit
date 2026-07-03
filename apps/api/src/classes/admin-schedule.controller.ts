import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  Permission,
  adminScheduleQuerySchema,
  type AdminScheduleResponse,
  type CancelClassInstanceResponse,
  type GetAdminClassInstanceResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { AdminScheduleService } from './admin-schedule.service';

/**
 * Staff-console schedule week-view API (`/admin/schedule`, T3.1).
 *
 * The scheduling console's calendar: `GET /admin/schedule` returns the gym's
 * materialised class occurrences in a date window, each with its occupancy,
 * trainer, branch, and status, shaped for the week grid (T3.2); `GET
 * /admin/schedule/instances/:id` returns one occurrence in full — its roster and
 * waitlist — for the drawer, and `POST .../cancel` cancels it (T3.3). Every route
 * is tenant-scoped staff access — {@link TenantGuard} pins the request to one gym
 * and {@link PermissionsGuard} enforces the capability: the reads require
 * {@link Permission.ClassRead}, the cancel {@link Permission.ClassWrite} (the same
 * read/write split as class-template management). The service runs on the
 * tenant-scoped Prisma client, so no handler passes or trusts a `gymId`.
 */
@Controller('admin/schedule')
@UseGuards(TenantGuard, PermissionsGuard)
export class AdminScheduleController {
  constructor(private readonly schedule: AdminScheduleService) {}

  /**
   * `GET /admin/schedule?from=<ISO>&to=<ISO>&trainerId=&locationId=` — the gym's
   * class occurrences whose `startsAt` falls in `[from, to)`, ordered by start. The
   * query is validated up front (a missing/non-ISO bound, an inverted range, or an
   * over-wide window is a `400` with per-field detail) so the service only ever
   * sees a well-formed, bounded window. An empty `instances` array is a normal
   * `200`.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ClassRead)
  async list(@Query() query: unknown): Promise<AdminScheduleResponse> {
    return this.schedule.listSchedule(parse(adminScheduleQuerySchema, query));
  }

  /**
   * `GET /admin/schedule/instances/:id` — one occurrence in full for the schedule
   * drawer (T3.3): the denormalised calendar block plus its `waitlistCount` and
   * the roster of live bookings (held seats first, then the waitlist by position).
   * An unknown / cross-tenant id is a `404 CLASS_INSTANCE_NOT_FOUND`.
   */
  @Get('instances/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ClassRead)
  async getInstance(@Param('id') id: string): Promise<GetAdminClassInstanceResponse> {
    return this.schedule.getInstanceDetail(id);
  }

  /**
   * `POST /admin/schedule/instances/:id/cancel` — cancel a scheduled occurrence
   * from the drawer's quick actions (T3.3): every live booking is released (each
   * held seat's class credit refunded), the occurrence is marked `CANCELED` and
   * emptied, and the refreshed detail is returned so the drawer and week grid
   * re-render. Requires {@link Permission.ClassWrite} (the same write capability
   * as class-template management and attendance). Failure modes: `404
   * CLASS_INSTANCE_NOT_FOUND` (unknown / cross-tenant) and `409
   * CLASS_NOT_CANCELABLE` (already canceled / completed).
   */
  @Post('instances/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ClassWrite)
  async cancelInstance(@Param('id') id: string): Promise<CancelClassInstanceResponse> {
    return this.schedule.cancelInstance(id);
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
