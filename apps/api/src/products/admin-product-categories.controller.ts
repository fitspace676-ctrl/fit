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
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  Permission,
  createProductCategorySchema,
  updateProductCategorySchema,
  type DeleteProductCategoryResponse,
  type ListAdminProductCategoriesResponse,
  type ProductCategoryResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { AdminProductCategoriesService } from './admin-product-categories.service';

/**
 * Staff-console product-category management API (`/admin/product-categories`).
 *
 * A sibling of `/admin/products` rather than a path under it: `admin/products/:id`
 * already owns that segment, so a nested `categories` collection would have to be
 * declared ahead of the param route to avoid being swallowed by it.
 *
 * Categories are part of the catalogue, so they reuse its capabilities rather than
 * introducing a permission of their own: reading requires
 * {@link Permission.ProductRead}, and every write — create, rename, delete —
 * requires {@link Permission.ProductWrite}. The service runs on the tenant-scoped
 * Prisma client, so no handler ever passes a `gymId`.
 */
@Controller('admin/product-categories')
@UseGuards(TenantGuard, PermissionsGuard)
export class AdminProductCategoriesController {
  constructor(private readonly categories: AdminProductCategoriesService) {}

  /**
   * `GET /admin/product-categories` — every category in the gym, by name, each with
   * the number of products on its shelf. An empty list is a normal `200` (a gym
   * that hasn't organised its catalogue yet).
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ProductRead)
  async list(): Promise<ListAdminProductCategoriesResponse> {
    return this.categories.listCategories();
  }

  /**
   * `POST /admin/product-categories` — create a category (`201`). A blank or
   * over-long name is a `400`; a name already used in this gym is a `409`.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.ProductWrite)
  async create(@Body() body: unknown): Promise<ProductCategoryResponse> {
    return this.categories.createCategory(parse(createProductCategorySchema, body));
  }

  /**
   * `PATCH /admin/product-categories/:id` — rename a category; the products on its
   * shelf follow automatically. A cross-tenant or unknown id is a `404`, a
   * colliding name a `409`.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ProductWrite)
  async rename(@Param('id') id: string, @Body() body: unknown): Promise<ProductCategoryResponse> {
    return this.categories.renameCategory(id, parse(updateProductCategorySchema, body));
  }

  /**
   * `DELETE /admin/product-categories/:id` — delete a category. Its products are
   * **not** deleted; they fall back to uncategorised, and the response reports how
   * many did. A cross-tenant or unknown id is a `404`.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ProductWrite)
  async remove(@Param('id') id: string): Promise<DeleteProductCategoryResponse> {
    return this.categories.deleteCategory(id);
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
