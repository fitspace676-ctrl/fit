import { Controller, Get, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { Permission, type ListCreditPacksResponse } from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CreditPacksService } from './credit-packs.service';

/**
 * Member credit-pack listing endpoint (`GET /members/me/credit-packs`, T8.5).
 *
 * The `/members/me` prefix makes it self-service: the caller reads *their own*
 * remaining credits, resolved from the session — there is no member id on the
 * wire — for the member dashboard / mobile profile. Sits behind {@link TenantGuard}
 * + the global {@link PermissionsGuard} and reuses {@link Permission.CreditPackManage}
 * (granted to `MEMBER`), the same capability that gates buying a pack. Distinct
 * from the purchase action ({@link CreditPacksController}, `POST /credit-packs/
 * purchase`). The service runs on the tenant-scoped Prisma client, so no handler
 * passes a `gymId`.
 */
@Controller('members/me/credit-packs')
@UseGuards(TenantGuard, PermissionsGuard)
export class MemberCreditPacksController {
  constructor(private readonly creditPacks: CreditPacksService) {}

  /**
   * `GET /members/me/credit-packs` — the calling member's usable credit packs
   * (`ACTIVE`, with credits left), ordered by the pack expiring soonest first.
   * An empty list is a normal `200` — a member who has bought no packs.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.CreditPackManage)
  async list(): Promise<ListCreditPacksResponse> {
    return this.creditPacks.listMyCreditPacks();
  }
}
