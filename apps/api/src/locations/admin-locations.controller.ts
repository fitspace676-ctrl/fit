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
  createLocationSchema,
  listAdminLocationsQuerySchema,
  updateLocationSchema,
  type CreateLocationResponse,
  type GetAdminLocationResponse,
  type ListAdminLocationsResponse,
  type SetLocationStatusResponse,
  type UpdateLocationResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { AdminLocationsService } from './admin-locations.service';

/**
 * Staff-console location management API (`/admin/locations`, T4.5).
 *
 * Mounted under `/admin/locations` (mirroring `admin/trainers`) so it sits
 * alongside — not on top of — the *public* location-discovery surface at
 * `/locations` (T3.8), which is `@Public()` and excluded from the JWT
 * `TenantMiddleware`. Every route here is tenant-scoped staff access:
 * {@link TenantGuard} pins the request to one gym and {@link PermissionsGuard}
 * enforces the capability. Reads require {@link Permission.LocationRead}; the
 * writes — create, edit, and deactivate/reactivate — require
 * {@link Permission.LocationWrite}. The service runs on the tenant-scoped Prisma
 * client, so no handler ever passes a `gymId`.
 */
@Controller('admin/locations')
@UseGuards(TenantGuard, PermissionsGuard)
export class AdminLocationsController {
  constructor(private readonly locations: AdminLocationsService) {}

  /**
   * `GET /admin/locations?page&limit&search&status&sort&dir` — one filtered,
   * server-paginated page of the gym's locations. The query is validated up front
   * (a bad page/limit/status is a `400` with per-field detail) so the service only
   * sees a well-formed, defaulted request. An empty page is a normal `200`.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.LocationRead)
  async list(@Query() query: unknown): Promise<ListAdminLocationsResponse> {
    return this.locations.listLocations(parse(listAdminLocationsQuerySchema, query));
  }

  /**
   * `GET /admin/locations/:id` — one location's detail. An unknown or cross-tenant
   * id is a `404 LOCATION_NOT_FOUND` from the service.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.LocationRead)
  async getOne(@Param('id') id: string): Promise<GetAdminLocationResponse> {
    return this.locations.getLocation(id);
  }

  /**
   * `POST /admin/locations` — create a location (T4.5). The body is validated up
   * front (`name` required, `address` / `phone` / `photoUrl` / `amenities` /
   * `hours` optional, `status` defaults to `ACTIVE`). Returns `201` with the detail.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.LocationWrite)
  async create(@Body() body: unknown): Promise<CreateLocationResponse> {
    return this.locations.createLocation(parse(createLocationSchema, body));
  }

  /**
   * `PATCH /admin/locations/:id` — edit a location's profile (T4.5). An unknown or
   * cross-tenant id is a `404 LOCATION_NOT_FOUND`. Returns the updated detail.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.LocationWrite)
  async update(@Param('id') id: string, @Body() body: unknown): Promise<UpdateLocationResponse> {
    return this.locations.updateLocation(id, parse(updateLocationSchema, body));
  }

  /**
   * `POST /admin/locations/:id/deactivate` — set the location's status to
   * `INACTIVE` (T4.5). Idempotent; a `404` for an unknown / cross-tenant id.
   * Returns the updated detail.
   */
  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.LocationWrite)
  async deactivate(@Param('id') id: string): Promise<SetLocationStatusResponse> {
    return this.locations.deactivateLocation(id);
  }

  /**
   * `POST /admin/locations/:id/reactivate` — set the location's status back to
   * `ACTIVE` (T4.5), the inverse of {@link deactivate}. Idempotent; `404`-on-miss.
   */
  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.LocationWrite)
  async reactivate(@Param('id') id: string): Promise<SetLocationStatusResponse> {
    return this.locations.reactivateLocation(id);
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
