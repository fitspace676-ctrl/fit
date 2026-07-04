import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  Permission,
  purchaseCreditPackSchema,
  type ListCreditPackCatalogueResponse,
  type ListCreditPacksResponse,
  type PurchaseCreditPackResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CreditPacksService } from './credit-packs.service';

/**
 * Staff-console credit-pack surface (T5.8) — the desk-side counterpart to the
 * member self-service {@link CreditPacksController}.
 *
 * Lets staff read a member's remaining credit balance on the member-detail screen
 * and sell / grant a pack to a member who paid at the desk:
 *
 * - `GET  /admin/members/:id/credit-packs` — the member's usable packs (balance).
 * - `POST /admin/members/:id/credit-packs` — grant the pack named by `{ packId }`.
 * - `GET  /admin/credit-packs/catalogue`   — the gym's buyable packs, for the modal.
 *
 * Reads require {@link Permission.BillingRead} (held by OWNER / MANAGER /
 * RECEPTIONIST — the roles that can view billing); the grant write requires
 * {@link Permission.BillingManage} (OWNER / MANAGER), mirroring the T5.7 admin
 * freeze endpoint. Deliberately *not* the member's `CreditPackManage`, which staff
 * roles don't hold. The service runs on the tenant-scoped Prisma client, so no
 * handler passes a `gymId`; an unknown / cross-tenant member id is a
 * `404 MEMBER_NOT_FOUND`.
 */
@Controller('admin')
@UseGuards(TenantGuard, PermissionsGuard)
export class AdminCreditPacksController {
  constructor(private readonly creditPacks: CreditPacksService) {}

  /**
   * `GET /admin/members/:id/credit-packs` — the named member's usable credit packs
   * (`ACTIVE`, credits remaining), for the member-detail balance. An empty list is
   * a normal `200`; an unknown member is a `404 MEMBER_NOT_FOUND`.
   */
  @Get('members/:id/credit-packs')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.BillingRead)
  async listForMember(@Param('id') id: string): Promise<ListCreditPacksResponse> {
    return this.creditPacks.listMemberCreditPacks(id);
  }

  /**
   * `POST /admin/members/:id/credit-packs` — sell / grant the credit pack named by
   * `{ packId }` to the member. Returns `201 { creditPackId }` with the minted
   * pack. A plan that isn't a purchasable pack is a `422 PACK_UNAVAILABLE`; an
   * unknown member is a `404 MEMBER_NOT_FOUND`.
   */
  @Post('members/:id/credit-packs')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.BillingManage)
  async grantForMember(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<PurchaseCreditPackResponse> {
    return this.creditPacks.grantPackForMember(id, parse(purchaseCreditPackSchema, body));
  }

  /**
   * `GET /admin/credit-packs/catalogue` — the gym's purchasable credit packs
   * (finite, `ACTIVE` session plans), cheapest first, for the "Add credit" modal's
   * picker. An empty list is a normal `200`.
   */
  @Get('credit-packs/catalogue')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.BillingRead)
  async catalogue(): Promise<ListCreditPackCatalogueResponse> {
    return this.creditPacks.listCatalogue();
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
