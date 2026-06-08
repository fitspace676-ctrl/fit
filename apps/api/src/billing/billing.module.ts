import { Module } from '@nestjs/common';
import { CreditPacksController } from './credit-packs.controller';
import { CreditPacksService } from './credit-packs.service';
import { MemberCreditPacksController } from './member-credit-packs.controller';

/**
 * Billing — the member-facing credit pack / class pass surface (T8.5).
 *
 * {@link CreditPacksController} (`POST /credit-packs/purchase`) buys a pass and
 * {@link MemberCreditPacksController} (`GET /members/me/credit-packs`) lists the
 * member's remaining credits — both member self-service behind the `TenantGuard` +
 * global `PermissionsGuard` (`CreditPackManage`). {@link CreditPacksService} is
 * **exported** so `BookingsService` (in {@link ClassesModule}) can draw / refund a
 * class credit inside the booking transaction. The tenant-scoped Prisma client,
 * the guards, and the tenant context all come from the app-wide `TenantModule` /
 * `RbacModule`.
 */
@Module({
  controllers: [CreditPacksController, MemberCreditPacksController],
  providers: [CreditPacksService],
  exports: [CreditPacksService],
})
export class BillingModule {}
