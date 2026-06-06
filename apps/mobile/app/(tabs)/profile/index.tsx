import { Link } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { PlaceholderScreen } from '../../../components/PlaceholderScreen';
import { useI18n } from '../../../providers/I18nProvider';
import { useTheme } from '../../../providers/ThemeProvider';
import { useToast } from '../../../providers/ToastProvider';

/**
 * Profile tab. Settings (profile, language, notifications) land in T6.8; for now
 * it exercises the shared providers — a language switch (i18n) that confirms via
 * a toast, plus a link into the notifications screen.
 */
export default function ProfileScreen() {
  const { locale, locales, setLocale, t } = useI18n();
  const { colors } = useTheme();
  const toast = useToast();

  const cycleLocale = () => {
    const index = locales.indexOf(locale);
    const next = locales[(index + 1) % locales.length] ?? locale;
    setLocale(next);
    toast.success(t('common.language.label'));
  };

  return (
    <PlaceholderScreen title={t('common.nav.profile')}>
      <Pressable
        accessibilityRole="button"
        onPress={cycleLocale}
        style={{
          marginTop: 8,
          alignSelf: 'flex-start',
          borderRadius: 12,
          paddingVertical: 10,
          paddingHorizontal: 16,
          backgroundColor: colors.primary,
        }}
      >
        <Text style={{ color: colors.onPrimary, fontWeight: '600' }}>
          {t('common.language.label')}: {locale.toUpperCase()}
        </Text>
      </Pressable>

      <Link
        href="/profile/notifications"
        style={{ marginTop: 16, fontSize: 16, color: colors.primary }}
      >
        {t('common.nav.profile')} → notifications
      </Link>
    </PlaceholderScreen>
  );
}
