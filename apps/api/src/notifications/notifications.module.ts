import { Module } from '@nestjs/common';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationInboxController } from './notification-inbox.controller';
import { NotificationInboxService } from './notification-inbox.service';
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
 * - {@link NotificationDispatchService} is the write seam every producer calls to
 *   deliver an inbox item (T8.1 core); it is **exported** so future producer
 *   modules (booking reminders T8.6, billing notifications T8.7, ops alerts T8.8)
 *   can `imports: [NotificationsModule]` and inject it.
 *
 * The unscoped Prisma client, the guards, and the tenant context all come from
 * the app-wide `PrismaModule` / `TenantModule` / `RbacModule`.
 */
@Module({
  controllers: [PushTokenController, NotificationInboxController],
  providers: [PushTokenService, NotificationInboxService, NotificationDispatchService],
  exports: [NotificationDispatchService],
})
export class NotificationsModule {}
