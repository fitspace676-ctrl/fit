import { Module } from '@nestjs/common';
import {
  EmailNotificationChannel,
  InAppNotificationChannel,
  NOTIFICATION_CHANNEL_REGISTRY,
  PushNotificationChannel,
  buildChannelRegistry,
} from './notification-channels';
import { ExpoPushService } from './expo-push.service';
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
 * - The channel adapters (in-app T8.1, email T8.2, and Expo push T8.3 — all live)
 *   are assembled into the {@link NOTIFICATION_CHANNEL_REGISTRY} the orchestrator
 *   fans out through. {@link ExpoPushService} is the push channel's low-level
 *   transport (the push analogue of `MailerService`).
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
    ExpoPushService,
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
