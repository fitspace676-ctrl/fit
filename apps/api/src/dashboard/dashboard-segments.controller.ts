import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  configurableDashboardSegmentSchema,
  dashboardRangeSchema,
  DEFAULT_DASHBOARD_RANGE,
  Permission,
  setDashboardWidgetsSchema,
  type ConfigurableDashboardSegment,
  type DashboardRange,
  type DashboardSegmentResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { DashboardSegmentsService } from './dashboard-segments.service';

/**
 * The segmented dashboard API (`/admin/dashboard/segments`).
 *
 * Both routes gate on {@link Permission.ReportView} — the capability that already
 * lets a user see these numbers. Editing is deliberately NOT on `GymManage`:
 * that is OWNER-only, and a manager who can read the figures is expected to be
 * able to arrange them. The layout is gym-wide, so an edit is visible to every
 * colleague; the console states that where the edit happens.
 */
@Controller('admin/dashboard/segments')
@UseGuards(TenantGuard, PermissionsGuard)
export class DashboardSegmentsController {
  constructor(private readonly segments: DashboardSegmentsService) {}

  /**
   * `GET /admin/dashboard/segments/:segment?range=` — one segment's widgets,
   * resolved to their live sections.
   */
  @Get(':segment')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ReportView)
  async get(
    @Param('segment') segment: string,
    @Query('range') range: string | undefined,
  ): Promise<DashboardSegmentResponse> {
    // `async` (not a plain `Promise`-returning function) so an unknown segment's
    // synchronous `parseSegment` throw is delivered as a rejected promise, not a
    // synchronous throw — Nest, and callers using `.rejects`, both expect that.
    return await this.segments.get(parseSegment(segment), parseRange(range));
  }

  /**
   * `PUT /admin/dashboard/segments/:segment/widgets` — replace the segment's
   * widget selection with the posted set, in display order.
   */
  @Put(':segment/widgets')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.ReportView)
  async setWidgets(@Param('segment') segment: string, @Body() body: unknown): Promise<void> {
    const parsed = parse(setDashboardWidgetsSchema, body);
    await this.segments.setWidgets(parseSegment(segment), parsed.widgetKeys);
  }
}

/**
 * Resolve the `:segment` path param. `overview` is rejected rather than answered
 * with an empty success: it is server-rendered and carries no catalogue, so a
 * client asking for it has a bug worth surfacing.
 */
function parseSegment(raw: string): ConfigurableDashboardSegment {
  const parsed = configurableDashboardSegmentSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestException(`Not a configurable dashboard segment: ${raw}`);
  }
  return parsed.data;
}

/**
 * Resolve `?range=`, falling back to the dashboard default. A hand-edited URL
 * (or a drill-down-only value like `12m`) should land on the default window, not
 * a 400 — the same forgiving rule the overview query already applies.
 */
function parseRange(raw: string | undefined): DashboardRange {
  const parsed = dashboardRangeSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_DASHBOARD_RANGE;
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
