import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  Permission,
  createPackagePlanSchema,
  listAdminPackagePlansQuerySchema,
  updatePackagePlanSchema,
  type CreatePackagePlanResponse,
  type GetAdminPackagePlanResponse,
  type ListAdminPackagePlansResponse,
  type SetPackagePlanStatusResponse,
  type UpdatePackagePlanResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { AdminPackagePlansService } from './admin-package-plans.service';

/**
 * Staff-console personal-training package-plan management API (`/admin/packages`,
 * T4.11).
 *
 * Mounted under `/admin/packages` (mirroring `admin/products`) so it sits
 * alongside the staff console's other tenant-scoped management surfaces. Every
 * route here is tenant-scoped staff access: {@link TenantGuard} pins the request
 * to one gym and {@link PermissionsGuard} enforces the capability. Reads require
 * {@link Permission.PackageRead}; the writes — create, edit, and
 * deactivate/reactivate — require {@link Permission.PackageWrite}. The service
 * runs on the tenant-scoped Prisma client, so no handler ever passes a `gymId`.
 */
@Controller('admin/packages')
@UseGuards(TenantGuard, PermissionsGuard)
export class AdminPackagePlansController {
  constructor(private readonly plans: AdminPackagePlansService) {}

  /**
   * `GET /admin/packages?page&limit&search&status&sort&dir` — one filtered,
   * server-paginated page of the gym's package plans. The query is validated up
   * front (a bad page/limit/status is a `400` with per-field detail) so the
   * service only sees a well-formed, defaulted request. An empty page is a normal
   * `200`.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.PackageRead)
  async list(@Query() query: unknown): Promise<ListAdminPackagePlansResponse> {
    return this.plans.listPackagePlans(parse(listAdminPackagePlansQuerySchema, query));
  }

  /**
   * `GET /admin/packages/:id` — one package plan's detail. An unknown or
   * cross-tenant id is a `404 PACKAGE_PLAN_NOT_FOUND` from the service.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.PackageRead)
  async getOne(@Param('id') id: string): Promise<GetAdminPackagePlanResponse> {
    return this.plans.getPackagePlan(id);
  }

  /**
   * `POST /admin/packages` — create a package plan (T4.11). The body is validated
   * up front (`name` required; the rest optional with defaults, `status` defaults
   * to `ACTIVE`). Returns `201` with the detail.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.PackageWrite)
  async create(@Body() body: unknown): Promise<CreatePackagePlanResponse> {
    return this.plans.createPackagePlan(parse(createPackagePlanSchema, body));
  }

  /**
   * `PATCH /admin/packages/:id` — edit a package plan's profile (T4.11). An unknown
   * or cross-tenant id is a `404 PACKAGE_PLAN_NOT_FOUND`. Returns the updated
   * detail.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.PackageWrite)
  async update(@Param('id') id: string, @Body() body: unknown): Promise<UpdatePackagePlanResponse> {
    return this.plans.updatePackagePlan(id, parse(updatePackagePlanSchema, body));
  }

  /**
   * `POST /admin/packages/:id/deactivate` — set the plan's status to `INACTIVE`
   * (T4.11). Idempotent; a `404` for an unknown / cross-tenant id. Returns the
   * updated detail.
   */
  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.PackageWrite)
  async deactivate(@Param('id') id: string): Promise<SetPackagePlanStatusResponse> {
    return this.plans.deactivatePackagePlan(id);
  }

  /**
   * `POST /admin/packages/:id/reactivate` — set the plan's status back to `ACTIVE`
   * (T4.11), the inverse of {@link deactivate}. Idempotent; `404`-on-miss.
   */
  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.PackageWrite)
  async reactivate(@Param('id') id: string): Promise<SetPackagePlanStatusResponse> {
    return this.plans.reactivatePackagePlan(id);
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
