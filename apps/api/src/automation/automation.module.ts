import { Module } from '@nestjs/common';
import { AutomationController } from './automation.controller';
import { AutomationExecutorService } from './automation-executor.service';
import { AutomationMergeService } from './automation-merge.service';
import { AutomationService } from './automation.service';

/**
 * Automation: the staff console's "when X happens, do Y" surface (`/automation`,
 * T12.5) — rules, reusable templates, the builder catalog, and the executor that
 * fires rules and logs runs.
 *
 * Registers its controller + CRUD service (both tenant-scoped via the app-wide
 * `TenantModule` / `RbacModule`) and the {@link AutomationExecutorService}, which
 * it **exports** so domain modules can dispatch event-driven triggers inline
 * (e.g. `MembersModule` firing `member_joined` on member creation). The executor
 * itself runs cross-tenant on the global `PrismaModule` / `RedisModule` and hosts
 * the time-based scanner cron on the app-wide `ScheduleModule`.
 *
 * {@link AutomationMergeService} resolves who a fired rule is about and the tokens
 * that personalise their message; the executor delivers `email` actions through
 * the `@Global` `MailModule`'s transport, so neither needs extra wiring here.
 */
@Module({
  controllers: [AutomationController],
  providers: [AutomationService, AutomationExecutorService, AutomationMergeService],
  exports: [AutomationExecutorService],
})
export class AutomationModule {}
