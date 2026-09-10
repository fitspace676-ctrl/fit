// `/profile/notification-settings` — the screen that tells the truth about
// itself.
//
// ===========================================================================
// THERE IS NO NOTIFICATION-PREFERENCES ENDPOINT. NOT ONE.
//
// The whole notification surface on this API is five routes: the inbox, the
// unread count, mark-read, and the push-token pair. **Nothing accepts a
// preference.** Plan §7 lists it among the four constraints the API imposes and
// names what happened last time:
//
//   > The deleted app shipped a settings screen that called nothing and stored
//   > toggles in AsyncStorage. Do not rebuild that illusion: either drop the
//   > screen or make it plainly device-local.
//
// `/profile` takes the first option — it carries no preference switches at all,
// and the note on it says why. This screen takes the second, and the difference
// between it and the deleted app's is three things:
//
//   1. **A disclaimer above the controls**, not buried in a footnote. The
//      catalogue's own `notifications.subtitle` already says "Delivery is
//      enabled in a later update" — someone knew.
//   2. **Nothing is persisted.** `components/notifications/device-prefs.ts` is
//      in-memory for the life of the process, deliberately: a toggle that
//      survives a relaunch is indistinguishable from a toggle that was SAVED,
//      and AsyncStorage is precisely what made the last one a lie.
//   3. **The master switch is separated from the categories**, because when
//      delivery lands (C6) the master one becomes real — it maps onto
//      `POST /notifications/push-token` and `DELETE /notifications/push-token/
//      :deviceId`, which do exist — while the categories stay fiction until a
//      preferences controller exists.
//
// ---------------------------------------------------------------------------
// WHY IT IS HERE AT ALL RATHER THAN DELETED.
//
// The inbox has a settings affordance in its own copy (`notifications.settings`)
// and the artboard draws the toggles on Profile. Deleting the screen and leaving
// `member.profile.mobile.toggles` and six `notifications.*` keys pointing at
// nothing is a different kind of confusion. A screen that says "this is stored
// on this device and does not affect delivery yet" is smaller, honest, and one
// diff away from being real.
//
// **Owed: `notifications.deviceOnly`** — the disclaimer sentence, in both
// locales. Rendered below as a marked English placeholder; nothing is invented
// in Georgian.

import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Alert,
  AppBar,
  IconButton,
  Screen,
  SectionHeader,
  Surface,
  SwitchRow,
  Text,
  layout,
  spacing,
} from '@fit/ui-mobile';

import {
  CATEGORY_KEYS,
  setCategoryEnabled,
  setPushEnabled,
  useDevicePrefs,
} from '../../../components/notifications/device-prefs';
import { useI18n } from '../../../providers/I18nProvider';

// ===========================================================================
// TODO(i18n) — `notifications.deviceOnly`.
//
// The disclaimer this screen is built around. English-only on purpose, in the
// same spirit as `components/auth/pending-copy.ts` and
// `components/home/pending-copy.ts`: the branch ships, the sentence is owed,
// and no Georgian is invented. Kept here rather than in the shared placeholder
// module because it belongs to exactly one screen and should be deleted with
// the key that replaces it.
// ===========================================================================

/** TODO(i18n) `notifications.deviceOnly` — title. */
const DEVICE_ONLY_TITLE = 'Saved on this device only';

/** TODO(i18n) `notifications.deviceOnly` — body. */
const DEVICE_ONLY_BODY =
  'These choices are not sent to the gym and do not change what you receive yet. They reset when the app restarts.';

export default function NotificationSettingsScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const prefs = useDevicePrefs();

  return (
    <Screen
      testID="notification-settings-screen"
      header={
        <AppBar
          title={t('notifications.title')}
          subtitle={t('notifications.subtitle')}
          leading={
            <IconButton
              icon="chevronLeft"
              accessibilityLabel={t('notifications.back')}
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace('/profile/notifications');
              }}
              variant="surface"
              testID="notification-settings-back"
            />
          }
        />
      }
    >
      <View style={{ gap: layout.sectionGap }}>
        {/* The disclaimer leads. It is the reason the screen is honest. */}
        <Alert
          testID="notification-settings-disclaimer"
          tone="warning"
          icon="info"
          // TODO(i18n): replace both with t('notifications.deviceOnly.*').
          title={DEVICE_ONLY_TITLE}
          body={DEVICE_ONLY_BODY}
        />

        <Surface tone="card" padVertical={1}>
          <SwitchRow
            testID="notification-settings-push"
            label={t('notifications.push')}
            description={t('notifications.pushHint')}
            checked={prefs.push}
            onChange={setPushEnabled}
          />
        </Surface>

        <View style={{ gap: spacing[3] }}>
          <SectionHeader title={t('notifications.categories')} size="md" />

          <Surface tone="card" padVertical={1}>
            {CATEGORY_KEYS.map((key) => (
              <SwitchRow
                key={key}
                testID={`notification-settings-${key}`}
                label={t(`notifications.${key}`)}
                description={t(`notifications.${key}Hint`)}
                checked={prefs.categories[key]}
                // Gated by the master switch, which is how the catalogue's own
                // `disabledHint` expects the screen to behave.
                disabled={!prefs.push}
                onChange={(enabled) => {
                  setCategoryEnabled(key, enabled);
                }}
              />
            ))}
          </Surface>

          {prefs.push ? null : (
            <Text variant="caption" color="textSecondary" testID="notification-settings-disabled">
              {t('notifications.disabledHint')}
            </Text>
          )}
        </View>
      </View>
    </Screen>
  );
}
