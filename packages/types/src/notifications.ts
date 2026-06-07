// @fit/types — push-notification device-registration contracts (Zod + types).
//
// Shapes crossing the API boundary for Expo push setup (T6.10). The member app
// registers each device's Expo push token so the backend can deliver class
// reminders, booking updates, and promotions; on logout (or token rotation) the
// device unregisters. The API validates the inbound body with these schemas and
// the mobile client reuses the inferred types, so the two can never drift on the
// wire format.

import { z } from 'zod';

/**
 * The device's OS, lowercase on the wire (`Platform.OS` on the client). The DB
 * mirrors this as the Prisma `DevicePlatform` enum (`IOS` / `ANDROID`); the API
 * maps between the two so the wire stays lowercase and the column stays an enum.
 */
export const devicePlatformSchema = z.enum(['ios', 'android']);

/** A device's OS — {@link devicePlatformSchema}. */
export type DevicePlatformValue = z.infer<typeof devicePlatformSchema>;

/**
 * Body for `POST /notifications/push-token`. The member registers *their own*
 * device — the owning user is resolved from the session, never sent — so the
 * body carries only the Expo push `token`, a stable per-install `deviceId` (the
 * upsert key, so re-registering after a token rotation updates in place rather
 * than piling up rows), and the device `platform`.
 */
export const registerPushTokenSchema = z.object({
  /** The Expo push token (`ExponentPushToken[…]`) delivery targets. */
  token: z.string().min(1),
  /** Stable per-install device id — the `(userId, deviceId)` upsert key. */
  deviceId: z.string().min(1),
  /** The device OS — {@link devicePlatformSchema}. */
  platform: devicePlatformSchema,
});

/** Validated `POST /notifications/push-token` body — {@link registerPushTokenSchema}. */
export type RegisterPushTokenData = z.infer<typeof registerPushTokenSchema>;

/**
 * Response for `POST /notifications/push-token` — the registered token row's id.
 * The status code distinguishes the two upsert outcomes: `201` when the device
 * was newly registered, `200` when an existing registration was updated (e.g. a
 * rotated token on app upgrade).
 */
export interface RegisterPushTokenResponse {
  id: string;
}
