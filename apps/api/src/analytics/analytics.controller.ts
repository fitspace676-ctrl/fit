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
import { analyticsQuerySchema, Permission, type AdminAnalyticsResponse } from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { AnalyticsService } from './analytics.service';

/**
 * Admin-console analytics API (`/admin/analytics`).
 *
 * A read-only, tenant-scoped set of range-windowed aggregations powering the
 * Analytics screen's KPIs and charts. {@link TenantGuard} pins the request to one
 * gym and {@link PermissionsGuard} gates on {@link Permission.ReportView} (held by
 * `OWNER` / `MANAGER`) — the same reporting capability the dashboard KPIs use — so
 * a lower-privileged staff member never sees the figures. The service scopes every
 * aggregate to the caller's gym via the tenant Prisma extension, so no handler
 * passes or trusts a `gymId`.
 */
@Controller('admin/analytics')
@UseGuards(TenantGuard, PermissionsGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /**
   * `GET /admin/analytics?range=` — one range-windowed analytics snapshot (KPIs,
   * revenue series, channel mix, plan mix, top classes) for the caller's own gym.
   * `range` defaults to `30d`; an unknown value is a `400`.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ReportView)
  async getAnalytics(@Query() query: unknown): Promise<AdminAnalyticsResponse> {
    const { range } = parse(analyticsQuerySchema, query);
    return this.analytics.getAnalytics(range);
  }
}

/** Validate `data` against `schema`, raising a `400` with per-field detail on failure. */
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
