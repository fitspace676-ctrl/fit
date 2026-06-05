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
  getTrainerQuerySchema,
  listTrainersQuerySchema,
  type GetTrainerResponse,
  type ListTrainersResponse,
} from '@fit/types';
import { Public } from '../common/decorators/public.decorator';
import { TrainersService } from './trainers.service';

/**
 * Public trainer-discovery endpoint.
 *
 * `GET /trainers` powers the unauthenticated trainers index (T3.6): a visitor
 * browsing a gym's `<slug>.fit.ge` site, before any session exists, so the route
 * is `@Public()` (exempt from the global deny-by-default
 * {@link import('../common/rbac/permissions.guard').PermissionsGuard}) and
 * `trainers` is excluded from the JWT `TenantMiddleware` in `AppModule` (which
 * would otherwise 401 a tokenless request). The gym is identified explicitly by
 * the `gymId` query param the page resolves from the subdomain, not a session.
 */
@Controller('trainers')
export class TrainersController {
  constructor(private readonly trainers: TrainersService) {}

  /**
   * `GET /trainers?gymId=<id>` — list the gym's trainers. The query is validated
   * up front (a bad/missing `gymId` is a `400` with per-field details) so the
   * service only ever sees a well-formed request. An empty `trainers` array is a
   * normal `200`.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @Public()
  async list(@Query() query: unknown): Promise<ListTrainersResponse> {
    const result = listTrainersQuerySchema.safeParse(query);
    if (!result.success) {
      throw new BadRequestException(formatIssues(result.error));
    }
    return this.trainers.listTrainers(result.data);
  }

  /**
   * `GET /trainers/:id?gymId=<id>` — one trainer's profile + schedule. The `id`
   * is the path param; the `gymId` query is validated up front (a bad/missing one
   * is a `400`) so the lookup is always tenant-scoped. An unknown or cross-tenant
   * id is a `404` from the service.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @Public()
  async getOne(@Param('id') id: string, @Query() query: unknown): Promise<GetTrainerResponse> {
    const result = getTrainerQuerySchema.safeParse(query);
    if (!result.success) {
      throw new BadRequestException(formatIssues(result.error));
    }
    return this.trainers.getTrainer(id, result.data);
  }
}

/** Flatten Zod issues to `field: message` strings for a `400` body. */
function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}
