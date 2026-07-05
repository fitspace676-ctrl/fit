import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OpsNotificationsService } from './ops-notifications.service';

/**
 * Ops notifications — owner/manager operational alerts (T8.8).
 *
 * {@link OpsNotificationsService} runs two crons that email each gym's owners/managers
 * a daily low-stock reorder digest and an end-of-day summary. It reads the gym roster,
 * staff, products and daily takings cross-tenant on the global `PrismaModule`'s
 * unscoped client, delivers via the {@link AuthModule}'s `EmailService`, and guards
 * each send with a Redis lock from the global `RedisModule`. The `ScheduleModule`
 * registered app-wide drives the `@Cron` handlers. There is no controller — the whole
 * surface is scheduled.
 */
@Module({
  imports: [AuthModule],
  providers: [OpsNotificationsService],
})
export class OpsModule {}
