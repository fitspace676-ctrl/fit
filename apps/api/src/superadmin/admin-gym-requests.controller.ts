import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  InternalServerErrorException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { createAdminGymRequestSchema, rejectAdminGymRequestSchema } from '@fit/types';
import { AllowCrossTenant } from '../common/decorators/allow-cross-tenant.decorator';
import { TenantContext } from '../common/tenant/tenant.context';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { SuperAdminService } from './superadmin.service';

@Controller('admin/gym-requests')
@UseGuards(TenantGuard)
export class AdminGymRequestsController {
  constructor(
    private readonly superadmin: SuperAdminService,
    private readonly tenant: TenantContext,
  ) {}
  @Post()
  @AllowCrossTenant()
  create(@Body() body: unknown) {
    const parsed = createAdminGymRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => i.message));
    return this.superadmin.createGymRequest(this.actorId(), parsed.data);
  }
  @Get()
  @AllowCrossTenant()
  list() {
    return this.superadmin.listGymRequests();
  }
  @Get(':id')
  @AllowCrossTenant()
  get(@Param('id') id: string) {
    return this.superadmin.getGymRequest(id);
  }
  @Post(':id/link')
  @HttpCode(200)
  @AllowCrossTenant()
  link(@Param('id') id: string) {
    return this.superadmin.regenerateGymRequestLink(this.actorId(), id);
  }
  @Post(':id/approve')
  @HttpCode(200)
  @AllowCrossTenant()
  approve(@Param('id') id: string) {
    return this.superadmin.approveGymRequest(this.actorId(), id);
  }
  @Post(':id/reject')
  @HttpCode(200)
  @AllowCrossTenant()
  reject(@Param('id') id: string, @Body() body: unknown) {
    const parsed = rejectAdminGymRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => i.message));
    return this.superadmin.rejectGymRequest(this.actorId(), id, parsed.data.reason);
  }
  private actorId(): string {
    if (!this.tenant.userId)
      throw new InternalServerErrorException('No authenticated actor in scope');
    return this.tenant.userId;
  }
}
