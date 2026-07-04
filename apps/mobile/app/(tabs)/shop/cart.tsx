import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useI18n, useToast } from '../../../providers';
import { useCart } from '../../../providers/CartProvider';
import { useActiveGymId } from '../../../hooks/useActiveGym';
import { useCheckout } from '../../../hooks/useCheckout';
import { CartLineRow } from '../../../components/shop/CartLineRow';
import { formatMoney } from '../../../lib/shop';

/**
 * Cart review + checkout — the formacore "Aurora Glass" cart
 * (member-cart-mobile artboard). A near-black `ink-950` canvas with:
 *
 *   • a top app bar (frosted back button + "Your cart · N" title),
 *   • the cart lines as glass cards (thumbnail, variant, stepper, line total),
 *   • a front-desk pickup card (this gym fulfils online orders at the desk —
 *     no shipping, matching the shop tab's member perk),
 *   • an order summary (subtotal · free pickup · total),
 *   • a pinned checkout bar carrying the live total and the place-order action.
 *
 * Checkout turns the local cart into a pending order via the cart-based
 * `POST /orders` mutation; on success the cart is cleared (by the mutation) and
 * the screen `replace`s to the order confirmation — a replace, not push, so Back
 * from the confirmation can't resubmit. Payment stays simulated until a real
 * provider lands (T5.11). An empty cart renders a "browse shop" prompt.
 * Dark-only, matching the redesigned shop tab (T7.6) and the member app.
 */
export default function CartScreen() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const gymId = useActiveGymId();
  const { lines, count, subtotal, currency, setQuantity, remove, toOrderItems } = useCart();
  const checkout = useCheckout();

  const isEmpty = lines.length === 0;
  const money = (amount: number): string => formatMoney(amount, currency ?? 'USD', locale);

  const onCheckout = (): void => {
    if (isEmpty || !gymId || checkout.isPending) return;
    checkout
      .mutateAsync({ gymId, items: toOrderItems() })
      .then(({ orderId }) => {
        router.replace(`/shop/order/${orderId}`);
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : t('member.shop.checkout.error'));
      });
  };

  return (
    <View className="flex-1 bg-ink-950">
      {/* ---- top app bar ---- */}
      <View style={{ paddingTop: insets.top + 12 }} className="flex-row items-center px-5 pb-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('member.shop.cart.back')}
          onPress={() => router.back()}
          hitSlop={8}
          className="h-11 w-11 items-center justify-center rounded-btn border border-white/10 bg-white/5 active:bg-white/10"
        >
          <Text className="text-xl font-bold text-ink-300">‹</Text>
        </Pressable>
        <View className="flex-1 flex-row items-center justify-center gap-1.5">
          <Text className="text-lg font-extrabold tracking-tight text-white">
            {t('member.shop.cart.title')}
          </Text>
          {count > 0 ? (
            <Text
              className="font-mono text-sm text-ink-500"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              · {count}
            </Text>
          ) : null}
        </View>
        <View className="h-11 w-11" />
      </View>

      {isEmpty ? (
        <View className="flex-1 items-center px-5 pt-24">
          <View className="h-20 w-20 items-center justify-center rounded-card border border-white/10 bg-white/5">
            <Text className="text-4xl text-ink-500">🛍️</Text>
          </View>
          <Text className="mt-5 text-xl font-extrabold text-white">
            {t('member.shop.cart.empty.title')}
          </Text>
          <Text className="mt-1.5 max-w-[280px] text-center text-sm text-ink-400">
            {t('member.shop.cart.empty.subtitle')}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/shop')}
            className="mt-6 h-12 flex-row items-center gap-2 rounded-btn bg-brand-600 px-6 active:bg-brand-700"
          >
            <Text className="text-[15px] font-bold text-white">
              {t('member.shop.cart.empty.action')}
            </Text>
            <Text className="text-[15px] font-bold text-white">›</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView
            className="flex-1"
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 4,
              paddingBottom: 24,
              gap: 16,
            }}
            showsVerticalScrollIndicator={false}
          >
            {/* ---- items ---- */}
            <View className="gap-2.5">
              {lines.map((line) => (
                <CartLineRow
                  key={line.key}
                  line={line}
                  onSetQuantity={setQuantity}
                  onRemove={remove}
                />
              ))}
            </View>

            {/* ---- front-desk pickup ---- */}
            <View className="rounded-card border border-white/10 bg-white/5 p-4">
              <View className="flex-row items-center gap-3">
                <View className="h-11 w-11 items-center justify-center rounded-card border border-accent-400/25 bg-accent-500/15">
                  <Text className="text-lg">📍</Text>
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-semibold text-white">
                    {t('member.shop.cart.pickup.title')}
                  </Text>
                  <Text className="text-xs text-ink-400">
                    {t('member.shop.cart.pickup.subtitle')}
                  </Text>
                </View>
                <View className="rounded-pill border border-success-400/30 bg-success-500/15 px-2.5 py-1">
                  <Text className="text-[11px] font-semibold text-success-200">
                    {t('member.shop.cart.pickup.free')}
                  </Text>
                </View>
              </View>
              <Text className="mt-3 text-xs text-ink-400">
                🕑 {t('member.shop.cart.pickup.ready')}
              </Text>
            </View>

            {/* ---- order summary ---- */}
            <View className="gap-2.5 rounded-card border border-white/10 bg-white/5 p-4">
              <SummaryRow label={t('member.shop.cart.summary.subtotal')} value={money(subtotal)} />
              <View className="flex-row items-center justify-between">
                <Text className="text-sm text-ink-300">{t('member.shop.cart.summary.pickup')}</Text>
                <Text className="text-sm font-semibold text-success-300">
                  {t('member.shop.cart.pickup.free')}
                </Text>
              </View>
              <View className="my-1 h-px bg-white/10" />
              <View className="flex-row items-end justify-between">
                <Text className="text-base font-semibold text-white">
                  {t('member.shop.cart.summary.total')}
                </Text>
                <Text
                  className="text-2xl font-black text-white"
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  {money(subtotal)}
                </Text>
              </View>
              <Text className="text-[11px] text-ink-500">🔒 {t('member.shop.cart.secure')}</Text>
            </View>
          </ScrollView>

          {/* ---- pinned checkout bar ---- */}
          <View
            style={{ paddingBottom: insets.bottom + 12 }}
            className="flex-row items-center gap-3 border-t border-white/10 bg-ink-950/95 px-5 pt-3"
          >
            <View className="flex-1">
              <Text className="font-mono text-[11px] uppercase tracking-wide text-ink-400">
                {t('member.shop.checkout.total')}
              </Text>
              <Text
                className="text-xl font-extrabold text-white"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {money(subtotal)}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: checkout.isPending }}
              disabled={checkout.isPending}
              onPress={onCheckout}
              className={`h-12 flex-row items-center gap-2 rounded-btn px-6 ${
                checkout.isPending ? 'bg-white/10' : 'bg-brand-600 active:bg-brand-700'
              }`}
            >
              <Text
                className={`text-[15px] font-bold ${
                  checkout.isPending ? 'text-ink-400' : 'text-white'
                }`}
              >
                {checkout.isPending
                  ? t('member.shop.checkout.processing')
                  : t('member.shop.checkout.place')}
              </Text>
              {checkout.isPending ? null : (
                <Text className="text-[15px] font-bold text-white">›</Text>
              )}
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

/** A label / value row in the order summary. */
function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-sm text-ink-300">{label}</Text>
      <Text className="font-mono text-sm text-ink-100" style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </View>
  );
}
