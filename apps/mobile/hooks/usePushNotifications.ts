// @fit/mobile — push registration + notification-tap deep-linking (T6.10).
//
// The React glue over `lib/push`: it registers the device for push once a
// session exists, and routes a tapped notification to the screen named in its
// `data.href`. Mounted once from the root layout (`RootNavigator`), inside the
// Expo Router navigation context so `router.push` is live.

import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { notificationHref, registerDevice } from '../lib/push';
import { useAuth } from './useAuth';

/**
 * Wire push notifications into the app shell:
 *
 *  • registers this device whenever a session becomes available (once per
 *    sign-in; the latch resets on sign-out so a later sign-in — possibly a
 *    different user on the same device — re-registers);
 *  • navigates to `data.href` when a notification is tapped, covering both a tap
 *    while the app runs (the response listener) and a tap that cold-launched the
 *    app from a killed state (`getLastNotificationResponseAsync`).
 *
 * Returns nothing — it is mounted purely for its effects.
 */
export function usePushNotifications(): void {
  const { session } = useAuth();
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!session) {
      registeredRef.current = false;
      return;
    }
    if (registeredRef.current) return;
    registeredRef.current = true;
    void registerDevice();
  }, [session]);

  useEffect(() => {
    let active = true;
    const navigate = (href: string | null): void => {
      if (active && href) router.push(href);
    };

    // Cold path: a tap that launched the app from a killed state.
    void Notifications.getLastNotificationResponseAsync().then((response) =>
      navigate(notificationHref(response)),
    );

    // Warm path: a tap while the app is running (foreground or background).
    const subscription = Notifications.addNotificationResponseReceivedListener((response) =>
      navigate(notificationHref(response)),
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
}
