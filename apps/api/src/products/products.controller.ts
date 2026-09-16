import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { listProductsQuerySchema, type ListProductsResponse } from '@fit/types';
import { Public } from '../common/decorators/public.decorator';
import { PortalBranchService } from '../common/portal-branch.service';
import { ProductsService } from './products.service';

/**
 * Public shop-catalogue endpoint.
 *
 * `GET /products` powers the member-facing storefront on both surfaces: the
 * mobile Shop tab (T6.7) and the web shop listing (T7.6). A visitor / member
 * browses a gym's products before any session need exist, so the route is
 * `@Public()` (exempt from the global deny-by-default
 * {@link import('../common/rbac/permissions.guard').PermissionsGuard}) and
 * `products` is excluded from the JWT `TenantMiddleware` in `AppModule` (which
 * would otherwise 401 a tokenless request). The gym is identified explicitly by
 * the `gymId` query param the client resolves from the subdomain, not a session.
 *
 * Distinct from the staff-only {@link import('./admin-products.controller').AdminProductsController}
 * (`/admin/products`, T4.6), which manages the same `Product` rows behind the
 * `TenantGuard` + permissions.
 */
@Controller('products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly portalBranch: PortalBranchService,
  ) {}

  /**
   * `GET /products?gymId=<id>[&locationId=<id>]` — list the gym's active products
   * available at the caller's branch. The query is validated up front (a
   * bad/missing `gymId` is a `400` with per-field details) so the service only
   * ever sees a well-formed request. The branch is the explicit `locationId`, else
   * a signed-in member's home branch, else every branch
   * ({@link PortalBranchService}); a `locationId` outside the gym is a `404`. An
   * empty `products` array is a normal `200`.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @Public()
  async list(
    @Query() query: unknown,
    @Headers('authorization') authorization?: string,
  ): Promise<ListProductsResponse> {
    const result = listProductsQuerySchema.safeParse(query);
    if (!result.success) {
      throw new BadRequestException(formatIssues(result.error));
    }
    const locationId = await this.portalBranch.resolve({ ...result.data, authorization });
    return this.products.listProducts({ ...result.data, locationId });
  }
}

/** Flatten Zod issues to `field: message` strings for a `400` body. */
function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}
