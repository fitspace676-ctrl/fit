import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Permission } from '@fit/types';
import { z } from 'zod';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { MePhotoService } from './me-photo.service';

const uploadSchema = z
  .object({
    contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    contentLength: z.number().int().positive(),
  })
  .strict();
const photoSchema = z.object({ photoUrl: z.string().url().max(2048) }).strict();

@Controller('me/profile/photo')
@UseGuards(TenantGuard, PermissionsGuard)
export class MePhotoController {
  constructor(private readonly photos: MePhotoService) {}

  @Post('upload')
  @RequirePermissions(Permission.ProfileManage)
  upload(@Body() body: unknown) {
    const parsed = uploadSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid photo upload');
    return this.photos.createUpload(parsed.data);
  }

  @Patch()
  @RequirePermissions(Permission.ProfileManage)
  set(@Body() body: unknown) {
    const parsed = photoSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid photo');
    return this.photos.setPhoto(parsed.data.photoUrl);
  }

  @Delete()
  @RequirePermissions(Permission.ProfileManage)
  remove() {
    return this.photos.setPhoto(null);
  }
}
