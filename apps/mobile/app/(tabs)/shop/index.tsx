import { useMemo } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useI18n, useTheme } from '../../../providers';
import { useCart } from '../../../providers/CartProvider';
import { useActiveGymId } from '../../../hooks/useActiveGym';
import { useProducts } from '../../../hooks/useProducts';
import { ProductCard } from '../../../components/shop/ProductCard';

/**
 * Shop tab — browse the gym's products (T6.7). One `GET /products` query loads
 * the catalogue (keyed on the gym scope via TanStack Query). A header cart pill
 * shows the live item count and opens the cart; tapping a product opens its
 * detail where a variant is chosen and the item is added. The list degrades on
 * its own: a spinner while it loads, a retryable error, and an empty state.
 * Pull-to-refresh revalidates. Colours come from `useTheme()`, so the screen
 * tracks system dark mode like the rest of the app.
 */
export default function ShopScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const gymId = useActiveGymId();
  const { count } = useCart();
  const products = useProducts(gymId);

  const productList = useMemo(() => products.data ?? [], [products.data]);
  const refreshing = products.isFetching && !products.isLoading;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 20, gap: 20 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void products.refetch()}
          tintColor={colors.textMuted}
        />
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text }}>
            {t('shop.title')}
          </Text>
          <Text style={{ fontSize: 14, color: colors.textMuted }}>{t('shop.subtitle')}</Text>
        </View>
        <CartPill count={count} colors={colors} label={t('shop.cart.open')} />
      </View>

      {products.isLoading ? (
        <Loading label={t('shop.browse.loading')} colors={colors} />
      ) : products.isError ? (
        <ErrorState
          message={t('shop.browse.error')}
          retryLabel={t('shop.retry')}
          onRetry={() => void products.refetch()}
          colors={colors}
        />
      ) : productList.length === 0 ? (
        <Empty
          title={t('shop.browse.empty.title')}
          subtitle={t('shop.browse.empty.subtitle')}
          colors={colors}
        />
      ) : (
        <View style={{ gap: 12 }}>
          {productList.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onPress={(id) => router.push(`/shop/product/${id}`)}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

interface Colors {
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  onPrimary: string;
}

/** Header cart shortcut with a live item-count badge. */
function CartPill({ count, colors, label }: { count: number; colors: Colors; label: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => router.push('/shop/cart')}
      hitSlop={8}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: 14,
        paddingVertical: 8,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text style={{ fontSize: 16 }}>🛒</Text>
      {count > 0 ? (
        <View
          style={{
            minWidth: 20,
            paddingHorizontal: 6,
            paddingVertical: 1,
            borderRadius: 999,
            backgroundColor: colors.primary,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.onPrimary }}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** A centered spinner + label. */
function Loading({ label, colors }: { label: string; colors: Colors }) {
  return (
    <View style={{ paddingVertical: 56, alignItems: 'center', gap: 12 }}>
      <ActivityIndicator color={colors.primary} />
      <Text style={{ fontSize: 14, color: colors.textMuted }}>{label}</Text>
    </View>
  );
}

/** A retryable error state. */
function ErrorState({
  message,
  retryLabel,
  onRetry,
  colors,
}: {
  message: string;
  retryLabel: string;
  onRetry: () => void;
  colors: Colors;
}) {
  return (
    <View style={{ paddingVertical: 48, alignItems: 'center', gap: 12 }}>
      <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center' }}>{message}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 10,
          paddingHorizontal: 16,
          paddingVertical: 8,
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{retryLabel}</Text>
      </Pressable>
    </View>
  );
}

/** An empty catalogue state. */
function Empty({ title, subtitle, colors }: { title: string; subtitle: string; colors: Colors }) {
  return (
    <View style={{ paddingVertical: 48, alignItems: 'center', gap: 8 }}>
      <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{title}</Text>
      <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center', maxWidth: 320 }}>
        {subtitle}
      </Text>
    </View>
  );
}
