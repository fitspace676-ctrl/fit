import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  Permission,
  updateGymSettingsSchema,
  uploadGymLogoSchema,
  uploadGymPortalImageSchema,
  type GetGymSettingsResponse,
  type UpdateGymSettingsResponse,
  type UploadGymLogoResponse,
  type UploadGymPortalImageResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { GymSettingsService } from './gym-settings.service';

/**
 * Staff-console gym-settings API (`/gyms/settings`, T4.8).
 *
 * Every route is tenant-scoped owner configuration: {@link TenantGuard} pins the
 * request to one gym and {@link PermissionsGuard} enforces {@link
 * Permission.GymManage} — the OWNER-only capability the admin nav already gates
 * the Settings link on. The owning gym is taken from the session
 * ({@link GymSettingsService} reads `tenant.gymId`), never a path param: the
 * plan's `/gyms/:gymId/settings` shape is realised here as `/gyms/settings` with
 * the gym derived from the verified session, consistent with every other
 * tenant-scoped controller and free of the cross-tenant footgun a path `gymId`
 * would introduce.
 *
 * A separate controller from {@link GymsController} (the public + SUPER_ADMIN
 * roster surface) so the two very different authorization models don't entangle,
 * while both stay under the `gyms` resource.
 */
@Controller('gyms')
@UseGuards(TenantGuard, PermissionsGuard)
export class GymSettingsController {
  constructor(private readonly settings: GymSettingsService) {}

  /** `GET /gyms/settings` — the gym's full brand / locale / hours / policies. */
  @Get('settings')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.GymManage)
  async get(): Promise<GetGymSettingsResponse> {
    return this.settings.getSettings();
  }

  /**
   * `PATCH /gyms/settings` — partial update of any settings section. The body is
   * validated up front (unknown keys and malformed colours/timezone/email are a
   * `400` with per-field detail); an under-privileged caller is a `403` from the
   * guard. Returns the full, updated settings.
   */
  @Patch('settings')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.GymManage)
  async update(@Body() body: unknown): Promise<UpdateGymSettingsResponse> {
    return this.settings.updateSettings(parse(updateGymSettingsSchema, body));
  }

  /**
   * `POST /gyms/settings/logo` — finalise a logo upload by its R2 `photoKey`,
   * storing the resulting public URL as the brand logo and returning it.
   */
  @Post('settings/logo')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.GymManage)
  async setLogo(@Body() body: unknown): Promise<UploadGymLogoResponse> {
    return this.settings.setLogo(parse(uploadGymLogoSchema, body));
  }

  /**
   * `POST /gyms/settings/portal-image` — finalise the member portal's sign-in
   * photograph by its R2 `photoKey`, storing the resulting public URL under
   * `memberPortal.loginImageUrl` and returning it. Same shape, guard and upload
   * flow as {@link setLogo}; a separate route because the two images are separate
   * settings — a gym may skin its portal without touching what prints on invoices.
   */
  @Post('settings/portal-image')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.GymManage)
  async setPortalImage(@Body() body: unknown): Promise<UploadGymPortalImageResponse> {
    return this.settings.setPortalImage(parse(uploadGymPortalImageSchema, body));
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
