import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  UseGuards,
} from '@nestjs/common';
import type { AdminOperator } from '@fit/types';
import { AllowCrossTenant } from '../common/decorators/allow-cross-tenant.decorator';
import { TenantContext } from '../common/tenant/tenant.context';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { SuperAdminService } from './superadmin.service';

/**
 * The operator's own identity (`GET /admin/me`) — SUPER_ADMIN only.
 *
 * The console draws who is signed in, and a SUPER_ADMIN session is tenant-less,
 * so `/me/profile` (which answers for a membership in one gym) refuses it with
 * `TENANT_REQUIRED`. Its own controller because the route sits beside
 * `/admin/gyms` rather than under it; the gate is the same `@AllowCrossTenant`,
 * honoured only for a SUPER_ADMIN by {@link TenantGuard}.
 */
@Controller('admin/me')
@UseGuards(TenantGuard)
export class AdminOperatorController {
  constructor(
    private readonly superadmin: SuperAdminService,
    private readonly tenant: TenantContext,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @AllowCrossTenant()
  async me(): Promise<AdminOperator> {
    const userId = this.tenant.userId;
    if (!userId) {
      throw new InternalServerErrorException('No authenticated actor in scope');
    }
    return this.superadmin.getOperator(userId);
  }
}
