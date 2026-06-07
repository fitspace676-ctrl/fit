import { Text, View } from 'react-native';
import type { PackageSummary } from '@fit/types';
import { useI18n } from '../../providers/I18nProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { formatPackagePrice, priceSuffixKey } from '../../lib/packages';

export interface PackageCardProps {
  pkg: PackageSummary;
}

/**
 * One personal-training package on the Personal Training screen (T6.6): the
 * plan's name + description, its price (with a per-interval suffix for recurring
 * plans), what it grants (a finite session count or unlimited access), and its
 * perk `features` as a bulleted list. The gym's emphasised plan gets a "Most
 * popular" badge and a primary-tinted border. The card is informational — there
 * is no member-facing purchase flow on mobile yet (purchases run through the web
 * wizard / reception), so it does not navigate. Colours come from `useTheme()`,
 * so the card tracks system dark mode like the rest of the app.
 */
export function PackageCard({ pkg }: PackageCardProps) {
  const { colors } = useTheme();
  const { t, locale } = useI18n();

  const price = formatPackagePrice(pkg, locale);
  const suffixKey = priceSuffixKey(pkg.interval);
  const suffix = suffixKey ? ` ${t(`training.packages.${suffixKey}`)}` : '';
  const grant =
    pkg.sessionCount == null
      ? t('training.packages.unlimited')
      : t(
          pkg.sessionCount === 1
            ? 'training.packages.sessionsOne'
            : 'training.packages.sessionsOther',
          { count: pkg.sessionCount },
        );

  return (
    <View
      style={{
        gap: 12,
        padding: 16,
        borderRadius: 12,
        borderWidth: pkg.popular ? 2 : 1,
        borderColor: pkg.popular ? colors.primary : colors.border,
        backgroundColor: colors.surface,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text numberOfLines={2} style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>
            {pkg.name}
          </Text>
          {pkg.description ? (
            <Text style={{ fontSize: 14, color: colors.textMuted }}>{pkg.description}</Text>
          ) : null}
        </View>

        {pkg.popular ? (
          <View
            style={{
              flexShrink: 0,
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 4,
              backgroundColor: colors.primary,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.onPrimary }}>
              {t('training.packages.popular')}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>{price}</Text>
        {suffix ? (
          <Text style={{ fontSize: 14, color: colors.textMuted }}>{suffix.trim()}</Text>
        ) : null}
      </View>

      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>{grant}</Text>

      {pkg.features.length > 0 ? (
        <View style={{ gap: 6 }}>
          {pkg.features.map((feature, index) => (
            <View
              key={`${index}-${feature}`}
              style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}
            >
              <Text style={{ fontSize: 14, lineHeight: 20, color: colors.primary }}>•</Text>
              <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: colors.text }}>
                {feature}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
