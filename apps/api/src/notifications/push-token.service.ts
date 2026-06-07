import { ForbiddenException, Injectable } from '@nestjs/common';
import { DevicePlatform } from '@fit/db';
import type { DevicePlatformValue, RegisterPushTokenData } from '@fit/types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';

/** Map the lowercase wire `platform` to the Prisma {@link DevicePlatform} enum. */
const WIRE_TO_PLATFORM: Record<DevicePlatformValue, DevicePlatform> = {
  ios: DevicePlatform.IOS,
  android: DevicePlatform.ANDROID,
};

/** Outcome of a register upsert: the row id and whether it was newly created
 * (drives the `201` vs `200` status the controller returns). */
export interface RegisterPushTokenResult {
  id: string;
  created: boolean;
}

/**
 * Push-device registration (T6.10).
 *
 * A push token belongs to the *person*, not a gym — the member app delivers the
 * same token regardless of which gym scope is active — so rows hang off `User`
 * and these queries run on the **unscoped** {@link PrismaService}, keyed
 * explicitly by the caller's user id (resolved from the session, never off the
 * wire). The owning user is the only tenant boundary that matters here, which is
 * why there is no `gymId` filter despite the endpoints sitting behind
 * {@link TenantGuard}; the guard's job is purely to authenticate + authorize the
 * caller. Registration is an idempotent upsert on `(userId, deviceId)` so a
 * rotated token (app upgrade) updates in place; unregister is a best-effort
 * delete so logging out from a device with no live registration still succeeds.
 */
@Injectable()
export class PushTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * Register (or refresh) the calling user's device. Upserts on
   * `(userId, deviceId)`: a first registration creates the row (`created: true`),
   * a re-registration with a rotated token updates it in place (`created: false`).
   */
  async register(data: RegisterPushTokenData): Promise<RegisterPushTokenResult> {
    const userId = this.requireUserId();
    const platform = WIRE_TO_PLATFORM[data.platform];

    // Detect create-vs-update up front so the controller can return the right
    // status code — Prisma's `upsert` does not report which branch it took.
    const existing = await this.prisma.client.pushToken.findUnique({
      where: { userId_deviceId: { userId, deviceId: data.deviceId } },
      select: { id: true },
    });

    const row = await this.prisma.client.pushToken.upsert({
      where: { userId_deviceId: { userId, deviceId: data.deviceId } },
      create: { userId, deviceId: data.deviceId, token: data.token, platform },
      update: { token: data.token, platform },
      select: { id: true },
    });

    return { id: row.id, created: existing === null };
  }

  /**
   * Remove the calling user's registration for `deviceId`. Idempotent — a
   * `deleteMany` so unregistering a device that was never registered (or already
   * removed) is a no-op `204` rather than a `404`.
   */
  async unregister(deviceId: string): Promise<void> {
    const userId = this.requireUserId();
    await this.prisma.client.pushToken.deleteMany({ where: { userId, deviceId } });
  }

  /**
   * The authenticated caller's user id. `@RequirePermissions(NotificationManage)`
   * guarantees an authenticated caller; a request that somehow reaches here
   * without a session id (a coding error) is a `403`, never an anonymous write.
   */
  private requireUserId(): string {
    const userId = this.tenant.userId;
    if (!userId) {
      throw new ForbiddenException({
        message: 'A member session is required to manage push tokens',
        code: 'MEMBER_SESSION_REQUIRED',
      });
    }
    return userId;
  }
}
