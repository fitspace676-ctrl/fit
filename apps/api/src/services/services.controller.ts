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
import { listServicesQuerySchema, type ListServicesResponse } from '@fit/types';
import { Public } from '../common/decorators/public.decorator';
import { PortalBranchService } from '../common/portal-branch.service';
import { ServicesService } from './services.service';

/**
 * Public services catalogue for the member portal.
 *
 * `GET /services?gymId=<id>` lists a gym's ACTIVE services for a visitor
 * browsing its `<slug>.fit.ge` site, so the route is `@Public()` and `services`
 * is excluded from the JWT `TenantMiddleware` in `AppModule` (the admin
 * catalogue stays under `/admin/services`, tenant-scoped and guarded). The gym
 * is named by the `gymId` query param the page resolves from the subdomain.
 * The branch is the explicit `locationId`, else a signed-in member's home
 * branch, else every branch ({@link PortalBranchService}).
 */
@Controller('services')
export class ServicesController {
  constructor(
    private readonly services: ServicesService,
    private readonly portalBranch: PortalBranchService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @Public()
  async list(
    @Query() query: unknown,
    @Headers('authorization') authorization?: string,
  ): Promise<ListServicesResponse> {
    const result = listServicesQuerySchema.safeParse(query);
    if (!result.success) {
      throw new BadRequestException(formatIssues(result.error));
    }
    const locationId = await this.portalBranch.resolve({ ...result.data, authorization });
    return this.services.listServices({ ...result.data, locationId });
  }
}

/** Flatten Zod issues to `field: message` strings for a `400` body. */
function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}
