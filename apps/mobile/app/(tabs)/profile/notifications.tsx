import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n, useTheme } from '../../../providers';
import { useNotificationPrefs } from '../../../hooks/useNotificationPrefs';
import { SettingsSection, ToggleRow } from '../../../components/settings/SettingsControls';

/**
 * Notification preferences (T6.8) — also the target of the
 * `fit://notifications/:id` deep link (remapped here by `app/+native-intent.ts`).
 *
 * A master **Push notifications** switch gates three category toggles (class
 * reminders, booking updates, promotions). All four persist locally via
 * `useNotificationPrefs` (AsyncStorage); when push is off the categories are
 * shown disabled. Actual delivery — registering the Expo push token and honouring
 * these flags server-side — lands in T6.10, which is why the subtitle says so.
 */
export default function NotificationsScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { prefs, isLoading, setPrefs, toggle } = useNotificationPrefs();

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 20, gap: 24 }}
    >
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text }}>
          {t('notifications.title')}
        </Text>
        <Text style={{ fontSize: 14, color: colors.textMuted }}>{t('notifications.subtitle')}</Text>
      </View>

      {isLoading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <>
          <SettingsSection title={t('notifications.push')}>
            <ToggleRow
              first
              label={t('notifications.push')}
              hint={t('notifications.pushHint')}
              value={prefs.push}
              onValueChange={(next) => void setPrefs({ push: next })}
            />
          </SettingsSection>

          <SettingsSection title={t('notifications.categories')}>
            <ToggleRow
              first
              label={t('notifications.classReminders')}
              hint={t('notifications.classRemindersHint')}
              value={prefs.classReminders}
              disabled={!prefs.push}
              onValueChange={() => void toggle('classReminders')}
            />
            <ToggleRow
              label={t('notifications.bookingUpdates')}
              hint={t('notifications.bookingUpdatesHint')}
              value={prefs.bookingUpdates}
              disabled={!prefs.push}
              onValueChange={() => void toggle('bookingUpdates')}
            />
            <ToggleRow
              label={t('notifications.promotions')}
              hint={t('notifications.promotionsHint')}
              value={prefs.promotions}
              disabled={!prefs.push}
              onValueChange={() => void toggle('promotions')}
            />
          </SettingsSection>

          {!prefs.push ? (
            <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: 'center' }}>
              {t('notifications.disabledHint')}
            </Text>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}
