import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import type { ProductSummary } from '@fit/types';
import { useI18n, useToast } from '../../../providers';
import { useCart } from '../../../providers/CartProvider';
import { useActiveGymId } from '../../../hooks/useActiveGym';
import { useProducts } from '../../../hooks/useProducts';
import { formatMoney } from '../../../lib/shop';
import { ProductCard } from '../../../components/shop/ProductCard';

/**
 * Shop tab — the formacore "Aurora Glass" supplements & gear store
 * (member-shop-mobile artboard). A near-black `ink-950` canvas with:
 *
 *   • a top app bar (eyebrow + title + a cart button carrying a live count badge),
 *   • a frosted search field (matches by product name / description),
 *   • a member-perk banner (front-desk pickup),
 *   • the catalogue as a 2-up glass product grid,
 *   • a sticky mini-cart bar that opens the cart once it has items.
 *
 * One `GET /products` query (keyed on the gym) backs the whole screen; searching
 * re-slices that cached catalogue client-side without refetching. Tapping a tile
 * deep-links to `/shop/product/:id`; the tile's quick-add adds a variant-less
 * product straight to the cart, or opens the detail when a variant must be
 * chosen. Pull-to-refresh revalidates. Dark-only, matching the redesigned home
 * (T7.2), classes (T7.3), and trainers (T7.5) tabs.
 */
export default function ShopScreen() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const gymId = useActiveGymId();
  const { count, subtotal, currency, add } = useCart();
  const products = useProducts(gymId);

  const [search, setSearch] = useState('');

  const catalogue = useMemo(() => products.data ?? [], [products.data]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return catalogue;
    return catalogue.filter(
      (p) => p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query),
    );
  }, [catalogue, search]);

  const hasSearch = search.trim().length > 0;
  const refreshing = products.isFetching && !products.isLoading;

  // Quick-add from a grid tile: a variant-less product goes straight into the
  // cart (with a confirmation toast); a product with variants opens the detail
  // so the buyer can pick one before adding.
  const onQuickAdd = (product: ProductSummary): void => {
    if (product.variants.length > 0) {
      router.push(`/shop/product/${product.id}`);
      return;
    }
    add(product);
    toast.success(t('member.shop.detail.added'));
  };

  const fromLabel = (price: string): string => t('member.shop.from', { price });

  return (
    <View className="flex-1 bg-ink-950">
      {/* ---- top app bar ---- */}
      <View style={{ paddingTop: insets.top + 12 }}>
        <View className="flex-row items-start justify-between px-5 pb-3">
          <View className="min-w-0 flex-1">
            <Text className="font-mono text-[10px] uppercase tracking-[1.5px] text-ink-500">
              {t('member.shop.eyebrow')}
            </Text>
            <Text className="mt-0.5 text-2xl font-extrabold tracking-tight text-white">
              {t('member.shop.title')}
            </Text>
          </View>
          <CartButton count={count} label={t('member.shop.cart')} />
        </View>

        {/* ---- search field ---- */}
        <View className="px-5 pb-3">
          <View className="h-11 flex-row items-center gap-2 rounded-btn border border-white/10 bg-white/5 px-3.5">
            <Text className="text-sm text-ink-500">🔍</Text>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t('member.shop.searchPlaceholder')}
              placeholderTextColor="#5B6072"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              className="h-full flex-1 text-[15px] text-white"
              accessibilityLabel={t('member.shop.search')}
            />
            {hasSearch ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('member.shop.clear')}
                onPress={() => setSearch('')}
                hitSlop={8}
              >
                <Text className="text-sm text-ink-400">✕</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* ---- member perk banner ---- */}
        <View className="px-5 pb-3">
          <View className="flex-row items-center gap-2.5 rounded-card border border-brand-400/25 bg-brand-500/10 px-3.5 py-2.5">
            <Text className="text-base">🏷️</Text>
            <Text className="flex-1 text-xs text-ink-200">{t('member.shop.perk')}</Text>
          </View>
        </View>
      </View>

      {/* ---- catalogue grid ---- */}
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 4,
          paddingBottom: insets.bottom + (count > 0 ? 108 : 32),
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void products.refetch()}
            tintColor="#5B6072"
          />
        }
      >
        {products.isLoading ? (
          <View className="items-center gap-3 py-16">
            <ActivityIndicator color="#9184F1" />
            <Text className="text-sm text-ink-400">{t('member.shop.loading')}</Text>
          </View>
        ) : products.isError ? (
          <View className="items-center gap-3 py-16">
            <Text className="text-center text-sm text-ink-400">{t('member.shop.error')}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void products.refetch()}
              className="rounded-btn border border-white/15 bg-white/5 px-4 py-2 active:bg-white/10"
            >
              <Text className="text-sm font-semibold text-white">{t('member.shop.retry')}</Text>
            </Pressable>
          </View>
        ) : filtered.length > 0 ? (
          <View className="flex-row flex-wrap" style={{ marginHorizontal: -6 }}>
            {filtered.map((product) => (
              <View key={product.id} className="w-1/2" style={{ padding: 6 }}>
                <ProductCard
                  product={product}
                  locale={locale}
                  addLabel={t('member.shop.add')}
                  fromLabel={fromLabel}
                  soldOutLabel={t('member.shop.soldOut')}
                  onPress={(id) => router.push(`/shop/product/${id}`)}
                  onAdd={onQuickAdd}
                />
              </View>
            ))}
          </View>
        ) : hasSearch ? (
          <View className="items-center gap-2 py-16">
            <Text className="text-3xl">🔍</Text>
            <Text className="text-base font-semibold text-white">
              {t('member.shop.noMatch.title')}
            </Text>
            <Text className="text-center text-xs text-ink-500">
              {t('member.shop.noMatch.subtitle')}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setSearch('')}
              className="mt-1 rounded-btn border border-white/15 bg-white/5 px-4 py-2 active:bg-white/10"
            >
              <Text className="text-sm font-semibold text-white">
                {t('member.shop.noMatch.action')}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View className="items-center gap-2 py-16">
            <Text className="text-3xl">🛍️</Text>
            <Text className="text-base font-semibold text-white">
              {t('member.shop.empty.title')}
            </Text>
            <Text className="text-center text-xs text-ink-500">
              {t('member.shop.empty.subtitle')}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* ---- sticky mini cart ---- */}
      {count > 0 ? (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: 16 }}
          className="px-5"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('member.shop.miniCart.viewCart')}
            onPress={() => router.push('/shop/cart')}
            className="flex-row items-center gap-3 rounded-card border border-white/10 bg-ink-900/95 p-2 pl-3.5 active:bg-ink-900"
          >
            <View className="h-9 w-9 items-center justify-center rounded-btn bg-brand-500/15">
              <Text className="text-base">🛒</Text>
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-white">
                {t('member.shop.miniCart.items', { count })}
              </Text>
              {currency ? (
                <Text
                  className="font-mono text-[11px] text-ink-400"
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  {formatMoney(subtotal, currency, locale)}
                </Text>
              ) : null}
            </View>
            <View className="h-10 flex-row items-center gap-1.5 rounded-btn bg-brand-600 px-4">
              <Text className="text-sm font-bold text-white">
                {t('member.shop.miniCart.viewCart')}
              </Text>
              <Text className="text-sm font-bold text-white">›</Text>
            </View>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/** Header cart shortcut — a frosted glass button with a live item-count badge. */
function CartButton({ count, label }: { count: number; label: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => router.push('/shop/cart')}
      hitSlop={8}
      className="h-11 w-11 items-center justify-center rounded-btn border border-white/10 bg-white/5 active:bg-white/10"
    >
      <Text className="text-lg">🛒</Text>
      {count > 0 ? (
        <View className="absolute -right-1 -top-1 h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-ink-950 bg-brand-500 px-1">
          <Text className="text-[10px] font-bold text-white">{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
