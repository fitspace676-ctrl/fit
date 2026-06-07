import { Image, Pressable, Text, View } from 'react-native';
import { useI18n } from '../../providers/I18nProvider';
import { useTheme } from '../../providers/ThemeProvider';
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
 * One line in the cart review (T6.7): a thumbnail, the product (and chosen
 * variant) name, a − / quantity / + stepper, the line subtotal, and a remove
 * action. Decrementing past 1 removes the line (handled by the cart store), so
 * the stepper doubles as the remove for the last unit. Colours come from
 * `useTheme()`, so the row tracks system dark mode.
 */
export function CartLineRow({ line, onSetQuantity, onRemove }: CartLineRowProps) {
  const { colors } = useTheme();
  const { t, locale } = useI18n();

  const lineTotal = formatMoney(line.unitAmount * line.quantity, line.currency, locale);
  const unit = formatMoney(line.unitAmount, line.currency, locale);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      {line.imageUrl ? (
        <Image
          source={{ uri: line.imageUrl }}
          accessibilityIgnoresInvertColors
          style={{ width: 52, height: 52, borderRadius: 8, backgroundColor: colors.background }}
        />
      ) : (
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.background,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 18, color: colors.textMuted }}>🛍️</Text>
        </View>
      )}

      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>
          {line.productName}
        </Text>
        {line.variantName ? (
          <Text numberOfLines={1} style={{ fontSize: 13, color: colors.textMuted }}>
            {line.variantName}
          </Text>
        ) : null}
        <Text style={{ fontSize: 13, color: colors.textMuted }}>
          {t('shop.cart.eachPrice', { price: unit })}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
          <Stepper
            label="−"
            accessibilityLabel={t('shop.cart.decrease')}
            colors={colors}
            onPress={() => onSetQuantity(line.key, line.quantity - 1)}
          />
          <Text
            style={{
              fontSize: 15,
              fontWeight: '700',
              minWidth: 20,
              textAlign: 'center',
              color: colors.text,
            }}
          >
            {line.quantity}
          </Text>
          <Stepper
            label="+"
            accessibilityLabel={t('shop.cart.increase')}
            colors={colors}
            onPress={() => onSetQuantity(line.key, line.quantity + 1)}
          />
        </View>
      </View>

      <View style={{ alignItems: 'flex-end', gap: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{lineTotal}</Text>
        <Pressable accessibilityRole="button" onPress={() => onRemove(line.key)} hitSlop={8}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textMuted }}>
            {t('shop.cart.remove')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** A square − / + quantity button. */
function Stepper({
  label,
  accessibilityLabel,
  colors,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  colors: { border: string; text: string };
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 32,
        height: 32,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{label}</Text>
    </Pressable>
  );
}
