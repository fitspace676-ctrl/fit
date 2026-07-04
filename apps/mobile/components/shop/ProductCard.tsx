import { memo } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import type { ProductSummary } from '@fit/types';
import { formatMoney } from '../../lib/shop';

export interface ProductCardProps {
  product: ProductSummary;
  /** Active locale, for currency formatting. */
  locale: string;
  /** "Add to cart" accessibility label for the quick-add button. */
  addLabel: string;
  /** "from {price}" template for a product whose variants price below base. */
  fromLabel: (price: string) => string;
  /** "Sold out" label shown when every variant is unavailable. */
  soldOutLabel: string;
  /** Called with the product id when the tile is tapped (opens detail). */
  onPress: (id: string) => void;
  /** Quick-add: called with the product; the screen decides whether to add the
   * variant-less product directly or open the detail to pick a variant. */
  onAdd: (product: ProductSummary) => void;
}

/**
 * One shop product as a tile in the 2-up browse grid — the formacore "Aurora
 * Glass" store card (member-shop-mobile artboard). A frosted glass panel on the
 * `ink-950` canvas: a square product image (or a placeholder when the product
 * has no image), the name, the price, and a brand-tinted quick-add "+" button.
 *
 * When a product's variants price below its base, the tile shows "from
 * <lowest>" so the buyer sees the entry price without opening the detail. A
 * product whose every variant is out of stock reads "Sold out" and disables the
 * quick-add. Purely presentational — the shop screen owns the catalogue, search,
 * and the add/navigate decision. Dark-only, matching the redesigned home (T7.2),
 * classes (T7.3), and trainers (T7.5) tabs.
 */
export const ProductCard = memo(function ProductCard({
  product,
  locale,
  addLabel,
  fromLabel,
  soldOutLabel,
  onPress,
  onAdd,
}: ProductCardProps) {
  // Show "from <lowest>" only when variants actually price below the base —
  // otherwise the base price is the single, honest number.
  const variantPrices = product.variants.map((v) => v.priceAmount);
  const lowest = variantPrices.length > 0 ? Math.min(...variantPrices, product.priceAmount) : null;
  const showFrom = lowest !== null && lowest < product.priceAmount;
  const price = formatMoney(showFrom ? lowest : product.priceAmount, product.currency, locale);

  // A product with variants is buyable while any variant is in stock; a
  // variant-less product is always buyable at its base price.
  const soldOut = product.variants.length > 0 && product.variants.every((v) => !v.available);

  return (
    <View className="flex-1 overflow-hidden rounded-card border border-white/10 bg-white/5">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={product.name}
        onPress={() => onPress(product.id)}
        className="active:opacity-80"
      >
        <Thumbnail uri={product.imageUrl} />
      </Pressable>

      <View className="gap-2 p-3">
        <Pressable accessibilityRole="button" onPress={() => onPress(product.id)}>
          <Text numberOfLines={2} className="min-h-[36px] text-[13px] font-semibold text-white">
            {product.name}
          </Text>
        </Pressable>

        <View className="flex-row items-end justify-between gap-2">
          <Text
            numberOfLines={1}
            className="min-w-0 flex-1 font-mono text-[15px] font-bold text-white"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {showFrom ? fromLabel(price) : price}
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={soldOut ? soldOutLabel : addLabel}
            accessibilityState={{ disabled: soldOut }}
            disabled={soldOut}
            onPress={() => onAdd(product)}
            className={`h-9 w-9 items-center justify-center rounded-btn ${
              soldOut ? 'bg-white/5' : 'bg-brand-600 active:bg-brand-700'
            }`}
          >
            <Text className={`text-lg font-bold ${soldOut ? 'text-ink-600' : 'text-white'}`}>
              {soldOut ? '·' : '+'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
});

/** Square product image, or a neutral placeholder tile when none is set. */
function Thumbnail({ uri }: { uri: string | null }) {
  return (
    <View className="aspect-square w-full bg-white/5">
      {uri ? (
        <Image
          source={{ uri }}
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          className="h-full w-full"
        />
      ) : (
        <View className="h-full w-full items-center justify-center">
          <Text className="text-4xl text-ink-600">🛍️</Text>
        </View>
      )}
    </View>
  );
}
