import { BadRequestException, Controller, Get, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { z } from 'zod';
import { listClassInstancesQuerySchema, type ListClassInstancesResponse } from '@fit/types';
import { Public } from '../common/decorators/public.decorator';
import { ClassesService } from './classes.service';

/**
 * Public class-discovery endpoint.
 *
 * `GET /class-instances` powers the unauthenticated classes page (T3.4): a
 * visitor browsing a gym's `<slug>.fit.ge` site, before any session exists, so
 * the route is `@Public()` (exempt from the global deny-by-default
 * {@link PermissionsGuard}) and `class-instances` is excluded from the JWT
 * `TenantMiddleware` in `AppModule` (which would otherwise 401 a tokenless
 * request). The gym is identified explicitly by the `gymId` query param the
 * page resolves from the subdomain, not from a session.
 */
@Controller('class-instances')
export class ClassesController {
  constructor(private readonly classes: ClassesService) {}

  /**
   * `GET /class-instances?gymId=<id>&from=<ISO>&to=<ISO>&view=week|list` —
   * list the gym's class occurrences overlapping `[from, to)`. The query is
   * validated up front (a bad/missing `gymId`, a non-ISO bound, or an inverted
   * range is a `400` with per-field details) so the service only ever sees a
   * well-formed window. An empty `instances` array is a normal `200`.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @Public()
  async list(@Query() query: unknown): Promise<ListClassInstancesResponse> {
    const result = listClassInstancesQuerySchema.safeParse(query);
    if (!result.success) {
      throw new BadRequestException(formatIssues(result.error));
    }
    return this.classes.listInstances(result.data);
  }
}

/** Flatten Zod issues to `field: message` strings for a `400` body. */
function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}
