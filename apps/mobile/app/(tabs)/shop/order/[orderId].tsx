import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import type { OrderStatus } from '@fit/types';
import { useI18n } from '../../../../providers';
import { useOrder } from '../../../../hooks/useOrder';
import { formatMoney } from '../../../../lib/shop';

/**
 * Order confirmation / detail — the formacore "Aurora Glass" order-placed screen
 * (member-cart-mobile artboard's success sheet, rebuilt as a full screen).
 * Reached after checkout (`router.replace`) and as the target of the
 * `fit://orders/:orderId` deep link (remapped here by `app/+native-intent.ts`).
 *
 * A near-black `ink-950` canvas: a success check badge, an order card (number +
 * amount paid), the itemised breakdown, the total, and a "keep shopping" action.
 * Reads the order back via `GET /orders/:orderId`; a missing / unknown id renders
 * a graceful "order not found" state rather than erroring, so a stale deep link
 * still shows a sensible page. Dark-only, matching the redesigned shop tab (T7.6)
 * and the rest of the member app.
 */
export default function OrderDetailScreen() {
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();

  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const order = useOrder(orderId ?? null);
  // Bind to a local so the non-null narrowing survives into the map closures below.
  const summary = order.data ?? null;

  return (
    <View className="flex-1 bg-ink-950">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
          gap: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        {order.isLoading ? (
          <View className="items-center gap-3 py-24">
            <ActivityIndicator color="#9184F1" />
            <Text className="text-sm text-ink-400">{t('member.shop.order.loading')}</Text>
          </View>
        ) : order.isError ? (
          <View className="items-center gap-3 py-20 px-6">
            <Text className="text-center text-sm text-ink-400">{t('member.shop.order.error')}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void order.refetch()}
              className="rounded-btn border border-white/15 bg-white/5 px-5 py-2.5 active:bg-white/10"
            >
              <Text className="text-sm font-semibold text-white">
                {t('member.shop.order.retry')}
              </Text>
            </Pressable>
          </View>
        ) : !summary ? (
          <View className="items-center gap-2 py-20 px-6">
            <Text className="text-4xl">🔍</Text>
            <Text className="text-lg font-bold text-white">
              {t('member.shop.order.notFound.title')}
            </Text>
            <Text className="max-w-[300px] text-center text-sm text-ink-400">
              {t('member.shop.order.notFound.subtitle')}
            </Text>
            <ContinueButton label={t('member.shop.order.continue')} />
          </View>
        ) : (
          <>
            {/* ---- success header ---- */}
            <View testID="order-confirmation" className="items-center gap-3 pt-6">
              <View className="h-16 w-16 items-center justify-center rounded-full bg-success-500">
                <Text className="text-3xl font-black text-white">✓</Text>
              </View>
              <Text className="text-2xl font-black tracking-tight text-white">
                {t('member.shop.order.title')}
              </Text>
              <Text className="max-w-[300px] text-center text-sm text-ink-400">
                {t('member.shop.order.subtitle')}
              </Text>
              <StatusBadge
                status={summary.status}
                label={t(`member.shop.order.status.${summary.status}`)}
              />
            </View>

            {/* ---- order id + amount paid ---- */}
            <View className="flex-row items-center justify-between rounded-card border border-white/10 bg-white/5 p-4">
              <View>
                <Text className="font-mono text-[11px] uppercase tracking-wide text-ink-500">
                  {t('member.shop.order.orderLabel')}
                </Text>
                <Text className="mt-0.5 font-mono text-base font-bold text-white">
                  #{summary.id.slice(0, 8).toUpperCase()}
                </Text>
              </View>
              <View className="items-end">
                <Text className="font-mono text-[11px] uppercase tracking-wide text-ink-500">
                  {t('member.shop.order.paidLabel')}
                </Text>
                <Text
                  className="mt-0.5 text-lg font-extrabold text-white"
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  {formatMoney(summary.total, summary.currency, locale)}
                </Text>
              </View>
            </View>

            {/* ---- itemised breakdown ---- */}
            <View className="gap-3 rounded-card border border-white/10 bg-white/5 p-4">
              {summary.items.map((item, index) => (
                <View
                  key={`${item.label}-${index}`}
                  className="flex-row items-center justify-between gap-3"
                >
                  <Text className="min-w-0 flex-1 text-sm text-ink-300">{item.label}</Text>
                  <Text
                    className="font-mono text-sm font-semibold text-white"
                    style={{ fontVariant: ['tabular-nums'] }}
                  >
                    {formatMoney(item.amount, summary.currency, locale)}
                  </Text>
                </View>
              ))}
              <View className="my-1 h-px bg-white/10" />
              <View className="flex-row items-end justify-between">
                <Text className="text-base font-semibold text-white">
                  {t('member.shop.order.total')}
                </Text>
                <Text
                  className="text-xl font-black text-white"
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  {formatMoney(summary.total, summary.currency, locale)}
                </Text>
              </View>
            </View>

            <ContinueButton label={t('member.shop.order.continue')} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** A small status pill for the order's lifecycle state. */
function StatusBadge({ status, label }: { status: OrderStatus; label: string }) {
  const cancelled = status === 'cancelled';
  return (
    <View
      className={`rounded-pill border px-2.5 py-1 ${
        cancelled ? 'border-white/10 bg-white/5' : 'border-success-400/30 bg-success-500/15'
      }`}
    >
      <Text
        className={`text-[11px] font-semibold ${cancelled ? 'text-ink-300' : 'text-success-200'}`}
      >
        {label}
      </Text>
    </View>
  );
}

/** "Keep shopping" CTA back to the shop browse. */
function ContinueButton({ label }: { label: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.replace('/shop')}
      className="h-12 flex-row items-center justify-center gap-2 rounded-btn bg-brand-600 active:bg-brand-700"
    >
      <Text className="text-[15px] font-bold text-white">{label}</Text>
      <Text className="text-[15px] font-bold text-white">›</Text>
    </Pressable>
  );
}
