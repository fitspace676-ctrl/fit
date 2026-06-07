import { ScrollView, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useI18n, useTheme, useToast } from '../../../providers';
import { useCart } from '../../../providers/CartProvider';
import { useActiveGymId } from '../../../hooks/useActiveGym';
import { useCheckout } from '../../../hooks/useCheckout';
import { CartLineRow } from '../../../components/shop/CartLineRow';
import { formatMoney } from '../../../lib/shop';

/**
 * Cart review + checkout (T6.7). Lists the cart lines (each with a quantity
 * stepper + remove), shows the running subtotal, and checks out via the
 * cart-based `POST /orders` mutation. On success the cart is cleared (by the
 * mutation) and the screen `replace`s to the order confirmation — a replace, not
 * push, so Back from the confirmation can't resubmit. An empty cart renders a
 * "browse products" prompt. Colours come from `useTheme()`.
 */
export default function CartScreen() {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const gymId = useActiveGymId();
  const { lines, subtotal, currency, setQuantity, remove, toOrderItems } = useCart();
  const checkout = useCheckout();

  const isEmpty = lines.length === 0;

  const onCheckout = (): void => {
    if (isEmpty || !gymId || checkout.isPending) return;
    checkout
      .mutateAsync({ gymId, items: toOrderItems() })
      .then(({ orderId }) => {
        router.replace(`/shop/order/${orderId}`);
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : t('shop.checkout.error'));
      });
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, gap: 16 }}
    >
      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        hitSlop={8}
        style={{ alignSelf: 'flex-start' }}
      >
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.primary }}>
          ‹ {t('shop.cart.back')}
        </Text>
      </Pressable>

      <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text }}>
        {t('shop.cart.title')}
      </Text>

      {isEmpty ? (
        <View style={{ paddingVertical: 48, alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
            {t('shop.cart.empty.title')}
          </Text>
          <Text
            style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center', maxWidth: 320 }}
          >
            {t('shop.cart.empty.subtitle')}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/shop')}
            style={{
              marginTop: 8,
              borderRadius: 10,
              backgroundColor: colors.primary,
              paddingHorizontal: 16,
              paddingVertical: 10,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.onPrimary }}>
              {t('shop.cart.empty.action')}
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={{ gap: 10 }}>
            {lines.map((line) => (
              <CartLineRow
                key={line.key}
                line={line}
                onSetQuantity={setQuantity}
                onRemove={remove}
              />
            ))}
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingTop: 16,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
              {t('shop.cart.subtotal')}
            </Text>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>
              {formatMoney(subtotal, currency ?? 'USD', locale)}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={checkout.isPending}
            onPress={onCheckout}
            style={({ pressed }) => ({
              borderRadius: 12,
              backgroundColor: colors.primary,
              paddingVertical: 15,
              alignItems: 'center',
              opacity: checkout.isPending ? 0.6 : pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.onPrimary }}>
              {checkout.isPending ? t('shop.checkout.processing') : t('shop.checkout.pay')}
            </Text>
          </Pressable>

          <Text style={{ fontSize: 12, color: colors.textMuted, textAlign: 'center' }}>
            {t('shop.checkout.note')}
          </Text>
        </>
      )}
    </ScrollView>
  );
}
