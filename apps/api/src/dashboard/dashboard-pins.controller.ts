import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  createDashboardPinSchema,
  Permission,
  type DashboardPin,
  type DashboardPinsResponse,
  type DashboardWidgetsResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { DashboardPinsService } from './dashboard-pins.service';

/**
 * "Pin to Dashboard" API (`/admin/dashboard/pins`, T12.12).
 *
 * Per-user, per-gym pinning of drill-down report widgets. {@link TenantGuard} pins
 * the gym and {@link PermissionsGuard} gates every route on
 * {@link Permission.ReportView} — the same capability that lets a user view the
 * reports they are pinning. The service scopes each pin to the authenticated user
 * as well as the gym, so one staff member's pins are invisible to another.
 */
@Controller('admin/dashboard/pins')
@UseGuards(TenantGuard, PermissionsGuard)
export class DashboardPinsController {
  constructor(private readonly pins: DashboardPinsService) {}

  /** `GET /admin/dashboard/pins` — the caller's pins (for the reports pin toggles). */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ReportView)
  list(): Promise<DashboardPinsResponse> {
    return this.pins.list();
  }

  /**
   * `GET /admin/dashboard/pins/widgets` — the caller's pins resolved to their live
   * report sections, for the dashboard to render. Declared before nothing that could
   * capture `widgets` as a param, so the literal segment always resolves here.
   */
  @Get('widgets')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ReportView)
  widgets(): Promise<DashboardWidgetsResponse> {
    return this.pins.widgets();
  }

  /** `POST /admin/dashboard/pins` — pin one report section (idempotent). */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.ReportView)
  create(@Body() body: unknown): Promise<DashboardPin> {
    return this.pins.create(parse(createDashboardPinSchema, body));
  }

  /** `DELETE /admin/dashboard/pins/:id` — unpin one of the caller's widgets. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.ReportView)
  async remove(@Param('id') id: string): Promise<void> {
    await this.pins.remove(id);
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
