import { Module } from '@nestjs/common';
import { AutomationModule } from '../automation/automation.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';
import { MemberPurgeService } from './member-purge.service';

/**
 * Members: the staff console's member-management surface (`/members`, T4.2).
 *
 * Registers only its controller + service; the tenant-scoped Prisma client
 * (`TenantPrismaService`), the `TenantGuard`, and the global `PermissionsGuard`
 * all come from the app-wide `TenantModule` / `RbacModule`. The routes are
 * session-bound and tenant-scoped, so they sit behind the default
 * `TenantMiddleware` with no `AppModule` exclusion.
 *
 * Imports {@link AutomationModule} for its exported executor so creating a member
 * fires the `member_joined` automation trigger (T12.5) inline, and
 * {@link LoyaltyModule} for its exported {@link LoyaltyPointsService} so a new
 * member is granted the loyalty signup bonus (T12.10) fire-and-forget.
 *
 * Also registers {@link MemberPurgeService}, the daily `@Cron` that permanently
 * deletes trashed members past the 30-day retention window (its `PrismaService` /
 * `RedisService` deps come from the app-wide `@Global` Prisma / Redis modules).
 */
@Module({
  imports: [AutomationModule, LoyaltyModule],
  controllers: [MembersController],
  providers: [MembersService, MemberPurgeService],
})
export class MembersModule {}
