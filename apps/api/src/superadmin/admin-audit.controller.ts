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
import { listAdminAuditLogQuerySchema, type ListAdminAuditLogResponse } from '@fit/types';
import { AuditService } from '../audit/audit.service';
import { AllowCrossTenant } from '../common/decorators/allow-cross-tenant.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';

/**
 * Platform-wide audit feed (`GET /admin/audit-logs`) — SUPER_ADMIN only.
 *
 * The operator's read of the trail the rest of this module WRITES: gym creation,
 * suspension, and both halves of impersonation. `/audit-logs` already exists as
 * the staff console's view of a single gym; this is deliberately a separate route
 * rather than a flag on that one, because "every gym" and "my gym" are different
 * authorizations — the staff route is pinned by the tenant context and must stay
 * unable to name another gym, while this one is cross-tenant by definition.
 *
 * Its own controller because the route sits under `/admin/audit-logs`, not under
 * `SuperAdminController`'s `/admin/gyms`. The gate is the same: `@AllowCrossTenant`
 * honoured only for a SUPER_ADMIN by {@link TenantGuard}.
 */
@Controller('admin/audit-logs')
@UseGuards(TenantGuard)
export class AdminAuditController {
  constructor(private readonly audit: AuditService) {}

  /**
   * `GET /admin/audit-logs?page&limit&action&gymId&from&to` — one filtered,
   * server-paginated page of the platform's trail, newest first. A bad
   * page/limit/date is a `400` with per-field detail; an empty page is a normal
   * `200`.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @AllowCrossTenant()
  async list(@Query() query: unknown): Promise<ListAdminAuditLogResponse> {
    return this.audit.listPlatformAuditLogs(parse(listAdminAuditLogQuerySchema, query));
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
