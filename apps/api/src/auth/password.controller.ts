import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@fit/db';
import { activateAccountSchema, loginSchema, refreshSchema } from '@fit/types';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/rbac/roles.guard';
import { RateLimit, RATE_LIMITS } from '../common/rate-limit/rate-limit.decorator';
import { TenantContext } from '../common/tenant/tenant.context';
import { AuthService } from './auth.service';

@Controller('me/password')
export class PasswordController {
  constructor(
    private readonly auth: AuthService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  @HttpCode(200)
  @Roles(Role.OWNER, Role.MANAGER, Role.RECEPTIONIST, Role.TRAINER)
  @UseGuards(RolesGuard)
  @RateLimit(RATE_LIMITS.authStrict)
  async change(@Body() body: unknown) {
    const input = activateAccountSchema
      .pick({ password: true })
      .extend({
        currentPassword: loginSchema.shape.password,
        refreshToken: refreshSchema.shape.refreshToken,
      })
      .safeParse(body);
    if (!input.success)
      throw new BadRequestException({
        code: 'PASSWORD_INVALID',
        message: 'Invalid password input',
      });
    const userId = this.tenant.userId;
    if (!userId) throw new UnauthorizedException();
    return this.auth.changePassword(userId, this.tenant.gymId, input.data);
  }
}
