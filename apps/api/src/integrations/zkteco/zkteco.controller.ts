import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
  connectZktecoSchema,
  setIntegrationEnabledSchema,
  setMemberAccessCardSchema,
  updateZktecoSettingsSchema,
  zktecoOpenDoorSchema,
} from '@fit/types';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../../common/rbac/permissions.guard';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { ZktecoIntegrationService } from './zkteco-integration.service';

const zoneQuerySchema = z.object({ zone: z.string().trim().min(1).max(100).optional() });
const memberIdSchema = z.string().min(1).max(64);

/**
 * The ZKTeco card on the owner's Integrations page. Configuration is OWNER only
 * (GymManage here, the explicit owner check in the service), like Flitt and
 * Sender. Opening the door and the access card belong to reception, so those
 * handlers carry the permission that records a check-in instead; reading who is
 * inside carries the check-in read permission.
 */
@Controller('integrations/zkteco')
@UseGuards(TenantGuard, PermissionsGuard)
@RequirePermissions(Permission.GymManage)
export class ZktecoController {
  constructor(private readonly zkteco: ZktecoIntegrationService) {}

  @Get()
  get() {
    return this.zkteco.get();
  }

  @Put()
  connect(@Body() body: unknown) {
    return this.zkteco.connect(parse(connectZktecoSchema, body));
  }

  @Post('test')
  @HttpCode(200)
  test() {
    return this.zkteco.test();
  }

  @Patch()
  setEnabled(@Body() body: unknown) {
    return this.zkteco.setEnabled(parse(setIntegrationEnabledSchema, body).enabled);
  }

  @Patch('settings')
  updateSettings(@Body() body: unknown) {
    return this.zkteco.updateSettings(parse(updateZktecoSettingsSchema, body));
  }

  @Delete()
  disconnect() {
    return this.zkteco.disconnect();
  }

  @Get('resources')
  resources() {
    return this.zkteco.resources();
  }

  @Post('sync')
  @HttpCode(202)
  sync() {
    return this.zkteco.requestSync();
  }

  @Get('status')
  status() {
    return this.zkteco.status();
  }

  @Post('open-door')
  @HttpCode(200)
  @RequirePermissions(Permission.MemberWrite)
  openDoor(@Body() body: unknown) {
    return this.zkteco.openDoor(parse(zktecoOpenDoorSchema, body ?? {}).target);
  }

  @Get('inside')
  @RequirePermissions(Permission.MemberCheckinRead)
  inside(@Query() query: unknown) {
    return this.zkteco.inside(parse(zoneQuerySchema, query).zone);
  }

  @Put('members/:gymMemberId/card')
  @RequirePermissions(Permission.MemberWrite)
  setMemberCard(@Param('gymMemberId') gymMemberId: string, @Body() body: unknown) {
    return this.zkteco.setMemberCard(
      parse(memberIdSchema, gymMemberId),
      parse(setMemberAccessCardSchema, body).cardNumber,
    );
  }
}

function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException('Invalid integration parameters');
  return result.data as z.infer<T>;
}
