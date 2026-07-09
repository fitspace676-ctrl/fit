import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
  adjustLoyaltyPointsSchema,
  createLoyaltyRewardSchema,
  listRedemptionsQuerySchema,
  loyaltyTimeseriesQuerySchema,
  loyaltyTopEarnersQuerySchema,
  redeemRewardSchema,
  updateLoyaltyProgramSchema,
  updateLoyaltyRewardSchema,
  type ListLoyaltyRewardsResponse,
  type ListRedemptionsResponse,
  type LoyaltyCatalogResponse,
  type LoyaltyPointsTimeseriesResponse,
  type LoyaltyProgramResponse,
  type LoyaltyRedemptionsByTypeResponse,
  type LoyaltyRewardRow,
  type LoyaltySummaryResponse,
  type LoyaltyTopEarnersResponse,
  type MemberBalanceResponse,
  type MemberLoyaltyResponse,
  type RedeemRewardResult,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { LoyaltyService } from './loyalty.service';

/**
 * Staff-console Loyalty API (`/loyalty`, T12.10) — program config, rewards
 * catalogue, member balances + ledger, redemptions, and report aggregations,
 * behind the Growth area's Loyalty module (T12.1).
 *
 * Every route is tenant-scoped staff access: {@link TenantGuard} pins the request
 * to one gym and {@link PermissionsGuard} enforces the capability — reads require
 * {@link Permission.LoyaltyRead}, writes {@link Permission.LoyaltyManage}. The
 * service runs on the tenant-scoped Prisma client, so no handler passes a `gymId`.
 */
@Controller('loyalty')
@UseGuards(TenantGuard, PermissionsGuard)
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  /** `GET /loyalty/catalog` — reward-type + reason catalogs for the admin pickers. */
  @Get('catalog')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.LoyaltyRead)
  catalog(): LoyaltyCatalogResponse {
    return this.loyalty.catalog();
  }

  // -------------------------------------------------------------------------
  // Program configuration
  // -------------------------------------------------------------------------

  @Get('program')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.LoyaltyRead)
  async getProgram(): Promise<LoyaltyProgramResponse> {
    return this.loyalty.getProgram();
  }

  @Put('program')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.LoyaltyManage)
  async updateProgram(@Body() body: unknown): Promise<LoyaltyProgramResponse> {
    return this.loyalty.updateProgram(parse(updateLoyaltyProgramSchema, body));
  }

  // -------------------------------------------------------------------------
  // Rewards catalogue
  // -------------------------------------------------------------------------

  @Get('rewards')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.LoyaltyRead)
  async listRewards(): Promise<ListLoyaltyRewardsResponse> {
    return this.loyalty.listRewards();
  }

  @Post('rewards')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.LoyaltyManage)
  async createReward(@Body() body: unknown): Promise<LoyaltyRewardRow> {
    return this.loyalty.createReward(parse(createLoyaltyRewardSchema, body));
  }

  @Patch('rewards/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.LoyaltyManage)
  async updateReward(@Param('id') id: string, @Body() body: unknown): Promise<LoyaltyRewardRow> {
    return this.loyalty.updateReward(id, parse(updateLoyaltyRewardSchema, body));
  }

  @Delete('rewards/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.LoyaltyManage)
  async deleteReward(@Param('id') id: string): Promise<void> {
    await this.loyalty.deleteReward(id);
  }

  // -------------------------------------------------------------------------
  // Redemptions
  // -------------------------------------------------------------------------

  @Get('redemptions')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.LoyaltyRead)
  async listRedemptions(@Query() query: unknown): Promise<ListRedemptionsResponse> {
    return this.loyalty.listRedemptions(parse(listRedemptionsQuerySchema, query));
  }

  @Post('redemptions')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.LoyaltyManage)
  async redeem(@Body() body: unknown): Promise<RedeemRewardResult> {
    return this.loyalty.redeem(parse(redeemRewardSchema, body));
  }

  @Post('redemptions/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.LoyaltyManage)
  async cancelRedemption(@Param('id') id: string): Promise<RedeemRewardResult> {
    return this.loyalty.cancelRedemption(id);
  }

  // -------------------------------------------------------------------------
  // Member balance, ledger, manual adjustment
  // -------------------------------------------------------------------------

  @Get('members/:memberId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.LoyaltyRead)
  async getMemberLoyalty(@Param('memberId') memberId: string): Promise<MemberLoyaltyResponse> {
    return this.loyalty.getMemberLoyalty(memberId);
  }

  @Get('members/:memberId/balance')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.LoyaltyRead)
  async getMemberBalance(@Param('memberId') memberId: string): Promise<MemberBalanceResponse> {
    return this.loyalty.getMemberBalance(memberId);
  }

  @Post('members/:memberId/adjust')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.LoyaltyManage)
  async adjustPoints(
    @Param('memberId') memberId: string,
    @Body() body: unknown,
  ): Promise<MemberBalanceResponse> {
    return this.loyalty.adjustPoints(memberId, parse(adjustLoyaltyPointsSchema, body));
  }

  // -------------------------------------------------------------------------
  // Reports & aggregations
  // -------------------------------------------------------------------------

  @Get('reports/summary')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.LoyaltyRead)
  async summary(): Promise<LoyaltySummaryResponse> {
    return this.loyalty.summary();
  }

  @Get('reports/points-timeseries')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.LoyaltyRead)
  async pointsTimeseries(@Query() query: unknown): Promise<LoyaltyPointsTimeseriesResponse> {
    return this.loyalty.pointsTimeseries(parse(loyaltyTimeseriesQuerySchema, query).months);
  }

  @Get('reports/redemptions-by-type')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.LoyaltyRead)
  async redemptionsByType(): Promise<LoyaltyRedemptionsByTypeResponse> {
    return this.loyalty.redemptionsByType();
  }

  @Get('reports/top-earners')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.LoyaltyRead)
  async topEarners(@Query() query: unknown): Promise<LoyaltyTopEarnersResponse> {
    return this.loyalty.topEarners(parse(loyaltyTopEarnersQuerySchema, query).limit);
  }
}

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
