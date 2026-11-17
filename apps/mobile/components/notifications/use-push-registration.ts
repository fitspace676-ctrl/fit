import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useSession } from '../../hooks/useSession';
import { clearPushSnapshot, syncPushPreference } from './device-prefs';

/** Restore an explicit opt-in without prompting at startup. */
export function usePushRegistration() {
  const { userId, status } = useSession();
  useEffect(() => {
    if (status !== 'signed-in' || !userId) {
      clearPushSnapshot();
      return;
    }
    if (Platform.OS === 'web') return;
    Notifications.setNotificationHandler({
      handleNotification: () =>
        Promise.resolve({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
    });
    void syncPushPreference(userId);
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncPushPreference(userId);
    });
    const rotation = Notifications.addPushTokenListener(() => {
      void syncPushPreference(userId);
    });
    return () => {
      foreground.remove();
      rotation.remove();
    };
  }, [userId, status]);
}
