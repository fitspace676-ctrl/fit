import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Permission } from '@fit/types';
import { z } from 'zod';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { TenantContext } from '../common/tenant/tenant.context';
import { BookingRulesService } from './booking-rules.service';

@Controller('admin/booking-blocks')
@UseGuards(TenantGuard, PermissionsGuard)
export class AdminBookingBlocksController {
  constructor(
    private readonly rules: BookingRulesService,
    private readonly tenant: TenantContext,
  ) {}

  @Get()
  @RequirePermissions(Permission.ClassAttendance)
  list(@Query() query: unknown) {
    const parsed = z
      .object({
        status: z.enum(['active', 'all']).default('active'),
        memberId: z.string().min(1).optional(),
      })
      .safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.rules.listBlocks(this.tenant.gymId, parsed.data);
  }

  @Post(':id/lift')
  @HttpCode(200)
  @RequirePermissions(Permission.ClassAttendance)
  lift(@Param('id') id: string) {
    return this.rules.liftBlock(this.tenant.gymId, id, this.tenant.userId!);
  }
}
