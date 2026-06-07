// @fit/mobile — Expo push device registration (T6.10).
//
// The transport half of push notifications: it requests OS permission, fetches
// this install's Expo push token, and registers it with @fit/api so the backend
// can target the device. The member's *preferences* (which categories to send)
// live separately in `notification-prefs`; this module only manages the token.
//
// The device id is a stable, per-install UUID persisted under the SAME
// AsyncStorage key `useAuth` reads (`fit.pushTokenDeviceId`) — registration here
// writes it, logout there reads it to `DELETE` the registration. Keeping the key
// string identical is the whole contract between the two.
//
// Everything is best-effort: a denied permission is a normal user choice (we
// return quietly), and any failure is reported to Sentry but never thrown — push
// is an enhancement, so it must not break a launch or a login.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { DevicePlatformValue } from '@fit/types';
import { apiFetch } from './api-client';

/** AsyncStorage key holding this install's stable device id. Shared verbatim
 * with `useAuth`, which reads it to unregister the token on logout. */
const DEVICE_ID_KEY = 'fit.pushTokenDeviceId';

/** Android notification channel id — Android requires a channel for a heads-up
 * notification to display while the app is foregrounded or backgrounded. */
const ANDROID_CHANNEL_ID = 'default';

// Show foreground notifications as a banner (by default Expo suppresses the
// system UI while the app is open). Set once at module load — importing this
// file (the push hook does) installs the handler for the app's lifetime.
Notifications.setNotificationHandler({
  handleNotification: () =>
    Promise.resolve({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
});

/** The device OS as the wire contract expects it, or `null` on an unsupported
 * platform (web) where there is no native push token to register. */
function wirePlatform(): DevicePlatformValue | null {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return null;
}

/** Read this install's persisted device id, minting + persisting one on first
 * use. Stable across launches and token rotations so the `(userId, deviceId)`
 * upsert updates in place rather than accumulating rows. */
async function getOrCreateDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY).catch(() => null);
  if (existing) return existing;
  const deviceId = randomUUID();
  await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId).catch(() => undefined);
  return deviceId;
}

/** The EAS project id `getExpoPushTokenAsync` needs, read from `app.json`'s
 * `extra.eas.projectId`. */
function resolveProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId;
}

/** Create the Android default channel so notifications surface on Android. A
 * no-op on iOS (Expo guards internally), so it is always safe to call. */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Default',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/**
 * Register this device for push delivery. Requests permission (a no-op re-prompt
 * once already decided), fetches the Expo push token, and `POST`s it to
 * `/notifications/push-token` keyed by a stable device id. Idempotent and safe to
 * call on every launch / login — the API upserts on `(userId, deviceId)`, so a
 * rotated token (app upgrade) updates the existing row.
 *
 * Best-effort by design: returns quietly when push is unsupported (web), the
 * permission is denied, or the project id is missing; any unexpected failure is
 * reported to Sentry but never thrown.
 */
export async function registerDevice(): Promise<void> {
  const platform = wirePlatform();
  if (!platform) return;

  try {
    const { granted } = await Notifications.requestPermissionsAsync();
    if (!granted) return;

    await ensureAndroidChannel();

    const projectId = resolveProjectId();
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );

    // Persist the device id *before* the POST so a logout that races the
    // registration can still unregister it (DELETE is idempotent server-side).
    const deviceId = await getOrCreateDeviceId();

    await apiFetch('/notifications/push-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, deviceId, platform }),
    });
  } catch (error) {
    // Push is an enhancement — surface the failure for diagnosis but let the app
    // carry on as if it had never tried.
    Sentry.captureException(error);
  }
}

/**
 * Extract the deep-link route from a tapped notification, or `null` when it
 * carries none. The backend puts an Expo Router path (e.g. `/shop/order/abc`) in
 * the notification's `data.href`; tapping it should navigate there.
 */
export function notificationHref(
  response: Notifications.NotificationResponse | null,
): string | null {
  const href = response?.notification.request.content.data?.href;
  return typeof href === 'string' && href.length > 0 ? href : null;
}
