import { Image, Pressable, Text, View } from 'react-native';
import { useI18n } from '../../providers/I18nProvider';
import { formatMoney } from '../../lib/shop';
import type { CartLine } from '../../providers/CartProvider';

export interface CartLineRowProps {
  line: CartLine;
  /** Set this line's quantity (0 removes it). */
  onSetQuantity: (key: string, quantity: number) => void;
  /** Remove this line outright. */
  onRemove: (key: string) => void;
}

/**
 * One line in the cart review — the formacore "Aurora Glass" cart card
 * (member-cart-mobile artboard). A glass tile on the near-black canvas: a square
 * product thumbnail, the product name + chosen variant pill, a − / quantity / +
 * stepper, the line subtotal (with a per-unit "ea" line once quantity > 1), and
 * a remove control. Decrementing past 1 removes the line (handled by the cart
 * store), so the stepper doubles as the remove for the last unit. Prices come
 * through `formatMoney`, honouring the line's real currency. Dark-only, matching
 * the redesigned shop tab (T7.6) and the rest of the member app.
 */
export function CartLineRow({ line, onSetQuantity, onRemove }: CartLineRowProps) {
  const { t, locale } = useI18n();

  const lineTotal = formatMoney(line.unitAmount * line.quantity, line.currency, locale);
  const unit = formatMoney(line.unitAmount, line.currency, locale);

  return (
    <View className="flex-row gap-3 rounded-card border border-white/10 bg-white/5 p-3">
      {line.imageUrl ? (
        <Image
          source={{ uri: line.imageUrl }}
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          className="h-20 w-20 rounded-card border border-white/10"
        />
      ) : (
        <View className="h-20 w-20 items-center justify-center rounded-card border border-white/10 bg-white/5">
          <Text className="text-2xl text-ink-600">🛍️</Text>
        </View>
      )}

      <View className="min-w-0 flex-1">
        <View className="flex-row items-start justify-between gap-2">
          <Text
            numberOfLines={2}
            className="min-w-0 flex-1 text-sm font-semibold leading-snug text-white"
          >
            {line.productName}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('member.shop.cart.remove')}
            onPress={() => onRemove(line.key)}
            hitSlop={8}
            className="h-8 w-8 items-center justify-center rounded-btn active:bg-danger-500/10"
          >
            <Text className="text-base font-semibold text-ink-500">✕</Text>
          </Pressable>
        </View>

        {line.variantName ? (
          <View className="mt-1.5 self-start rounded-pill border border-white/10 bg-white/5 px-2.5 py-1">
            <Text className="text-[11px] font-semibold text-ink-200">{line.variantName}</Text>
          </View>
        ) : null}

        <View className="mt-2.5 flex-row items-center justify-between">
          <View className="h-9 flex-row items-center overflow-hidden rounded-btn border border-white/15 bg-white/5">
            <Stepper
              label="−"
              accessibilityLabel={t('member.shop.cart.decrease')}
              onPress={() => onSetQuantity(line.key, line.quantity - 1)}
            />
            <Text
              className="w-7 text-center font-mono text-sm font-bold text-white"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {line.quantity}
            </Text>
            <Stepper
              label="+"
              accessibilityLabel={t('member.shop.cart.increase')}
              onPress={() => onSetQuantity(line.key, line.quantity + 1)}
            />
          </View>

          <View className="items-end">
            <Text
              className="font-mono text-sm font-bold text-white"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {lineTotal}
            </Text>
            {line.quantity > 1 ? (
              <Text className="font-mono text-[10px] text-ink-500">
                {t('member.shop.cart.each', { price: unit })}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

/** A − / + quantity button inside the stepper. */
function Stepper({
  label,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      className="h-full w-8 items-center justify-center active:bg-white/10"
    >
      <Text className="text-base font-bold text-ink-300">{label}</Text>
    </Pressable>
  );
}
