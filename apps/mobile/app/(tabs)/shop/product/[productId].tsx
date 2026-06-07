import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import type { ProductSummary, ProductVariantSummary } from '@fit/types';
import { useI18n, useTheme, useToast } from '../../../../providers';
import { useCart } from '../../../../providers/CartProvider';
import { useActiveGymId } from '../../../../hooks/useActiveGym';
import { useProducts } from '../../../../hooks/useProducts';
import { formatMoney } from '../../../../lib/shop';

/**
 * Product detail (T6.7) — resolves the product from the (cached) catalogue by the
 * `:productId` route param rather than threading the object through navigation,
 * so a deep link / refresh re-fetches and matches by id. The buyer picks a
 * variant (when the product has them), sets a quantity, and adds the line to the
 * cart; an out-of-stock variant is shown but disabled. Adding toasts a
 * confirmation and routes to the cart so checkout is one tap away. Loading /
 * error / not-found states each render their own panel. Colours come from
 * `useTheme()`.
 */
export default function ProductDetailScreen() {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const { productId } = useLocalSearchParams<{ productId: string }>();
  const gymId = useActiveGymId();
  const products = useProducts(gymId);
  const { add } = useCart();

  const product = useMemo<ProductSummary | null>(
    () => products.data?.find((p) => p.id === productId) ?? null,
    [products.data, productId],
  );

  // Default the selection to the first available variant (or the first listed).
  const [variantId, setVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);

  const selectedVariant = useMemo<ProductVariantSummary | null>(() => {
    if (!product || product.variants.length === 0) return null;
    const explicit = variantId ? product.variants.find((v) => v.id === variantId) : null;
    return explicit ?? product.variants.find((v) => v.available) ?? product.variants[0] ?? null;
  }, [product, variantId]);

  const hasVariants = (product?.variants.length ?? 0) > 0;
  const canAdd =
    product != null && (!hasVariants || (selectedVariant != null && selectedVariant.available));

  const unitAmount = selectedVariant ? selectedVariant.priceAmount : (product?.priceAmount ?? 0);

  const onAdd = (): void => {
    if (!product || !canAdd) return;
    add(product, selectedVariant ?? undefined, quantity);
    toast.success(t('shop.detail.added'));
    router.push('/shop/cart');
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
          ‹ {t('shop.detail.back')}
        </Text>
      </Pressable>

      {products.isLoading ? (
        <View style={{ paddingVertical: 64, alignItems: 'center', gap: 12 }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ fontSize: 14, color: colors.textMuted }}>{t('shop.browse.loading')}</Text>
        </View>
      ) : products.isError ? (
        <View style={{ paddingVertical: 56, alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center' }}>
            {t('shop.browse.error')}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void products.refetch()}
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
      ) : !product ? (
        <View style={{ paddingVertical: 56, alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>
            {t('shop.detail.notFound.title')}
          </Text>
          <Text
            style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center', maxWidth: 320 }}
          >
            {t('shop.detail.notFound.subtitle')}
          </Text>
        </View>
      ) : (
        <>
          <Hero uri={product.imageUrl} width={width - 40} colors={colors} />

          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>
              {product.name}
            </Text>
            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.primary }}>
              {formatMoney(unitAmount, product.currency, locale)}
            </Text>
            {product.description ? (
              <Text style={{ fontSize: 14, lineHeight: 21, color: colors.text }}>
                {product.description}
              </Text>
            ) : null}
          </View>

          {hasVariants ? (
            <View style={{ gap: 10 }}>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                  color: colors.textMuted,
                }}
              >
                {t('shop.detail.options')}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {product.variants.map((variant) => {
                  const selected = selectedVariant?.id === variant.id;
                  return (
                    <Pressable
                      key={variant.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected, disabled: !variant.available }}
                      disabled={!variant.available}
                      onPress={() => setVariantId(variant.id)}
                      style={{
                        borderRadius: 10,
                        borderWidth: selected ? 2 : 1,
                        borderColor: selected ? colors.primary : colors.border,
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        opacity: variant.available ? 1 : 0.4,
                      }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>
                        {variant.name}
                        {variant.available ? '' : ` · ${t('shop.detail.outOfStock')}`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={{ gap: 10 }}>
            <Text
              style={{
                fontSize: 13,
                fontWeight: '700',
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                color: colors.textMuted,
              }}
            >
              {t('shop.detail.quantity')}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <QtyButton
                label="−"
                accessibilityLabel={t('shop.cart.decrease')}
                disabled={quantity <= 1}
                colors={colors}
                onPress={() => setQuantity((q) => Math.max(1, q - 1))}
              />
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: '700',
                  minWidth: 28,
                  textAlign: 'center',
                  color: colors.text,
                }}
              >
                {quantity}
              </Text>
              <QtyButton
                label="+"
                accessibilityLabel={t('shop.cart.increase')}
                disabled={quantity >= 99}
                colors={colors}
                onPress={() => setQuantity((q) => Math.min(99, q + 1))}
              />
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={!canAdd}
            onPress={onAdd}
            style={({ pressed }) => ({
              marginTop: 8,
              borderRadius: 12,
              backgroundColor: canAdd ? colors.primary : colors.border,
              paddingVertical: 15,
              alignItems: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.onPrimary }}>
              {canAdd ? t('shop.detail.addToCart') : t('shop.detail.unavailable')}
            </Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

interface Colors {
  background: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  onPrimary: string;
}

/** Large product image, or a neutral placeholder when none is set. */
function Hero({ uri, width, colors }: { uri: string | null; width: number; colors: Colors }) {
  const height = Math.round(width * 0.6);
  if (uri) {
    return (
      <Image
        source={{ uri }}
        accessibilityIgnoresInvertColors
        style={{ width, height, borderRadius: 14, backgroundColor: colors.background }}
      />
    );
  }
  return (
    <View
      style={{
        width,
        height,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.background,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: 48, color: colors.textMuted }}>🛍️</Text>
    </View>
  );
}

/** A square − / + quantity button. */
function QtyButton({
  label,
  accessibilityLabel,
  disabled,
  colors,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  disabled: boolean;
  colors: Colors;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
      })}
    >
      <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>{label}</Text>
    </Pressable>
  );
}
