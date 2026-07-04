import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useI18n, useTheme, useToast } from '../../../providers';
import { useAuth } from '../../../hooks/useAuth';
import { useSessionProfile } from '../../../hooks/useSessionProfile';
import { LanguageSwitcher } from '../../../components/settings/LanguageSwitcher';
import { NavRow, SettingsSection, ValueRow } from '../../../components/settings/SettingsControls';

/**
 * Settings (T6.8) — the Profile tab's home. Three groups:
 *
 *   • **Account** — the read-only identity baked into the session token
 *     (`useSessionProfile`): role, gym scope, member id. The app has no
 *     `GET /me` yet, so this is exactly what the JWT carries.
 *   • **Preferences** — the language switcher (persisted via i18n), a link into
 *     notification preferences, an appearance note (the app follows system dark
 *     mode), and a shortcut to Personal Training.
 *   • **Account actions** — app version and a confirming Sign out.
 *
 * Colours come from `useTheme()`, so the whole screen tracks system dark mode.
 * Sign-out clears the keychain; the root route guard then redirects to /login —
 * no manual navigation here.
 */
export default function SettingsScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { logout } = useAuth();
  const profile = useSessionProfile();
  const [signingOut, setSigningOut] = useState(false);

  const roleKey = `settings.account.roles.${profile.role}`;
  const roleLabel = t(roleKey);
  const version = Constants.expoConfig?.version ?? '—';

  const performSignOut = (): void => {
    setSigningOut(true);
    void logout()
      .catch(() => undefined)
      .finally(() => {
        // The route guard handles navigation off this screen; the toast confirms.
        toast.success(t('settings.about.signedOut'));
      });
  };

  const confirmSignOut = (): void => {
    Alert.alert(t('settings.about.signOut'), t('settings.about.signOutConfirm'), [
      { text: t('settings.about.signOutCancel'), style: 'cancel' },
      { text: t('settings.about.signOut'), style: 'destructive', onPress: performSignOut },
    ]);
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 20, gap: 24 }}
    >
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text }}>
          {t('settings.title')}
        </Text>
        <Text style={{ fontSize: 14, color: colors.textMuted }}>{t('settings.subtitle')}</Text>
      </View>

      <SettingsSection title={t('settings.account.heading')}>
        <ValueRow
          first
          label={t('settings.account.role')}
          value={roleLabel === roleKey ? profile.role : roleLabel}
        />
        <ValueRow
          label={t('settings.account.gym')}
          value={profile.gymId ?? t('settings.account.noGym')}
        />
        {profile.userId ? (
          <ValueRow label={t('settings.account.memberId')} value={profile.userId} />
        ) : null}
      </SettingsSection>

      <View style={{ gap: 8 }}>
        <Text
          style={{
            fontSize: 13,
            fontWeight: '700',
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            color: colors.textMuted,
          }}
        >
          {t('settings.preferences.language')}
        </Text>
        <LanguageSwitcher />
      </View>

      <SettingsSection title={t('settings.preferences.heading')}>
        <NavRow
          first
          label={t('settings.preferences.notifications')}
          hint={t('settings.preferences.notificationsHint')}
          onPress={() => router.push('/profile/notifications')}
        />
        <NavRow label={t('training.title')} onPress={() => router.push('/profile/training')} />
        <NavRow
          label={t('member.trainers.title')}
          hint={t('member.trainers.eyebrow')}
          onPress={() => router.push('/trainers')}
        />
        <ValueRow
          label={t('settings.preferences.appearance')}
          value={t('settings.preferences.appearanceSystem')}
        />
      </SettingsSection>

      <SettingsSection title={t('settings.about.heading')}>
        <ValueRow first label={t('settings.about.version')} value={version} />
      </SettingsSection>

      <Pressable
        accessibilityRole="button"
        disabled={signingOut}
        onPress={confirmSignOut}
        style={({ pressed }) => ({
          alignItems: 'center',
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          paddingVertical: 14,
          opacity: signingOut || pressed ? 0.6 : 1,
        })}
      >
        <Text style={{ fontSize: 16, fontWeight: '700', color: '#dc2626' }}>
          {t('settings.about.signOut')}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
