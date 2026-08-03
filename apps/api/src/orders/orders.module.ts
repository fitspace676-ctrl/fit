import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { MarketingModule } from '../marketing/marketing.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

/**
 * Orders — the POS sale's server-side concerns (T7.4: email receipts).
 *
 * {@link OrdersController} (`/orders`) sits behind the `TenantGuard` + global
 * `PermissionsGuard`. The tenant-scoped Prisma client + tenant context come from
 * the app-wide `TenantModule`; {@link EmailService} (Resend delivery) is imported
 * from {@link AuthModule}, which exports it. {@link LoyaltyModule} provides the
 * exported {@link LoyaltyPointsService} so a member's paid POS sale awards loyalty
 * points (T12.10) fire-and-forget. {@link SubscriptionsModule} provides the exported
 * {@link SubscriptionEnrollmentService} so a POS membership sale enrols the member on
 * the plan it just sold, rather than the desk taking money and the subscription being
 * created by hand afterwards.
 */
@Module({
  imports: [MarketingModule, AuthModule, LoyaltyModule, SubscriptionsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
