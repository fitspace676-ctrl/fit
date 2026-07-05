import { BadRequestException, Controller, Get, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { z } from 'zod';
import { listLocationsQuerySchema, type ListLocationsResponse } from '@fit/types';
import { Public } from '../common/decorators/public.decorator';
import { LocationsService } from './locations.service';

/**
 * Public location-discovery endpoint.
 *
 * `GET /locations` powers the member-facing choice of where to buy/collect: the
 * purchase wizard's location step (T3.8) and the shop cart's pickup picker (T7.7).
 * A visitor / member browses a gym's branches before any session need exist, so
 * the route is `@Public()` (exempt from the global deny-by-default
 * {@link import('../common/rbac/permissions.guard').PermissionsGuard}) and
 * `locations` is excluded from the JWT `TenantMiddleware` in `AppModule` (which
 * would otherwise 401 a tokenless request). The gym is identified explicitly by
 * the `gymId` query param the client resolves from the subdomain, not a session.
 *
 * Distinct from the staff-only {@link import('./admin-locations.controller').AdminLocationsController}
 * (`/admin/locations`, T4.5), which manages the same `Location` rows behind the
 * `TenantGuard` + permissions.
 */
@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  /**
   * `GET /locations?gymId=<id>` — list the gym's active locations. The query is
   * validated up front (a bad/missing `gymId` is a `400` with per-field details)
   * so the service only ever sees a well-formed request. An empty `locations`
   * array is a normal `200`.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @Public()
  async list(@Query() query: unknown): Promise<ListLocationsResponse> {
    const result = listLocationsQuerySchema.safeParse(query);
    if (!result.success) {
      throw new BadRequestException(formatIssues(result.error));
    }
    return this.locations.listLocations(result.data);
  }
}

/** Flatten Zod issues to `field: message` strings for a `400` body. */
function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}
