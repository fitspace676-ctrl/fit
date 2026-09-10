import { BadRequestException, Controller, Get, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { z } from 'zod';
import { listPublicBannersQuerySchema, type ListPublicBannersResponse } from '@fit/types';
import { Public } from '../common/decorators/public.decorator';
import { BannersService } from './banners.service';

/**
 * Public banner endpoint (T1.16).
 *
 * `GET /banners` powers the member app's home-screen carousel, which the app draws
 * on its first render — before a session is guaranteed — so the route follows the
 * `GET /trainers` convention exactly: `@Public()` (exempt from the global
 * deny-by-default {@link import('../common/rbac/permissions.guard').PermissionsGuard})
 * and `banners` is excluded from the JWT `TenantMiddleware` in `AppModule`, which
 * would otherwise 401 a tokenless request. The gym is identified explicitly by the
 * `gymId` query param the client resolves from its configured slug, not a session.
 */
@Controller('banners')
export class BannersController {
  constructor(private readonly banners: BannersService) {}

  /**
   * `GET /banners?gymId=<id>` — the gym's live banners, in carousel order. The
   * query is validated up front (a bad/missing `gymId` is a `400` with per-field
   * details). An empty `banners` array is a normal `200`: the gym has no banners,
   * or none of them is running right now.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @Public()
  async list(@Query() query: unknown): Promise<ListPublicBannersResponse> {
    const result = listPublicBannersQuerySchema.safeParse(query);
    if (!result.success) {
      throw new BadRequestException(formatIssues(result.error));
    }
    return this.banners.listBanners(result.data);
  }
}

/** Flatten Zod issues to `field: message` strings for a `400` body. */
function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}
