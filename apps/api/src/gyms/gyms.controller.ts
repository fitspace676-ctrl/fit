import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { gymSlugSchema, type GymBySubdomainResponse, type ListGymsResponse } from '@fit/types';
import { AllowCrossTenant } from '../common/decorators/allow-cross-tenant.decorator';
import { Public } from '../common/decorators/public.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { GymsService } from './gyms.service';

/**
 * Gym lookup endpoints.
 *
 * Two very different audiences, so authorization is declared per route rather
 * than on the controller:
 *
 * - `GET /gyms` — the platform-wide roster. Spans every tenant, so it is
 *   `@AllowCrossTenant()` + {@link TenantGuard}, which honours that decorator
 *   only for a `SUPER_ADMIN` and rejects everyone else with `403`. Essential:
 *   `Gym` is not a tenant-scoped model, so without the guard any authenticated
 *   user could read the whole roster.
 * - `GET /gyms/by-subdomain/:slug` — the public tenant lookup a `<slug>.fit.ge`
 *   visitor resolves before any session exists, so it is `@Public()`.
 */
@Controller('gyms')
export class GymsController {
  constructor(private readonly gyms: GymsService) {}

  /** `GET /gyms` — list every gym across the platform (SUPER_ADMIN only). */
  @Get()
  @HttpCode(HttpStatus.OK)
  @UseGuards(TenantGuard)
  @AllowCrossTenant()
  async list(): Promise<ListGymsResponse> {
    return this.gyms.list();
  }

  /**
   * `GET /gyms/by-subdomain/:slug` — resolve a tenant subdomain to its public
   * entry view, or `404 GYM_NOT_FOUND`. Public: a visitor hits this before
   * authenticating. The slug is normalised/validated with the same schema that
   * provisioning uses, so a malformed or reserved label is a `404` rather than a
   * wasted query.
   */
  @Get('by-subdomain/:slug')
  @HttpCode(HttpStatus.OK)
  @Public()
  async bySubdomain(@Param('slug') slug: string): Promise<GymBySubdomainResponse> {
    const parsed = gymSlugSchema.safeParse(slug);
    if (!parsed.success) {
      // A non-slug or reserved label can never name a tenant — same 404 as a
      // miss, without revealing the validation detail or hitting the DB.
      throw new NotFoundException({ message: 'Gym not found', code: 'GYM_NOT_FOUND' });
    }
    return this.gyms.resolveBySubdomain(parsed.data);
  }
}
