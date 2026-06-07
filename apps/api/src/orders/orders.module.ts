import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

/**
 * Orders — the POS sale's server-side concerns (T7.4: email receipts).
 *
 * {@link OrdersController} (`/orders`) sits behind the `TenantGuard` + global
 * `PermissionsGuard`. The tenant-scoped Prisma client + tenant context come from
 * the app-wide `TenantModule`; {@link EmailService} (Resend delivery) is imported
 * from {@link AuthModule}, which exports it.
 */
@Module({
  imports: [AuthModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
