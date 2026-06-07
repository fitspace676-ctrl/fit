import { Module } from '@nestjs/common';
import { PushTokenController } from './push-token.controller';
import { PushTokenService } from './push-token.service';

/**
 * Notifications — Expo push device registration (T6.10).
 *
 * {@link PushTokenController} serves the member app's
 * `POST /notifications/push-token` (register / refresh) and
 * `DELETE /notifications/push-token/:deviceId` (unregister), behind
 * `TenantGuard` + the global `PermissionsGuard` (`NotificationManage`). The
 * unscoped Prisma client, the guards, and the tenant context all come from the
 * app-wide `PrismaModule` / `TenantModule` / `RbacModule`.
 */
@Module({
  controllers: [PushTokenController],
  providers: [PushTokenService],
})
export class NotificationsModule {}
