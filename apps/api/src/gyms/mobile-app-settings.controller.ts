import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  Permission,
  gymSlugSchema,
  updateMobileAppSettingsSchema,
  uploadMobileAppLoginImageSchema,
} from '@fit/types';
import { Public } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { MobileAppSettingsService } from './mobile-app-settings.service';

@Controller('gyms')
export class MobileAppSettingsController {
  constructor(private readonly settings: MobileAppSettingsService) {}

  @Get('app-settings')
  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermissions(Permission.GymManage)
  get() {
    return this.settings.get();
  }

  @Patch('app-settings')
  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermissions(Permission.GymManage)
  update(@Body() body: unknown) {
    const parsed = updateMobileAppSettingsSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.settings.update(parsed.data);
  }

  @Post('app-settings/login-image')
  @HttpCode(HttpStatus.OK)
  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermissions(Permission.GymManage)
  setLoginImage(@Body() body: unknown) {
    const parsed = uploadMobileAppLoginImageSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.settings.setLoginImage(parsed.data);
  }

  @Delete('app-settings/login-image')
  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermissions(Permission.GymManage)
  clearLoginImage() {
    return this.settings.clearLoginImage();
  }

  @Get('by-subdomain/:slug/app-settings')
  @Public()
  bySlug(@Param('slug') slug: string) {
    const parsed = gymSlugSchema.safeParse(slug);
    if (!parsed.success) throw new NotFoundException('GYM_NOT_FOUND');
    return this.settings.bySlug(parsed.data);
  }
}
