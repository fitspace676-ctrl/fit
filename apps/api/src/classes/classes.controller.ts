import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import {
  getClassInstanceQuerySchema,
  listClassInstancesQuerySchema,
  type GetClassInstanceResponse,
  type ListClassInstancesResponse,
} from '@fit/types';
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

  /**
   * `GET /class-instances/:id?gymId=<id>` — one occurrence's full detail for the
   * member-facing detail page (T5.9). The `id` is the path param; the `gymId`
   * query is validated up front (a bad/missing one is a `400`) so the lookup is
   * always tenant-scoped. An unknown or cross-tenant id is a `404` from the
   * service.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @Public()
  async getOne(
    @Param('id') id: string,
    @Query() query: unknown,
  ): Promise<GetClassInstanceResponse> {
    const result = getClassInstanceQuerySchema.safeParse(query);
    if (!result.success) {
      throw new BadRequestException(formatIssues(result.error));
    }
    return this.classes.getInstance(id, result.data);
  }
}

/** Flatten Zod issues to `field: message` strings for a `400` body. */
function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}
