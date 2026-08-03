import { Module } from '@nestjs/common';
import { MarketingController } from './marketing.controller';
import { MarketingService } from './marketing.service';
import { PromoRedemptionService } from './promo-redemption.service';

/**
 * Marketing: the staff console's growth surface (`/marketing`, T12.7) — campaigns,
 * promo codes, audience segments, and message templates.
 *
 * Registers only its controller + service; the tenant-scoped Prisma client
 * (`TenantPrismaService`), the `TenantGuard`, and the global `PermissionsGuard`
 * all come from the app-wide `TenantModule` / `RbacModule`. The routes are
 * session-bound and tenant-scoped, so they sit behind the default
 * `TenantMiddleware` with no `AppModule` exclusion.
 */
@Module({
  controllers: [MarketingController],
  providers: [MarketingService, PromoRedemptionService],
  exports: [PromoRedemptionService],
})
export class MarketingModule {}
