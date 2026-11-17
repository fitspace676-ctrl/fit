import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Alert,
  AppBar,
  Button,
  IconButton,
  Screen,
  Surface,
  SwitchRow,
  Text,
  spacing,
} from '@fit/ui-mobile';
import { syncPushPreference, useDevicePrefs } from '../../../components/notifications/device-prefs';
import { useSession } from '../../../hooks/useSession';
import { useI18n } from '../../../providers/I18nProvider';

export default function NotificationSettingsScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { userId, status } = useSession();
  const prefs = useDevicePrefs();
  const [lastIntent, setLastIntent] = useState<boolean | undefined>(undefined);
  const signedIn = status === 'signed-in' && userId !== null;
  const belongsToUser = prefs.userId === userId;
  useEffect(() => {
    if (signedIn) void syncPushPreference(userId);
  }, [signedIn, userId]);
  return (
    <Screen
      testID="notification-settings-screen"
      header={
        <AppBar
          title={t('notifications.title')}
          subtitle={t('notifications.mobile.subtitle')}
          leading={
            <IconButton
              icon="chevronLeft"
              accessibilityLabel={t('notifications.back')}
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace('/profile');
              }}
              variant="surface"
              testID="notification-settings-back"
            />
          }
        />
      }
    >
      <View style={{ gap: spacing[4] }}>
        <Text color="textSecondary" testID="notification-settings-permission">
          {t(`notifications.mobile.permission.${belongsToUser ? prefs.permission : 'unknown'}`)}
        </Text>
        {!signedIn ? <Text>{t('notifications.mobile.signIn')}</Text> : null}
        <Surface tone="card" padVertical={1}>
          <SwitchRow
            testID="notification-settings-push"
            label={t('notifications.mobile.push')}
            description={t('notifications.mobile.pushHint')}
            checked={belongsToUser && prefs.push}
            disabled={!signedIn || prefs.busy || prefs.permission === 'unsupported'}
            onChange={(enabled) => {
              if (signedIn) {
                setLastIntent(enabled);
                void syncPushPreference(userId, enabled);
              }
            }}
          />
        </Surface>
        {prefs.permission === 'denied' ? (
          <Button
            label={t('notifications.mobile.openSettings')}
            onPress={() => {
              void Linking.openSettings().catch(() => undefined);
            }}
          />
        ) : null}
        {belongsToUser && prefs.error ? (
          <>
            <Alert tone="warning" title={t('notifications.mobile.error')} />
            <Button
              label={t('notifications.retry')}
              onPress={() => {
                if (signedIn) void syncPushPreference(userId, lastIntent);
              }}
              disabled={prefs.busy}
            />
          </>
        ) : null}
      </View>
    </Screen>
  );
}
