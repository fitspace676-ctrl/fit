import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
  createServiceCategorySchema,
  createServiceSchema,
  listAdminServicesQuerySchema,
  updateServiceSchema,
  type ListAdminServicesResponse,
  type ListServiceCategoriesResponse,
  type ListServiceStaffResponse,
  type ServiceCategory,
  type ServiceResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { AdminServicesService } from './admin-services.service';

/**
 * Staff-console Services catalogue API (`/admin/services`). Gated like the Shop:
 * `ProductRead` to list, `ProductWrite` to change. The service runs on the
 * tenant-scoped Prisma client, so no handler passes a `gymId`. `staff` and
 * `categories` are declared before `:id` so they are not swallowed by the
 * parameter route.
 */
@Controller('admin/services')
@UseGuards(TenantGuard, PermissionsGuard)
export class AdminServicesController {
  constructor(private readonly services: AdminServicesService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ProductRead)
  async list(@Query() query: unknown): Promise<ListAdminServicesResponse> {
    return this.services.listServices(parse(listAdminServicesQuerySchema, query));
  }

  @Get('staff')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ProductRead)
  async staff(): Promise<ListServiceStaffResponse> {
    return this.services.listStaffOptions();
  }

  /** `GET /admin/services/categories` - the gym's categories, with how many services each files. */
  @Get('categories')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ProductRead)
  async categories(): Promise<ListServiceCategoriesResponse> {
    return this.services.listCategories();
  }

  /** `POST /admin/services/categories` - make a category. A duplicate name is `409`. */
  @Post('categories')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.ProductWrite)
  async createCategory(@Body() body: unknown): Promise<ServiceCategory> {
    return this.services.createCategory(parse(createServiceCategorySchema, body));
  }

  /** `DELETE /admin/services/categories/:id` - remove an unused category; one in use is `409`. */
  @Delete('categories/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ProductWrite)
  async removeCategory(@Param('id') id: string): Promise<{ id: string }> {
    await this.services.deleteCategory(id);
    return { id };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ProductRead)
  async getOne(@Param('id') id: string): Promise<ServiceResponse> {
    return this.services.getService(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.ProductWrite)
  async create(@Body() body: unknown): Promise<ServiceResponse> {
    return this.services.createService(parse(createServiceSchema, body));
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ProductWrite)
  async update(@Param('id') id: string, @Body() body: unknown): Promise<ServiceResponse> {
    return this.services.updateService(id, parse(updateServiceSchema, body));
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ProductWrite)
  async archive(@Param('id') id: string): Promise<ServiceResponse> {
    return this.services.archiveService(id);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ProductWrite)
  async restore(@Param('id') id: string): Promise<ServiceResponse> {
    return this.services.restoreService(id);
  }

  /**
   * `DELETE /admin/services/:id` — permanently remove an ARCHIVED service. An
   * active one is `409 SERVICE_NOT_ARCHIVED` (archive it first); one that has been
   * booked or delivered is `409 SERVICE_HAS_SESSIONS` — that history stays.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ProductWrite)
  async remove(@Param('id') id: string): Promise<{ id: string }> {
    await this.services.deleteService(id);
    return { id };
  }
}

/** Parse with `schema`, raising a `400` listing each failing field as `path: message`. */
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
