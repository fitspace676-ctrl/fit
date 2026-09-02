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
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  Permission,
  createTrainerSchema,
  listAdminTrainersQuerySchema,
  setTrainerAvailabilitySchema,
  updateTrainerSchema,
  type CreateTrainerResponse,
  type GetAdminTrainerResponse,
  type GetTrainerAvailabilityResponse,
  type ListAdminTrainersResponse,
  type SetTrainerAvailabilityResponse,
  type SetTrainerStatusResponse,
  type UpdateTrainerResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { AdminTrainersService } from './admin-trainers.service';

/**
 * Staff-console trainer management API (`/admin/trainers`, T4.4).
 *
 * Mounted under `/admin/trainers` (mirroring `admin/gyms`) so it sits alongside —
 * not on top of — the *public* trainer-discovery surface at `/trainers` (T3.6),
 * which is `@Public()` and excluded from the JWT `TenantMiddleware`. Every route
 * here is tenant-scoped staff access: {@link TenantGuard} pins the request to one
 * gym and {@link PermissionsGuard} enforces the capability. Reads require
 * {@link Permission.TrainerRead}; the writes — create, edit, and
 * deactivate/reactivate — require {@link Permission.TrainerWrite}; editing
 * availability requires {@link Permission.TrainerScheduleManage}. The service
 * runs on the tenant-scoped Prisma client, so no handler ever passes a `gymId`.
 */
@Controller('admin/trainers')
@UseGuards(TenantGuard, PermissionsGuard)
export class AdminTrainersController {
  constructor(private readonly trainers: AdminTrainersService) {}

  /**
   * `GET /admin/trainers?page&limit&search&status&sort&dir` — one filtered,
   * server-paginated page of the gym's trainers. The query is validated up front
   * (a bad page/limit/status is a `400` with per-field detail) so the service only
   * sees a well-formed, defaulted request. An empty page is a normal `200`.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.TrainerRead)
  async list(@Query() query: unknown): Promise<ListAdminTrainersResponse> {
    return this.trainers.listTrainers(parse(listAdminTrainersQuerySchema, query));
  }

  /**
   * `GET /admin/trainers/:id` — one trainer's detail. An unknown or cross-tenant
   * id is a `404 TRAINER_NOT_FOUND` from the service.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.TrainerRead)
  async getOne(@Param('id') id: string): Promise<GetAdminTrainerResponse> {
    return this.trainers.getTrainer(id);
  }

  /**
   * `POST /admin/trainers` — create a trainer (T4.4). The body is validated up
   * front (`name` required, `headline` / `bio` / `photoUrl` / `specialties`
   * optional, `status` defaults to `ACTIVE`). Returns `201` with the detail.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.TrainerWrite)
  async create(@Body() body: unknown): Promise<CreateTrainerResponse> {
    return this.trainers.createTrainer(parse(createTrainerSchema, body));
  }

  /**
   * `PATCH /admin/trainers/:id` — edit a trainer's profile (T4.4). An unknown or
   * cross-tenant id is a `404 TRAINER_NOT_FOUND`. Returns the updated detail.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.TrainerWrite)
  async update(@Param('id') id: string, @Body() body: unknown): Promise<UpdateTrainerResponse> {
    return this.trainers.updateTrainer(id, parse(updateTrainerSchema, body));
  }

  /**
   * `GET /admin/trainers/:id/availability` — the trainer's weekly recurring
   * availability (T5.11). Always a complete seven-day map (a trainer who has never
   * set hours reads back as fully unavailable). A `404 TRAINER_NOT_FOUND` for an
   * unknown / cross-tenant id.
   */
  @Get(':id/availability')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.TrainerRead)
  async getAvailability(@Param('id') id: string): Promise<GetTrainerAvailabilityResponse> {
    return this.trainers.getAvailability(id);
  }

  /**
   * `PUT /admin/trainers/:id/availability` — replace the trainer's weekly
   * availability (T5.11). The whole week is sent and stored as one canonical
   * document; the body is validated up front (`HH:MM` times, `end` after `start`,
   * no overlapping windows, an available day needs a window). Returns the stored
   * availability. A `404` for an unknown / cross-tenant id.
   */
  @Put(':id/availability')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.TrainerScheduleManage)
  async setAvailability(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<SetTrainerAvailabilityResponse> {
    return this.trainers.setAvailability(id, parse(setTrainerAvailabilitySchema, body));
  }

  /**
   * `POST /admin/trainers/:id/deactivate` — set the trainer's status to `INACTIVE`
   * (T4.4). Idempotent; a `404` for an unknown / cross-tenant id. Returns the
   * updated detail.
   */
  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.TrainerWrite)
  async deactivate(@Param('id') id: string): Promise<SetTrainerStatusResponse> {
    return this.trainers.deactivateTrainer(id);
  }

  /**
   * `POST /admin/trainers/:id/reactivate` — set the trainer's status back to
   * `ACTIVE` (T4.4), the inverse of {@link deactivate}. Idempotent; `404`-on-miss.
   */
  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.TrainerWrite)
  async reactivate(@Param('id') id: string): Promise<SetTrainerStatusResponse> {
    return this.trainers.reactivateTrainer(id);
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
