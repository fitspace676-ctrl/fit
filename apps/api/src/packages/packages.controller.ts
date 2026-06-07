import { BadRequestException, Controller, Get, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { z } from 'zod';
import { listPackagesQuerySchema, type ListPackagesResponse } from '@fit/types';
import { Public } from '../common/decorators/public.decorator';
import { PackagesService } from './packages.service';

/**
 * Public package-catalogue endpoint.
 *
 * `GET /packages` powers the unauthenticated web purchase wizard's package step
 * (T3.9) and the mobile Personal Training screen (T6.6): a visitor / member
 * browsing a gym's offerings, before any session need exist, so the route is
 * `@Public()` (exempt from the global deny-by-default
 * {@link import('../common/rbac/permissions.guard').PermissionsGuard}) and
 * `packages` is excluded from the JWT `TenantMiddleware` in `AppModule` (which
 * would otherwise 401 a tokenless request). The gym is identified explicitly by
 * the `gymId` query param the client resolves from the subdomain, not a session.
 *
 * Distinct from the staff-only {@link import('./admin-package-plans.controller').AdminPackagePlansController}
 * (`/admin/packages`, T4.11), which manages the same `PackagePlan` rows behind
 * the `TenantGuard` + permissions.
 */
@Controller('packages')
export class PackagesController {
  constructor(private readonly packages: PackagesService) {}

  /**
   * `GET /packages?gymId=<id>&locationId=<id>` — list the gym's purchasable
   * packages. The query is validated up front (a bad/missing `gymId` is a `400`
   * with per-field details) so the service only ever sees a well-formed request;
   * `locationId` is optional and narrows the catalogue to a branch. An empty
   * `packages` array is a normal `200`.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @Public()
  async list(@Query() query: unknown): Promise<ListPackagesResponse> {
    const result = listPackagesQuerySchema.safeParse(query);
    if (!result.success) {
      throw new BadRequestException(formatIssues(result.error));
    }
    return this.packages.listPackages(result.data);
  }
}

/** Flatten Zod issues to `field: message` strings for a `400` body. */
function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}
