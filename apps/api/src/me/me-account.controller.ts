import { Controller, Delete, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { Role } from '@fit/db';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/rbac/roles.guard';
import { MeAccountService } from './me-account.service';

@Controller('me/account')
export class MeAccountController {
  constructor(private readonly account: MeAccountService) {}

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...Object.values(Role))
  @UseGuards(RolesGuard)
  async delete(): Promise<void> {
    await this.account.deleteMyAccount();
  }
}
