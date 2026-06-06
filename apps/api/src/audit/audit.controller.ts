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
import { Permission, listAuditLogQuerySchema, type ListAuditLogResponse } from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { AuditService } from './audit.service';

/**
 * Staff-console audit-log viewer API (`/audit-logs`, T4.9).
 *
 * A read-only, tenant-scoped feed of the gym's privileged-action trail.
 * {@link TenantGuard} pins the request to one gym and {@link PermissionsGuard}
 * gates on {@link Permission.AuditRead} (held by `OWNER` / `MANAGER`), so a
 * lower-privileged staff member can never read the trail. The service constrains
 * every query to the caller's gym explicitly, so no handler passes or trusts a
 * `gymId`.
 */
@Controller('audit-logs')
@UseGuards(TenantGuard, PermissionsGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /**
   * `GET /audit-logs?page&limit&action&from&to` — one filtered, server-paginated
   * page of the gym's audit entries, newest first. The query is validated up
   * front (a bad page/limit/date is a `400` with per-field detail) so the service
   * only sees a well-formed, defaulted request. An empty page is a normal `200`.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.AuditRead)
  async list(@Query() query: unknown): Promise<ListAuditLogResponse> {
    return this.audit.listAuditLogs(parse(listAuditLogQuerySchema, query));
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
