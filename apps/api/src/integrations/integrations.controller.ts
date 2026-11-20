import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  Permission,
  connectSenderSchema,
  sendTestSmsSchema,
  connectFlittSchema,
  setIntegrationEnabledSchema,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { IntegrationsService } from './integrations.service';

@Controller('integrations')
@UseGuards(TenantGuard, PermissionsGuard)
@RequirePermissions(Permission.GymManage)
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  list() {
    return this.integrations.list();
  }

  @Put('sender')
  connectSender(@Body() body: unknown) {
    return this.integrations.connectSender(parse(connectSenderSchema, body));
  }

  @Post('sender/test')
  @HttpCode(200)
  testSender() {
    return this.integrations.testSender();
  }

  @Patch('sender')
  setSenderEnabled(@Body() body: unknown) {
    return this.integrations.setEnabled(parse(setIntegrationEnabledSchema, body).enabled, 'sender');
  }

  @Delete('sender')
  disconnectSender() {
    return this.integrations.disconnect('sender');
  }

  @Post('sender/test-message')
  @HttpCode(200)
  sendTestSms(@Body() body: unknown) {
    return this.integrations.sendTestSms(parse(sendTestSmsSchema, body).phone);
  }

  @Put('flitt')
  connect(@Body() body: unknown) {
    return this.integrations.connect(parse(connectFlittSchema, body));
  }

  @Post('flitt/test')
  @HttpCode(200)
  test() {
    return this.integrations.test();
  }

  @Patch('flitt')
  setEnabled(@Body() body: unknown) {
    return this.integrations.setEnabled(parse(setIntegrationEnabledSchema, body).enabled);
  }

  @Delete('flitt')
  disconnect() {
    return this.integrations.disconnect();
  }
}

function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException('Invalid integration parameters');
  return result.data as z.infer<T>;
}
