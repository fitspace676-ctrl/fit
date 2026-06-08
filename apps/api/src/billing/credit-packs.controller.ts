import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { Permission, purchaseCreditPackSchema, type PurchaseCreditPackResponse } from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CreditPacksService } from './credit-packs.service';

/**
 * Member credit-pack purchase endpoint (`POST /credit-packs/purchase`, T8.5).
 *
 * A member buying a class pass for *themselves* — the gym + member are the
 * authenticated caller's own (resolved from the session, never off the wire), so
 * the body carries only the catalogue `packId`. Sits behind {@link TenantGuard} +
 * the global {@link PermissionsGuard} and requires
 * {@link Permission.CreditPackManage} (granted to the `MEMBER` role for this
 * self-service). The service runs on the tenant-scoped Prisma client, so no
 * handler passes a `gymId`. Distinct from the member's own pack listing
 * ({@link MemberCreditPacksController}, `GET /members/me/credit-packs`).
 */
@Controller('credit-packs')
@UseGuards(TenantGuard, PermissionsGuard)
export class CreditPacksController {
  constructor(private readonly creditPacks: CreditPacksService) {}

  /**
   * `POST /credit-packs/purchase` — buy the credit pack named by `packId`. Returns
   * `201 { creditPackId }` with the freshly minted pack. A plan that isn't a
   * purchasable pack (missing, not `ACTIVE`, or granting no finite credit count)
   * is a `422 { code: 'PACK_UNAVAILABLE' }`.
   */
  @Post('purchase')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.CreditPackManage)
  async purchase(@Body() body: unknown): Promise<PurchaseCreditPackResponse> {
    return this.creditPacks.purchasePack(parse(purchaseCreditPackSchema, body));
  }
}

/**
 * Parse `data` with `schema`, raising a `400` whose body lists each failing field
 * as `path: message` — mirroring the other controllers so validation errors read
 * identically across the API.
 */
function parse<TSchema extends z.ZodTypeAny>(schema: TSchema, data: unknown): z.infer<TSchema> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues.map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      }),
    );
  }
  return result.data as z.infer<TSchema>;
}
