// Persist only the master preference: it controls a real API device registration.
// No category switches until the API can enforce category preferences.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useSyncExternalStore } from 'react';
import { Linking, Platform } from 'react-native';
import { registerPushToken, unregisterPushToken } from '../../lib/api/notifications';
import { hydrateDeviceId } from '../../lib/auth/device-id';
import { getSessionState } from '../../lib/auth/session';

type Permission = 'unknown' | 'granted' | 'denied' | 'undetermined' | 'unsupported';
interface DevicePrefs {
  userId: string | null;
  push: boolean;
  permission: Permission;
  busy: boolean;
  error: boolean;
}
let current: DevicePrefs = {
  userId: null,
  push: false,
  permission: 'unknown',
  busy: false,
  error: false,
};
const listeners = new Set<() => void>();
function update(patch: Partial<DevicePrefs>) {
  current = { ...current, ...patch };
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function useDevicePrefs() {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
}
const key = (userId: string) => `notifications.push.${userId}`;
const isCurrentUser = (userId: string) => {
  const session = getSessionState();
  return session.status === 'signed-in' && session.userId === userId;
};
function allowed(permission: Notifications.NotificationPermissionsStatus) {
  return (
    permission.granted ||
    permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

// Serialize foreground refresh, token rotation and switch actions.
let pending: Promise<void> = Promise.resolve();
let settingsOptIn: string | null = null;
export function syncPushPreference(userId: string, enabled?: boolean): Promise<void> {
  const run = async () => {
    if (!isCurrentUser(userId)) return;
    update({
      busy: true,
      error: false,
      ...(current.userId !== userId ? { userId, push: false, permission: 'unknown' as const } : {}),
    });
    const updateUser = (patch: Partial<DevicePrefs>) => {
      if (isCurrentUser(userId) && current.userId === userId) update(patch);
    };
    try {
      if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
        updateUser({ permission: 'unsupported', push: false });
        return;
      }
      const saved = (await AsyncStorage.getItem(key(userId))) === 'true';
      if (enabled === false) settingsOptIn = null;
      const wantsPush = enabled ?? (settingsOptIn === userId || saved);
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'FormaCore',
          importance: Notifications.AndroidImportance.HIGH,
        });
      }
      let permission = await Notifications.getPermissionsAsync();
      if (enabled === true && !allowed(permission)) {
        if (!permission.canAskAgain) {
          settingsOptIn = userId;
          updateUser({ permission: 'denied', push: false });
          await Linking.openSettings();
          return;
        }
        permission = await Notifications.requestPermissionsAsync();
      }
      const granted = allowed(permission);
      updateUser({ permission: granted ? 'granted' : permission.status });
      const deviceId = await hydrateDeviceId();
      if (!isCurrentUser(userId)) return;
      if (wantsPush && granted) {
        const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
        const eas = Constants.easConfig as { projectId?: string } | null | undefined;
        const projectId: string | undefined = eas?.projectId ?? extra?.eas?.projectId;
        if (!projectId) throw new Error('Missing EAS project id');
        const token = await Notifications.getExpoPushTokenAsync({ projectId });
        if (!isCurrentUser(userId)) return;
        await registerPushToken({ deviceId, token: token.data, platform: Platform.OS });
        settingsOptIn = null;
        updateUser({ push: true });
        await AsyncStorage.setItem(key(userId), 'true');
      } else {
        await unregisterPushToken({ deviceId });
        // Preserve a previously enabled choice if OS permission was revoked;
        // restoring OS permission can then re-register on foreground.
        updateUser({ push: false });
        if (enabled === false) await AsyncStorage.setItem(key(userId), 'false');
      }
    } catch {
      updateUser({ error: true });
    } finally {
      updateUser({ busy: false });
    }
  };
  pending = pending.then(run, run);
  return pending;
}

export function clearPushSnapshot() {
  settingsOptIn = null;
  update({ userId: null, push: false, permission: 'unknown', error: false, busy: false });
}
