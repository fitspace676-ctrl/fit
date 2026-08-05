import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { PackageSummary } from '@fit/types';
import { useI18n } from '../../providers/I18nProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { formatPackagePrice, priceSuffixKey } from '../../lib/packages';

export interface PackageCardProps {
  pkg: PackageSummary;
  /**
   * Buy this plan. Omit to keep the card informational — the roster on a screen
   * that only advertises plans passes nothing and renders no button.
   */
  onBuy?: (pkg: PackageSummary) => void;
  /** True while *this* card's purchase is in flight. */
  busy?: boolean;
  /** True while another card's purchase is in flight, so this one waits its turn. */
  disabled?: boolean;
}

/**
 * One personal-training package on the Personal Training screen (T6.6): the
 * plan's name + description, its price (with a per-interval suffix for recurring
 * plans), what it grants (a finite session count or unlimited access), and its
 * perk `features` as a bulleted list. The gym's emphasised plan gets a "Most
 * popular" badge and a primary-tinted border.
 *
 * Pass `onBuy` to make the card sell (T7.10): it grows a purchase button, so a
 * member no longer has to finish on the web wizard or at reception. Without it
 * the card stays purely informational, which is what a screen that only
 * advertises plans wants. Colours come from `useTheme()`, so the card tracks
 * system dark mode like the rest of the app.
 */
export function PackageCard({ pkg, onBuy, busy = false, disabled = false }: PackageCardProps) {
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

      {onBuy ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('training.packages.buy')}
          accessibilityState={{ disabled: busy || disabled }}
          testID="package-buy"
          disabled={busy || disabled}
          onPress={() => onBuy(pkg)}
          style={({ pressed }) => ({
            marginTop: 4,
            height: 44,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            borderRadius: 10,
            backgroundColor: colors.primary,
            // A purchase in flight elsewhere dims every button, so it reads as
            // "wait" rather than "broken" when a second tap does nothing.
            opacity: busy || disabled ? 0.5 : pressed ? 0.85 : 1,
          })}
        >
          {busy ? <ActivityIndicator size="small" color={colors.onPrimary} /> : null}
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.onPrimary }}>
            {busy ? t('training.packages.buying') : t('training.packages.buy')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
