// Shop — the retail catalogue.
//
// ===========================================================================
// COPY: `member.shop`, NEVER the top-level `shop` (D10).
//
// The member set is a strict superset of web's: the same `detail` (8), `cart`
// (11) and `checkout` (4) blocks, a richer `order` (11 vs 9), PLUS the
// mobile-only `search`, `searchPlaceholder`, `clear`, `perk`, `add`,
// `soldOut`, `from`, `miniCart`, `noMatch`, `loading` and `eyebrow` — which is
// to say, this screen. Choosing per-string is how two families drift, so the
// choice is made once per screen and written down here.
//
// The two exceptions, both deliberate and both because `member.shop` is silent
// where `member.cart` is not: `member.cart.signInToAdd` (D9's own copy, named
// in the plan) and `member.cart.adding` / `member.cart.errAdd`.
// ===========================================================================
//
// THE PURCHASE PATH IS `POST /cart/checkout` → `GET /checkout/:orderId`.
// NOT `POST /orders` (does not exist) and NOT `GET /orders/:id` (`BillingRead`,
// which MEMBER does not hold). That pair is why the app was deleted; see
// `lib/api/checkout.ts` and `scripts/check-mobile-endpoints.ts`.
//
// ---------------------------------------------------------------------------
// THE SHOP BROWSES SIGNED OUT. THE CART STILL DOES NOT. THAT IS D9, EXACTLY.
//
// `ROUTE_POLICY['(tabs)/shop']` is `'public'`, so a signed-out visitor reaches
// this screen, and `GET /products` takes an explicit `gymId` query param
// precisely so one can read it. This screen used to gate the LISTING behind
// sign-in as well — not as a product decision, but because the only sanctioned
// source of a `gymId` was `useGymId()`, the access-token claim, which is `null`
// signed out. `hooks/useDiscoveryGym.ts` is now the sanctioned source for a
// public screen (the token claim when there is one, the slug-resolved tenant
// otherwise), so the reason is gone and the gate goes with it.
//
// The line D9 actually draws is between BROWSING and WRITING, and it stays
// where it was: `useSignInGate` still prompts on add-to-cart, because this
// platform's cart is Bearer-scoped only — RN has no cookie jar, D3 sends
// `credentials: 'omit'`, and a signed-out `POST /cart/items` would land in a
// cart nobody can ever read back. So: read the catalogue with the discovery
// gym, read the CART with the SESSION's gym (`useCartOrEmpty`, disabled
// without a token), and gate the writes.
//
// This also settles an inconsistency worth naming: `/classes`, `/trainers` and
// `/services` all serve signed-out discovery. A shop that alone demanded a
// login was the odd one out, and the API permitted it all along.
//
// ---------------------------------------------------------------------------
// TWO TABS: WHAT IS FOR SALE, AND WHAT THIS MEMBER ALREADY BOUGHT.
//
// The same move `/classes` made for "my bookings", for the same reason: "what
// can I buy?" and "where is my order?" are asked one after the other, and the
// second question had no screen at all until `GET /me/orders` existed. So it is
// a `Segmented` under the AppBar and `components/shop/orders-view.tsx` below
// it, rather than a third route nobody would find.
//
// Two consequences, both of which were bugs first:
//
//   · THE MINI CART BELONGS TO THE PRODUCTS TAB. Left in the footer on the
//     orders tab it is a "view cart" button under a list of things already
//     bought — and it moves the member away from the tab they just chose.
//   · The two tabs disagree about the tenant, and must. The catalogue reads
//     the DISCOVERY gym (signed out included); the history reads the SESSION's,
//     because `GET /me/orders` resolves the member from the token and has no
//     `gymId` on the wire. Signed out, the left tab lists and the right one
//     prompts to sign in.
//
// The `key={tab}` remount `/classes` needs is deliberately NOT copied here: the
// products tab holds the search box's text, and a member who checks an order and
// comes back to a cleared search has lost work.

import {
  Alert,
  AppBar,
  Button,
  Eyebrow,
  EmptyState,
  IconButton,
  InlineNote,
  Money,
  Screen,
  Segmented,
  TextField,
  spacing,
  useToast,
} from '@fit/ui-mobile';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';

import { OfflineNotice } from '../../../components/auth/notices';
import { useIsOnline } from '../../../components/auth/use-online';
import { CatalogueRow } from '../../../components/shop/catalogue-row';
import {
  cartCount,
  listCurrency,
  matchesQuery,
  qtyOf,
  singleVariantRef,
} from '../../../components/shop/catalogue';
import { useMoney } from '../../../components/shop/money';
import { OrdersView } from '../../../components/shop/orders-view';
import { useSignInGate } from '../../../components/shop/sign-in-gate';
import { SHOP_PENDING_COPY } from '../../../components/shop/pending-copy';
import { LoadFailed, RowSkeletons, useRetry } from '../../../components/shop/states';
import {
  useAddCartItem,
  useRemoveCartItem,
  useUpdateCartItem,
} from '../../../hooks/mutations/useCartMutations';
import { useCartOrEmpty } from '../../../hooks/queries/useCart';
import { useProducts } from '../../../hooks/queries/useShop';
import { useDiscoveryGym } from '../../../hooks/useDiscoveryGym';
import { queryKeys } from '../../../lib/query-keys';
import { useI18n } from '../../../providers/I18nProvider';

/** Where a sign-in from this screen returns to. */
const SHOP_PATH = '/shop';

/** Which half of the screen is on: the catalogue, or the member's own orders. */
type ShopTab = 'products' | 'orders';

export default function ShopScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const money = useMoney();
  const online = useIsOnline();
  const gate = useSignInGate();
  // The DISCOVERY gym: the token's claim when there is one, the slug-resolved
  // tenant otherwise. `GET /products` takes it as a query param.
  const gym = useDiscoveryGym();
  const gymId = gym.gymId;

  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<ShopTab>('products');

  // `useProducts(gymId)` — the EXPLICIT form. The bare `useProducts()` scopes
  // itself by the session, which is right on `auth` routes and wrong here.
  const products = useProducts(gymId);
  const currency = listCurrency(products.data?.products);
  // `useCartOrEmpty` stays SESSION-scoped, and must: the cart is Bearer-scoped
  // on this platform, so signed out it is disabled and reads as empty.
  const { cart, query: cartQuery } = useCartOrEmpty(currency);
  const retryProducts = useRetry(gymId === null ? null : queryKeys.products(gymId));
  const retry = useCallback(() => {
    // Both halves of what can have failed: the tenant lookup and the listing.
    gym.retry();
    retryProducts();
  }, [gym, retryProducts]);

  const addItem = useAddCartItem();
  const updateItem = useUpdateCartItem();
  const removeItem = useRemoveCartItem();

  const all = products.data?.products;
  const shown = useMemo(
    () => (all ?? []).filter((product) => matchesQuery(product, query)),
    [all, query],
  );

  const count = cartCount(cart);

  const header = (
    <AppBar
      eyebrow={t('member.shop.eyebrow')}
      // The screen's first `role="header"`.
      title={t('member.shop.title')}
      trailing={
        <IconButton
          icon="bag"
          accessibilityLabel={t('member.shop.cart.open')}
          onPress={() => {
            router.push('/shop/cart');
          }}
          badge={count > 0 ? { count } : undefined}
          testID="shop-cart-button"
        />
      }
    />
  );

  function openProduct(id: string): void {
    router.push(`/shop/product/${id}`);
  }

  /** The SAME screen the confirmation after checkout uses. One order detail. */
  function openOrder(orderId: string): void {
    router.push(`/shop/order/${orderId}`);
  }

  function add(ref: string): void {
    if (gate.prompt(SHOP_PATH)) return;
    addItem.mutate(
      { variantId: ref, qty: 1 },
      {
        onSuccess: () => {
          toast.success(t('member.shop.detail.added'));
        },
        onError: () => {
          toast.error(t('member.cart.errAdd'));
        },
      },
    );
  }

  function setQty(ref: string, next: number): void {
    if (gate.prompt(SHOP_PATH)) return;
    // Removal is a DELETE. `updateCartItemSchema` requires `qty >= 1`, so a
    // `qty: 0` PATCH is a 400 the member's own gesture would have caused.
    const outcome =
      next <= 0
        ? removeItem.mutateAsync({ variantId: ref })
        : updateItem.mutateAsync({ variantId: ref, qty: next });
    outcome.catch(() => {
      toast.error(t('member.cart.errUpdate'));
    });
  }

  return (
    <Screen
      testID="shop-screen"
      header={header}
      footer={
        // The mini cart belongs to the CATALOGUE. Under a list of orders
        // already placed it is a button pulling the member off the tab they
        // just chose, to a cart that has nothing to do with what they are
        // reading.
        count > 0 && tab === 'products' ? (
          <Button
            label={t('member.shop.miniCart.viewCart')}
            accessibilityHint={t('member.shop.miniCart.items', { count })}
            variant="primary"
            size="lg"
            fullWidth
            onPress={() => {
              router.push('/shop/cart');
            }}
            testID="shop-mini-cart"
          >
            {/*
              Hidden from the reader, not from the eye: the button already
              announces "View cart" and then the count as its hint, and letting
              these two announce as well would give a screen-reader user four
              stops on one control.
            */}
            <View
              accessible={false}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], flex: 1 }}
            >
              <View style={{ flex: 1 }}>
                <Eyebrow size="micro" color="onAccent">
                  {t('member.shop.cart.summary.total')}
                </Eyebrow>
                <Money
                  variant="monoLarge"
                  color="onAccent"
                  accessibilityLabel={money.spoken(cart.total, cart.currency)}
                >
                  {money.format(cart.total, cart.currency)}
                </Money>
              </View>
              <Eyebrow size="label" color="onAccent">
                {t('member.shop.miniCart.items', { count })}
              </Eyebrow>
            </View>
          </Button>
        ) : undefined
      }
    >
      <View style={{ gap: spacing[4] }}>
        {/* Plan §6 item 4. TODO(i18n): there are no `offline` keys in either
            catalogue — see `components/auth/pending-copy.ts`. */}
        {online ? null : <OfflineNotice testID="shop-offline" />}

        <Segmented
          testID="shop-tabs"
          label={t('member.shop.tabs.label')}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'products', label: t('member.shop.tabs.products') },
            { value: 'orders', label: t('member.shop.tabs.orders') },
          ]}
        />

        {tab === 'orders' ? (
          <OrdersView
            signInNext={SHOP_PATH}
            onOpenOrder={openOrder}
            onBrowseProducts={() => {
              // The catalogue is the tab BESIDE this one. `router.push('/shop')`
              // would push the route the member is already standing on.
              setTab('products');
            }}
          />
        ) : (
          <>
            {/*
          THE CART FAILED TO LOAD, WHICH IS NOT AN EMPTY CART.
          `useCartOrEmpty` hands back an empty cart on the first frame so the
          badge can render at all — but with `GET /cart` failed that empty value
          is a lie: the bag badge disappears and every row's stepper reverts to
          "+", so pressing it POSTs a SECOND line for something already in the
          cart. The listing is still perfectly usable, so this is a note beside
          it rather than a box replacing it.
          TODO(i18n) `member.shop.cart.loadError` — see `components/shop/pending-copy.ts`.
        */}
            {cartQuery.isError ? (
              <InlineNote testID="shop-cart-error" icon="info">
                {SHOP_PENDING_COPY.cartLoadError}
              </InlineNote>
            ) : null}

            {/*
          NO TENANT. Not "signed out" any more — a visitor with no session still
          gets a gym out of `useDiscoveryGym()`. Reaching here means the tenant
          itself could not be resolved: the build carries no `gymSlug` and no
          session named one, or `GET /gyms/by-subdomain/:slug` failed. That is a
          FAILED LOAD with a working retry (§6 item 3), not a sign-in prompt —
          signing in would not fix it, and offering to would be a dead button.
          `member.shop.error` / `.retry` are the sentences for exactly this, so
          no copy is owed.
        */}
            {gym.isPending ? (
              <RowSkeletons label={t('member.shop.loading')} testID="shop-loading" />
            ) : gymId === null ? (
              <LoadFailed
                testID="shop-no-gym"
                title={t('member.shop.error')}
                retryLabel={t('member.shop.retry')}
                onRetry={retry}
              />
            ) : (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] }}>
                  <TextField
                    label={t('member.shop.search')}
                    labelHidden
                    startIcon="search"
                    placeholder={t('member.shop.searchPlaceholder')}
                    value={query}
                    onChangeText={setQuery}
                    autoCorrect={false}
                    returnKeyType="search"
                    testID="shop-search"
                    style={{ flex: 1 }}
                  />
                  {query === '' ? null : (
                    <IconButton
                      icon="x"
                      accessibilityLabel={t('member.shop.clear')}
                      onPress={() => {
                        setQuery('');
                      }}
                      testID="shop-search-clear"
                    />
                  )}
                </View>

                {/* The member perk. A standing advisory, so no `live`. */}
                <Alert
                  tone="success"
                  icon="bolt"
                  title={t('member.shop.perk')}
                  testID="shop-perk"
                />

                {products.isPending ? (
                  <RowSkeletons label={t('member.shop.loading')} testID="shop-loading" />
                ) : products.isError ? (
                  <LoadFailed
                    testID="shop-error"
                    title={t('member.shop.error')}
                    retryLabel={t('member.shop.retry')}
                    onRetry={retry}
                  />
                ) : (all ?? []).length === 0 ? (
                  <EmptyState
                    testID="shop-empty"
                    icon="bag"
                    title={t('member.shop.empty.title')}
                    body={t('member.shop.empty.subtitle')}
                  />
                ) : shown.length === 0 ? (
                  <EmptyState
                    testID="shop-no-match"
                    icon="search"
                    title={t('member.shop.noMatch.title')}
                    body={t('member.shop.noMatch.subtitle')}
                    action={{
                      label: t('member.shop.noMatch.action'),
                      onPress: () => {
                        setQuery('');
                      },
                      testID: 'shop-no-match-clear',
                    }}
                  />
                ) : (
                  <View style={{ gap: spacing[3] }}>
                    {shown.map((product) => {
                      const ref = singleVariantRef(product);
                      return (
                        <CatalogueRow
                          key={product.id}
                          product={product}
                          qty={qtyOf(cart, ref)}
                          adding={addItem.isPending && addItem.variables?.variantId === ref}
                          onOpen={() => {
                            openProduct(product.id);
                          }}
                          onAdd={() => {
                            if (ref !== null) add(ref);
                          }}
                          onQty={(next) => {
                            if (ref !== null) setQty(ref, next);
                          }}
                          testID={`shop-product-${product.id}`}
                        />
                      );
                    })}
                  </View>
                )}
              </>
            )}
          </>
        )}
      </View>
    </Screen>
  );
}
