import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  updateGymStatusSchema,
  type ImpersonateResponse,
  type ListAdminGymsResponse,
  type UpdateGymStatusResponse,
} from '@fit/types';
import { AllowCrossTenant } from '../common/decorators/allow-cross-tenant.decorator';
import { TenantContext } from '../common/tenant/tenant.context';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { SuperAdminService } from './superadmin.service';

/**
 * SuperAdmin platform console API (`/admin/gyms`).
 *
 * Every route spans tenants, so each is `@AllowCrossTenant()` and the controller
 * is guarded by {@link TenantGuard}, which honours that decorator only for a
 * `SUPER_ADMIN` caller and rejects everyone else with `403`. The guard is the
 * sole authorization gate: `Gym` / `AuditLog` are not tenant-scoped, so without
 * it any authenticated user could reach the whole platform's roster and the
 * impersonation endpoint. The acting SUPER_ADMIN's id (the audit actor) is read
 * from the {@link TenantContext} the middleware established.
 *
 * Routes use a plain `:id` param (not `:gymId`) so they never collide with the
 * guard's same-tenant `:gymId` path check — on these cross-tenant routes the
 * guard short-circuits before that check anyway.
 */
@Controller('admin/gyms')
@UseGuards(TenantGuard)
export class SuperAdminController {
  constructor(
    private readonly superadmin: SuperAdminService,
    private readonly tenant: TenantContext,
  ) {}

  /** `GET /admin/gyms` — list every gym with status, member count, and MRR. */
  @Get()
  @HttpCode(HttpStatus.OK)
  @AllowCrossTenant()
  async list(): Promise<ListAdminGymsResponse> {
    return this.superadmin.listGyms();
  }

  /** `PATCH /admin/gyms/:id/status` — suspend or reactivate a gym. */
  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @AllowCrossTenant()
  async setStatus(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<UpdateGymStatusResponse> {
    const { status } = parse(updateGymStatusSchema, body);
    return this.superadmin.setGymStatus(this.actorId(), id, status);
  }

  /** `POST /admin/gyms/:id/impersonate` — mint an audited, gym-scoped owner token. */
  @Post(':id/impersonate')
  @HttpCode(HttpStatus.OK)
  @AllowCrossTenant()
  async impersonate(@Param('id') id: string): Promise<ImpersonateResponse> {
    return this.superadmin.impersonate(this.actorId(), id);
  }

  /**
   * The acting SUPER_ADMIN's user id, used as the audit actor. The
   * {@link TenantGuard} has already proven the caller is an authenticated
   * SUPER_ADMIN, so a missing id here is a wiring error, not an auth failure.
   */
  private actorId(): string {
    const userId = this.tenant.userId;
    if (!userId) {
      throw new InternalServerErrorException('No authenticated actor in scope');
    }
    return userId;
  }
}

/**
 * Parse `data` with `schema`, raising a `400` whose `details` list each failing
 * field — mirroring `AuthController` so validation errors read identically
 * across the API.
 */
function parse<TSchema extends z.ZodTypeAny>(schema: TSchema, data: unknown): z.infer<TSchema> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    });
    throw new BadRequestException(details);
  }
  return result.data as z.infer<TSchema>;
}
