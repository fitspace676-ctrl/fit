import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  Permission,
  updateMeProfileSchema,
  type GetMeProfileResponse,
  type UpdateMeProfileResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { MeProfileService } from './me-profile.service';

/**
 * `GET / PATCH /me/profile` — the calling member's own profile (name, email,
 * phone). Self-service behind {@link TenantGuard} + {@link PermissionsGuard}, gated
 * by {@link Permission.ProfileManage} (held by every gym-scoped role).
 */
@Controller('me/profile')
@UseGuards(TenantGuard, PermissionsGuard)
export class MeProfileController {
  constructor(private readonly profile: MeProfileService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ProfileManage)
  async get(): Promise<GetMeProfileResponse> {
    return this.profile.getMyProfile();
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ProfileManage)
  async update(@Body() body: unknown): Promise<UpdateMeProfileResponse> {
    return this.profile.updateMyProfile(parse(updateMeProfileSchema, body));
  }
}

/** Parse `data` with `schema`, raising a `400` listing each failing field. */
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
