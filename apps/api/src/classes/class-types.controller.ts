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
  createClassTypeSchema,
  listAdminClassTypesQuerySchema,
  updateClassTypeSchema,
  type AdminClassTypeDetail,
  type AdminClassTypeOption,
  type GetAdminClassTypeResponse,
  type ListAdminClassTypesResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { ClassTypesService } from './class-types.service';

/**
 * Staff-console class-type catalogue API (`/admin/class-types`).
 *
 * A class type is a reusable "kind" of class (Boxing, Yoga) staff curate here and
 * then schedule single occurrences of on the calendar. Every route is tenant-scoped
 * staff access — {@link TenantGuard} pins the request to one gym and
 * {@link PermissionsGuard} enforces the capability. Reads require
 * {@link Permission.ClassRead}; the writes — create, edit, and activate/deactivate —
 * require {@link Permission.ClassWrite} (the same read/write split as class-template
 * and schedule management). The service runs on the tenant-scoped Prisma client, so
 * no handler passes a `gymId`.
 */
@Controller('admin/class-types')
@UseGuards(TenantGuard, PermissionsGuard)
export class ClassTypesController {
  constructor(private readonly classTypes: ClassTypesService) {}

  /**
   * `GET /admin/class-types?page&limit&search&status&sort&dir` — one filtered,
   * server-paginated page of the gym's class types. The query is validated up
   * front (bad page/limit/status → `400`). An empty page is a normal `200`.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ClassRead)
  async list(@Query() query: unknown): Promise<ListAdminClassTypesResponse> {
    return this.classTypes.listClassTypes(parse(listAdminClassTypesQuerySchema, query));
  }

  /**
   * `GET /admin/class-types/options` — the gym's active types as slim options for
   * the schedule's "Add Class" type-picker. Declared before `:id` so the literal
   * path wins over the param route.
   */
  @Get('options')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ClassRead)
  async options(): Promise<AdminClassTypeOption[]> {
    return this.classTypes.listActiveOptions();
  }

  /**
   * `GET /admin/class-types/:id` — one class type's detail. An unknown or
   * cross-tenant id is a `404 CLASS_TYPE_NOT_FOUND`.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ClassRead)
  async getOne(@Param('id') id: string): Promise<GetAdminClassTypeResponse> {
    return this.classTypes.getClassType(id);
  }

  /**
   * `POST /admin/class-types` — create a class type. `name`, `capacity`, and
   * `durationMinutes` are required; the rest optional with defaults; `status`
   * defaults to `ACTIVE`. Returns `201` with the detail.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.ClassWrite)
  async create(@Body() body: unknown): Promise<AdminClassTypeDetail> {
    return this.classTypes.createClassType(parse(createClassTypeSchema, body));
  }

  /**
   * `PATCH /admin/class-types/:id` — edit a class type's profile (partial body).
   * An unknown / cross-tenant id is a `404 CLASS_TYPE_NOT_FOUND`. Returns the
   * updated detail.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ClassWrite)
  async update(@Param('id') id: string, @Body() body: unknown): Promise<AdminClassTypeDetail> {
    return this.classTypes.updateClassType(id, parse(updateClassTypeSchema, body));
  }

  /**
   * `POST /admin/class-types/:id/deactivate` — soft-retire a type (status
   * `INACTIVE`), hiding it from the scheduler. Idempotent; `404`-on-miss.
   */
  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ClassWrite)
  async deactivate(@Param('id') id: string): Promise<AdminClassTypeDetail> {
    return this.classTypes.deactivateClassType(id);
  }

  /**
   * `POST /admin/class-types/:id/activate` — reactivate a type (status `ACTIVE`),
   * the inverse of {@link deactivate}. Idempotent; `404`-on-miss.
   */
  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ClassWrite)
  async activate(@Param('id') id: string): Promise<AdminClassTypeDetail> {
    return this.classTypes.activateClassType(id);
  }
}

/**
 * Parse `data` with `schema`, raising a `400` whose body lists each failing field
 * as `path: message` — mirroring the other controllers.
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
