import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { Permission, adminScheduleQuerySchema, type AdminScheduleResponse } from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { AdminScheduleService } from './admin-schedule.service';

/**
 * Staff-console schedule week-view API (`/admin/schedule`, T3.1).
 *
 * The read side of the scheduling console's calendar: `GET /admin/schedule` returns
 * the gym's materialised class occurrences in a date window, each with its
 * occupancy, trainer, branch, and status, shaped for the week grid (T3.2). Every
 * route is tenant-scoped staff access — {@link TenantGuard} pins the request to one
 * gym and {@link PermissionsGuard} enforces {@link Permission.ClassRead}, the same
 * capability the class-template roster reads under. The service runs on the
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
