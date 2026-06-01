import { Controller, Get, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import type { ListGymsResponse } from '@fit/types';
import { AllowCrossTenant } from '../common/decorators/allow-cross-tenant.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { GymsService } from './gyms.service';

/**
 * Platform-wide gym management.
 *
 * Listing gyms spans every tenant, so the route is marked `@AllowCrossTenant()`
 * and guarded by {@link TenantGuard}, which honours that decorator only for a
 * `SUPER_ADMIN` caller and rejects everyone else with `403`. The guard is
 * essential here: `Gym` is **not** a tenant-scoped model, so without it any
 * authenticated user's request would read the whole roster.
 */
@Controller('gyms')
@UseGuards(TenantGuard)
export class GymsController {
  constructor(private readonly gyms: GymsService) {}

  /** `GET /gyms` — list every gym across the platform (SUPER_ADMIN only). */
  @Get()
  @HttpCode(HttpStatus.OK)
  @AllowCrossTenant()
  async list(): Promise<ListGymsResponse> {
    return this.gyms.list();
  }
}
