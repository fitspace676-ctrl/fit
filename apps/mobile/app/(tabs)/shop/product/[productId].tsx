import { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import type { ProductSummary, ProductVariantSummary } from '@fit/types';
import { useI18n, useToast } from '../../../../providers';
import { useCart } from '../../../../providers/CartProvider';
import { useActiveGymId } from '../../../../hooks/useActiveGym';
import { useProducts } from '../../../../hooks/useProducts';
import { formatMoney } from '../../../../lib/shop';

/**
 * Product detail — the formacore "Aurora Glass" product screen
 * (member-shop-mobile artboard, the bottom-sheet content rebuilt as a full
 * screen). A near-black `ink-950` canvas: a frosted glass back button, a large
 * product image, the name / price / description, a variant option row, a
 * quantity stepper, and an add-to-cart action pinned to the bottom.
 *
 * Resolves the product from the (cached) catalogue by the `:productId` route
 * param rather than threading the object through navigation, so a deep link /
 * refresh re-fetches and matches by id. The buyer picks a variant (when the
 * product has them), sets a quantity, and adds the line to the cart; an
 * out-of-stock variant is shown but disabled. Adding toasts a confirmation and
 * routes to the cart so checkout is one tap away. Loading / error / not-found
 * states each render their own panel. Dark-only, matching the redesigned shop
 * tab and the rest of the member app.
 */
export default function ProductDetailScreen() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const insets = useSafeAreaInsets();

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
    toast.success(t('member.shop.detail.added'));
    router.push('/shop/cart');
  };

  return (
    <View className="flex-1 bg-ink-950">
      {/* ---- top app bar ---- */}
      <View style={{ paddingTop: insets.top + 12 }} className="px-5 pb-2">
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          hitSlop={8}
          className="h-10 flex-row items-center gap-1.5 self-start rounded-btn border border-white/10 bg-white/5 pl-2.5 pr-4 active:bg-white/10"
        >
          <Text className="text-lg font-bold text-ink-300">‹</Text>
          <Text className="text-[13px] font-semibold text-ink-200">
            {t('member.shop.detail.back')}
          </Text>
        </Pressable>
      </View>

      {products.isLoading ? (
        <View className="flex-1 items-center justify-center gap-3">
          <ActivityIndicator color="#9184F1" />
          <Text className="text-sm text-ink-400">{t('member.shop.loading')}</Text>
        </View>
      ) : products.isError ? (
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Text className="text-center text-sm text-ink-400">{t('member.shop.error')}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void products.refetch()}
            className="rounded-btn border border-white/15 bg-white/5 px-5 py-2.5 active:bg-white/10"
          >
            <Text className="text-sm font-semibold text-white">{t('member.shop.retry')}</Text>
          </Pressable>
        </View>
      ) : !product ? (
        <View className="flex-1 items-center justify-center gap-2 px-8">
          <Text className="text-4xl">🔍</Text>
          <Text className="text-lg font-bold text-white">
            {t('member.shop.detail.notFound.title')}
          </Text>
          <Text className="max-w-[320px] text-center text-sm text-ink-400">
            {t('member.shop.detail.notFound.subtitle')}
          </Text>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 8,
              paddingBottom: 24,
              gap: 18,
            }}
            showsVerticalScrollIndicator={false}
          >
            <Hero uri={product.imageUrl} />

            <View className="gap-2">
              <Text className="text-[26px] font-black leading-tight tracking-tight text-white">
                {product.name}
              </Text>
              <Text
                className="font-mono text-2xl font-bold text-white"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {formatMoney(unitAmount, product.currency, locale)}
              </Text>
              {product.description ? (
                <Text className="mt-1 text-sm leading-[21px] text-ink-300">
                  {product.description}
                </Text>
              ) : null}
            </View>

            {hasVariants ? (
              <View className="gap-2.5">
                <Text className="text-[11px] font-semibold uppercase tracking-[1.5px] text-ink-400">
                  {t('member.shop.detail.options')}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {product.variants.map((variant) => {
                    const selected = selectedVariant?.id === variant.id;
                    return (
                      <Pressable
                        key={variant.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected, disabled: !variant.available }}
                        disabled={!variant.available}
                        onPress={() => setVariantId(variant.id)}
                        className={`h-11 justify-center rounded-btn px-4 ${
                          selected
                            ? 'bg-white'
                            : 'border border-white/10 bg-white/5 active:bg-white/10'
                        } ${variant.available ? '' : 'opacity-40'}`}
                      >
                        <Text
                          className={`text-sm font-semibold ${
                            selected ? 'text-ink-950' : 'text-white'
                          }`}
                        >
                          {variant.name}
                          {variant.available ? '' : ` · ${t('member.shop.detail.outOfStock')}`}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </ScrollView>

          {/* ---- pinned add-to-cart action bar ---- */}
          <View
            style={{ paddingBottom: insets.bottom + 12 }}
            className="flex-row items-center gap-3 border-t border-white/10 bg-ink-950/95 px-5 pt-3"
          >
            <View className="h-12 flex-row items-center overflow-hidden rounded-btn border border-white/10 bg-white/5">
              <QtyButton
                label="−"
                accessibilityLabel={t('member.shop.detail.quantity')}
                disabled={quantity <= 1}
                onPress={() => setQuantity((q) => Math.max(1, q - 1))}
              />
              <Text
                className="w-9 text-center font-mono text-base font-bold text-white"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {quantity}
              </Text>
              <QtyButton
                label="+"
                accessibilityLabel={t('member.shop.detail.quantity')}
                disabled={quantity >= 99}
                onPress={() => setQuantity((q) => Math.min(99, q + 1))}
              />
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canAdd }}
              disabled={!canAdd}
              onPress={onAdd}
              className={`h-12 flex-1 flex-row items-center justify-center gap-2 rounded-btn ${
                canAdd ? 'bg-brand-600 active:bg-brand-700' : 'bg-white/5'
              }`}
            >
              <Text className={`text-[15px] font-bold ${canAdd ? 'text-white' : 'text-ink-600'}`}>
                {canAdd ? t('member.shop.detail.addToCart') : t('member.shop.detail.unavailable')}
              </Text>
              {canAdd ? (
                <Text
                  className="font-mono text-[15px] font-bold text-white"
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  · {formatMoney(unitAmount * quantity, product.currency, locale)}
                </Text>
              ) : null}
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

/** Large product image, or a neutral placeholder when none is set. */
function Hero({ uri }: { uri: string | null }) {
  return (
    <View className="aspect-[16/11] w-full overflow-hidden rounded-card border border-white/10 bg-white/5">
      {uri ? (
        <Image
          source={{ uri }}
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          className="h-full w-full"
        />
      ) : (
        <View className="h-full w-full items-center justify-center">
          <Text className="text-5xl text-ink-600">🛍️</Text>
        </View>
      )}
    </View>
  );
}

/** A −/+ quantity button inside the stepper. */
function QtyButton({
  label,
  accessibilityLabel,
  disabled,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`h-full w-11 items-center justify-center active:bg-white/10 ${
        disabled ? 'opacity-40' : ''
      }`}
    >
      <Text className="text-xl font-bold text-ink-200">{label}</Text>
    </Pressable>
  );
}
