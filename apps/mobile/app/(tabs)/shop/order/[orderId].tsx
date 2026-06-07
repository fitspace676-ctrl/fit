import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import type { OrderStatus } from '@fit/types';
import { useI18n, useTheme } from '../../../../providers';
import { useOrder } from '../../../../hooks/useOrder';
import { formatMoney } from '../../../../lib/shop';

/**
 * Order confirmation / detail (T6.7) — reached after checkout (`router.replace`)
 * and as the target of the `fit://orders/:orderId` deep link (remapped here by
 * `app/+native-intent.ts`). Reads the order back via `GET /orders/:orderId` and
 * confirms it with a status badge, an itemised breakdown, and the total. A
 * missing / unknown id renders a graceful "order not found" state rather than
 * erroring — a stale deep link still shows a sensible page. Colours come from
 * `useTheme()`.
 */
export default function OrderDetailScreen() {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();

  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const order = useOrder(orderId ?? null);
  // Bind to a local so the non-null narrowing survives into the map closures below.
  const summary = order.data ?? null;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, gap: 16 }}
    >
      {order.isLoading ? (
        <View style={{ paddingVertical: 80, alignItems: 'center', gap: 12 }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ fontSize: 14, color: colors.textMuted }}>{t('shop.order.loading')}</Text>
        </View>
      ) : order.isError ? (
        <View style={{ paddingVertical: 64, alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center' }}>
            {t('shop.order.error')}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void order.refetch()}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              paddingHorizontal: 16,
              paddingVertical: 8,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>
              {t('shop.retry')}
            </Text>
          </Pressable>
        </View>
      ) : !summary ? (
        <View style={{ paddingVertical: 64, alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>
            {t('shop.order.notFound.title')}
          </Text>
          <Text
            style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center', maxWidth: 320 }}
          >
            {t('shop.order.notFound.subtitle')}
          </Text>
          <HomeButton label={t('shop.order.continue')} colors={colors} />
        </View>
      ) : (
        <View style={{ gap: 20, alignItems: 'stretch' }}>
          <View style={{ alignItems: 'center', gap: 10, paddingTop: 16 }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 999,
                backgroundColor: colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 26, color: colors.onPrimary }}>✓</Text>
            </View>
            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>
              {t('shop.order.title')}
            </Text>
            <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center' }}>
              {t('shop.order.subtitle')}
            </Text>
            <Text style={{ fontSize: 12, color: colors.textMuted }}>
              {t('shop.order.idLabel', { id: summary.id })}
            </Text>
            <StatusBadge
              status={summary.status}
              colors={colors}
              label={t(`shop.order.status.${summary.status}`)}
            />
          </View>

          <View
            style={{
              gap: 12,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              padding: 16,
              backgroundColor: colors.surface,
            }}
          >
            {summary.items.map((item, index) => (
              <View
                key={`${item.label}-${index}`}
                style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}
              >
                <Text style={{ flex: 1, fontSize: 14, color: colors.textMuted }}>{item.label}</Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>
                  {formatMoney(item.amount, summary.currency, locale)}
                </Text>
              </View>
            ))}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                borderTopWidth: 1,
                borderTopColor: colors.border,
                paddingTop: 12,
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>
                {t('shop.order.total')}
              </Text>
              <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>
                {formatMoney(summary.total, summary.currency, locale)}
              </Text>
            </View>
          </View>

          <HomeButton label={t('shop.order.continue')} colors={colors} />
        </View>
      )}
    </ScrollView>
  );
}

interface Colors {
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  onPrimary: string;
}

/** A small status pill for the order's lifecycle state. */
function StatusBadge({
  status,
  colors,
  label,
}: {
  status: OrderStatus;
  colors: Colors;
  label: string;
}) {
  const tone = status === 'cancelled' ? colors.border : colors.primary;
  const fg = status === 'cancelled' ? colors.text : colors.onPrimary;
  return (
    <View
      style={{
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 4,
        backgroundColor: tone,
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: '700', color: fg }}>{label}</Text>
    </View>
  );
}

/** "Continue shopping" CTA back to the shop browse. */
function HomeButton({ label, colors }: { label: string; colors: Colors }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.replace('/shop')}
      style={({ pressed }) => ({
        borderRadius: 12,
        backgroundColor: colors.primary,
        paddingVertical: 14,
        alignItems: 'center',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ fontSize: 16, fontWeight: '700', color: colors.onPrimary }}>{label}</Text>
    </Pressable>
  );
}
