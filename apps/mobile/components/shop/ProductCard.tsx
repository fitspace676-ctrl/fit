import { Image, Pressable, Text, View } from 'react-native';
import type { ProductSummary } from '@fit/types';
import { useI18n } from '../../providers/I18nProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { formatMoney } from '../../lib/shop';

export interface ProductCardProps {
  product: ProductSummary;
  /** Called with the product id when the card is tapped (opens detail). */
  onPress: (id: string) => void;
}

/**
 * One shop product as a tappable row on the browse screen (T6.7): a square
 * thumbnail (or a placeholder when the product has no image), the name, a short
 * description, and the price. When a product has variants priced differently the
 * card shows a "from <lowest>" so the buyer sees the entry price without opening
 * the detail. Colours come from `useTheme()`, so the card tracks system dark
 * mode like the rest of the app. Tapping opens the product detail where a
 * variant is chosen and the item is added to the cart.
 */
export function ProductCard({ product, onPress }: ProductCardProps) {
  const { colors } = useTheme();
  const { t, locale } = useI18n();

  // Show "from <lowest>" only when variants actually price below the base —
  // otherwise the base price is the single, honest number.
  const variantPrices = product.variants.map((v) => v.priceAmount);
  const lowest = variantPrices.length > 0 ? Math.min(...variantPrices, product.priceAmount) : null;
  const showFrom = lowest !== null && lowest < product.priceAmount;
  const price = formatMoney(showFrom ? lowest : product.priceAmount, product.currency, locale);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(product.id)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Thumbnail uri={product.imageUrl} colors={colors} />

      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
          {product.name}
        </Text>
        {product.description ? (
          <Text numberOfLines={2} style={{ fontSize: 13, color: colors.textMuted }}>
            {product.description}
          </Text>
        ) : null}
        <Text style={{ marginTop: 2, fontSize: 15, fontWeight: '700', color: colors.primary }}>
          {showFrom ? t('shop.browse.fromPrice', { price }) : price}
        </Text>
      </View>
    </Pressable>
  );
}

/** Square product image, or a neutral placeholder tile when none is set. */
function Thumbnail({
  uri,
  colors,
}: {
  uri: string | null;
  colors: { border: string; background: string; textMuted: string };
}) {
  const size = 64;
  if (uri) {
    return (
      <Image
        source={{ uri }}
        accessibilityIgnoresInvertColors
        style={{
          width: size,
          height: size,
          borderRadius: 10,
          backgroundColor: colors.background,
        }}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.background,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: 22, color: colors.textMuted }}>🛍️</Text>
    </View>
  );
}
