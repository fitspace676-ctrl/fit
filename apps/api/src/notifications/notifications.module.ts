import { Module } from '@nestjs/common';
import {
  EmailNotificationChannel,
  InAppNotificationChannel,
  NOTIFICATION_CHANNEL_REGISTRY,
  PushNotificationChannel,
  buildChannelRegistry,
} from './notification-channels';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationInboxController } from './notification-inbox.controller';
import { NotificationInboxService } from './notification-inbox.service';
import { NotificationService } from './notification.service';
import { PushTokenController } from './push-token.controller';
import { PushTokenService } from './push-token.service';

/**
 * Notifications (Phase 8) — the member notification pipeline.
 *
 * - {@link PushTokenController} / {@link PushTokenService} serve Expo push device
 *   registration (`/notifications/push-token`).
 * - {@link NotificationInboxController} / {@link NotificationInboxService} serve
 *   the in-app inbox (`GET /notifications`, `.../unread-count`, `.../mark-read`,
 *   T8.4) behind the member's `NotificationManage` permission, feeding the portal
 *   bell (T6.10).
 * - {@link NotificationService} is the dispatch seam every producer calls (T8.1):
 *   it resolves the member's per-channel preferences, dedupes, and fans out over
 *   the registered channel adapters. It is **exported** so future producer
 *   modules (booking reminders T8.6, billing notifications T8.7, ops alerts T8.8)
 *   can `imports: [NotificationsModule]` and inject it.
 * - {@link NotificationDispatchService} is the low-level in-app inbox writer the
 *   in-app channel composes over; still exported for the inbox/back-compat.
 * - The channel adapters ({@link InAppNotificationChannel} live; email T8.2 and
 *   push T8.3 as wired-in placeholders) are assembled into the
 *   {@link NOTIFICATION_CHANNEL_REGISTRY} the orchestrator fans out through.
 *
 * The unscoped Prisma client, the guards, and the tenant context all come from
 * the app-wide `PrismaModule` / `TenantModule` / `RbacModule`.
 */
@Module({
  controllers: [PushTokenController, NotificationInboxController],
  providers: [
    PushTokenService,
    NotificationInboxService,
    NotificationDispatchService,
    NotificationService,
    InAppNotificationChannel,
    EmailNotificationChannel,
    PushNotificationChannel,
    {
      provide: NOTIFICATION_CHANNEL_REGISTRY,
      useFactory: (
        inApp: InAppNotificationChannel,
        email: EmailNotificationChannel,
        push: PushNotificationChannel,
      ) => buildChannelRegistry([inApp, email, push]),
      inject: [InAppNotificationChannel, EmailNotificationChannel, PushNotificationChannel],
    },
  ],
  exports: [NotificationService, NotificationDispatchService],
})
export class NotificationsModule {}
