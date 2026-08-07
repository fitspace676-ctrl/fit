import { localeNames } from '@fit/i18n';
import type { Locale } from '@fit/i18n';
import { Pressable, Text, View } from 'react-native';
import { useI18n } from '../../providers/I18nProvider';
import { useTheme } from '../../providers/ThemeProvider';

// The language switcher: one pill per supported locale, the active one filled
// with the brand colour. Labels come from `@fit/i18n`'s `localeNames` so each
// language is shown in its own script (ქართული / English). Selecting a locale
// flows through `setLocale`, which persists the choice (see `lib/locale.ts`).
export function LanguageSwitcher() {
  const { locale, locales, setLocale } = useI18n();
  const { colors } = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 8,
        padding: 4,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      {locales.map((option: Locale) => {
        const active = option === locale;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => setLocale(option)}
            style={{
              flex: 1,
              alignItems: 'center',
              borderRadius: 9,
              paddingVertical: 10,
              backgroundColor: active ? colors.primary : 'transparent',
            }}
          >
            <Text
              style={{
                fontSize: 15,
                fontWeight: active ? '700' : '500',
                color: active ? colors.onPrimary : colors.text,
              }}
            >
              {localeNames[option]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
