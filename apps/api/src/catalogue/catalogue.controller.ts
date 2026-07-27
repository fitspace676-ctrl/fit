import { BadRequestException, Controller, Get, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { z } from 'zod';
import { signupCatalogueQuerySchema, type SignupCatalogueResponse } from '@fit/types';
import { Public } from '../common/decorators/public.decorator';
import { CatalogueService } from './catalogue.service';

/**
 * Public signup-catalogue endpoint.
 *
 * `GET /catalogue` backs the join wizard's branch + product steps, which a
 * visitor browses *before* any account exists. So the route is `@Public()`
 * (exempt from the global deny-by-default `PermissionsGuard`) and `catalogue` is
 * excluded from the JWT `TenantMiddleware` in `AppModule`, which would otherwise
 * 401 a tokenless request. The gym is identified explicitly by the `gymId` query
 * param the client resolves from the subdomain, never by a session.
 *
 * Mirrors {@link import('../packages/packages.controller').PackagesController}
 * in shape; it differs only in composing every catalogue the step needs into one
 * response rather than making the client fan out.
 */
@Controller('catalogue')
export class CatalogueController {
  constructor(private readonly catalogue: CatalogueService) {}

  /**
   * `GET /catalogue?gymId=<id>&locationId=<id>` — the gym's branches plus its
   * packages, subscription plans and credit packs. The query is validated up
   * front (a bad/missing `gymId` is a `400` with per-field details). Empty arrays
   * are a normal `200`, which the wizard renders as its empty state.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @Public()
  async read(@Query() query: unknown): Promise<SignupCatalogueResponse> {
    const result = signupCatalogueQuerySchema.safeParse(query);
    if (!result.success) {
      throw new BadRequestException(formatIssues(result.error));
    }
    return this.catalogue.read(result.data);
  }
}

/** Flatten Zod issues to `field: message` strings for a `400` body. */
function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}
