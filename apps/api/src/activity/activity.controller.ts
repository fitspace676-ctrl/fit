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
import { Permission, listActivityQuerySchema, type ListActivityResponse } from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { ActivityService } from './activity.service';

/**
 * Staff-console Activity feed API (`/admin/activity`, T3.8).
 *
 * A read-only, tenant-scoped, unified stream of the gym's operational events —
 * signups, bookings, check-ins, sales, and subscription enrolments — merged
 * newest-first from the tables that already record them (no new write path).
 * {@link TenantGuard} pins the request to one gym and {@link PermissionsGuard}
 * gates on {@link Permission.ReportView} (held by `OWNER` / `MANAGER`), the same
 * capability the dashboard and analytics screens require. The service constrains
 * every query to the caller's gym, so no handler passes or trusts a `gymId`.
 */
@Controller('admin/activity')
@UseGuards(TenantGuard, PermissionsGuard)
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  /**
   * `GET /admin/activity?page&limit&type&from&to` — one filtered, server-paginated
   * page of the gym's merged activity stream, newest first. The query is validated
   * up front (a bad page/limit/type/date is a `400` with per-field detail) so the
   * service only sees a well-formed, defaulted request. An empty page is a normal
   * `200`.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ReportView)
  async list(@Query() query: unknown): Promise<ListActivityResponse> {
    return this.activity.listActivity(parse(listActivityQuerySchema, query));
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
