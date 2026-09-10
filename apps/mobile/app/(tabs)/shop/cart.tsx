// Cart — the server-side cart, and the one screen in this app that takes money.
//
// ===========================================================================
// D3: THERE IS NO CART STATE HERE. `useCart()` IS A QUERY, AND THAT IS ALL.
//
// No context, no reducer, no local array. Every `/cart/*` mutation answers with
// the WHOLE, authoritative, freshly re-priced cart, so `onSuccess` is a
// `setQueryData` and one round trip does the work of two. That is the reason
// the server cart replaced the deleted app's in-memory provider, and it is why
// this screen contains no arithmetic on money beyond formatting.
// ===========================================================================
//
// ---------------------------------------------------------------------------
// `discount` IS ALWAYS 0 IN THE CART, AND SAYING SO IS NOT OPTIONAL.
//
// `packages/types/src/cart.ts`: `discount` is "always `0` until a code is
// applied at checkout — the cart stores none". The promo code travels in the
// `POST /cart/checkout` BODY, not in cart state. So this screen must not show a
// discounted total; if it did, the number would change under the member at the
// last step, on the screen where the number is the entire point. It says the
// discount is applied at checkout instead.
//
// TODO(i18n) — that sentence has no key. See `components/shop/pending-copy.ts`.
//
// ---------------------------------------------------------------------------
// THE TWO CHECKOUT FAILURES THAT ARE NOT ERRORS.
//
// `POST /cart/checkout` hand-sets 409 and 422 with `res.status(...)` and a
// normal return, precisely so the global exception filter never flattens
// `newPrices` / `removedItems` away. `checkoutCart` therefore RESOLVES with a
// discriminated outcome rather than throwing, and this screen branches on
// `outcome.ok`:
//
//   409 PRICE_CHANGED  the server has ALREADY re-priced the cart, so an
//                      identical retry succeeds. Which is exactly why it must
//                      never be automatic — that charges a price the member did
//                      not see. The deltas go in a sheet and the second press
//                      comes from a finger.
//   422 OUT_OF_STOCK   the server has ALREADY removed those lines. Nothing is
//                      retried: the total just fell, and the member has to
//                      agree to the new one.
//
// Both invalidate the cart inside the mutation's own `onSuccess`
// (`hooks/mutations/invalidation.ts`), so by the time either branch renders the
// cache is being reconciled with the server. That is why the price sheet reads
// its OLD prices from a snapshot taken before the press.
//
// ---------------------------------------------------------------------------
// PICKUP ONLY. `cartCheckoutSchema` accepts `PICKUP` (needs `locationId`) or
// `DELIVERY` (needs `deliveryAddress`), and every string in `member.shop.cart`
// is a pickup string — "Front-desk pickup", "Collect your order at the gym's
// front desk", "Ready in ~2 hours". There is no delivery-address copy in either
// catalogue, so delivery is not offered rather than offered in English.
//
// ---------------------------------------------------------------------------
// WHICH FRONT DESK. `locationId` IS THE ORDER'S BRANCH, NOT A COSMETIC LABEL.
//
// The branch on this body is the only thing that attributes the order to a
// site: per-branch revenue, and (since the per-branch inventory work) which
// shelf the sale draws down. An order placed without one is invisible to every
// per-branch figure and silently drags that branch's takings down, so this
// screen refuses to check out rather than guess — see `resolveBranch`.
//
// There is no home branch to fall back on. The access token carries `sub`,
// `gymId`, `role`, `tokenVersion`, `exp`, `iat` and nothing else
// (`lib/auth/claims.ts`), and `GET /me/profile` is `{userId, name, email,
// phone}` — `GymMember.locationId` exists but is staff-facing and never
// reaches the phone. The gym's own list of branches is the only authority the
// app has, which is why this is a control and not a default.

import {
  Alert,
  AppBar,
  Button,
  Chip,
  Divider,
  EmptyState,
  Eyebrow,
  IconButton,
  InlineNote,
  Money,
  Screen,
  SectionHeader,
  Surface,
  Text,
  TextField,
  spacing,
  useToast,
} from '@fit/ui-mobile';
import type { CartPriceChange, CartView } from '@fit/types';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { OfflineNotice } from '../../../components/auth/notices';
import { useIsOnline } from '../../../components/auth/use-online';
import { CartLine } from '../../../components/shop/cart-line';
import { cartCount } from '../../../components/shop/catalogue';
import { FALLBACK_CURRENCY, useMoney } from '../../../components/shop/money';
import { SHOP_PENDING_COPY } from '../../../components/shop/pending-copy';
import { PriceChangedSheet } from '../../../components/shop/price-changed-sheet';
import { useSignInGate } from '../../../components/shop/sign-in-gate';
import { LoadFailed, RowSkeletons, useRetry } from '../../../components/shop/states';
import { useRemoveCartItem, useUpdateCartItem } from '../../../hooks/mutations/useCartMutations';
import { useCheckoutCart } from '../../../hooks/mutations/useCheckoutMutations';
import { useCart } from '../../../hooks/queries/useCart';
import { useLocations } from '../../../hooks/queries/useShop';
import { useGymId } from '../../../hooks/useActiveGym';
import { useSession } from '../../../hooks/useSession';
import { queryKeys } from '../../../lib/query-keys';
import { useI18n } from '../../../providers/I18nProvider';

/** Where a sign-in from this screen returns to. */
const CART_PATH = '/shop/cart';

/**
 * The branch this order will be attributed to — DERIVED from the live list, not
 * remembered.
 *
 * Two rules, and the order between them matters:
 *
 *   1. **A choice only counts while the branch is still on offer.** `chosen` is
 *      whatever the member last tapped, and the list underneath it is a query
 *      that refetches — a branch deactivated between the tap and the press
 *      vanishes from `branches` while the id lives on in state. Held as plain
 *      state, that id stays "selected" with no chip drawn for it and the CTA
 *      still live, and the press posts a branch the gym no longer has. Checking
 *      membership on every render makes that unrepresentable.
 *   2. **One branch is not a choice.** A gym with a single front desk must not
 *      gain a tap to confirm the only answer, so the lone branch resolves
 *      itself. It is still rendered, and rendered as selected, so the member is
 *      told which desk rather than merely charged.
 *
 * `null` — none chosen, none derivable — is a REFUSAL, and the only correct one
 * available: with no home branch anywhere on the member-facing side, picking
 * `branches[0]` would be inventing an answer that reads as a real one for ever
 * after, in a figure nobody goes back and checks.
 */
export function resolveBranch(
  branches: readonly { readonly id: string }[] | undefined,
  chosen: string | null,
): string | null {
  if (branches === undefined) return null;
  if (chosen !== null && branches.some((branch) => branch.id === chosen)) return chosen;
  return branches.length === 1 ? (branches[0]?.id ?? null) : null;
}

/** One row of the totals block. Not a component in the package: it is three
 *  strings and a hairline, and every one of them is this screen's copy. */
function SummaryRow({
  label,
  value,
  valueLabel,
  emphasis = false,
  testID,
}: {
  label: string;
  value: string;
  valueLabel: string;
  emphasis?: boolean;
  testID: string;
}) {
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`${label}, ${valueLabel}`}
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: spacing[3],
      }}
    >
      <Text
        variant={emphasis ? 'subheading' : 'bodySmall'}
        color={emphasis ? 'textPrimary' : 'textSecondary'}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        {label}
      </Text>
      <Money
        variant={emphasis ? 'monoLarge' : 'monoSmall'}
        color={emphasis ? 'textPrimary' : 'textSecondary'}
        accessibilityLabel={valueLabel}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        {value}
      </Money>
    </View>
  );
}

/**
 * `422 OUT_OF_STOCK` — the lines the server dropped, named.
 *
 * The names come from the pre-checkout snapshot: `removedItems` carries variant
 * REFERENCES (`"<productId>:<index>"`), and the lines they refer to are already
 * gone from the cart by the time this renders. Falling back to the reference is
 * deliberate — an opaque id is ugly, but silently dropping a line the member
 * paid attention to is worse.
 */
function OutOfStockAlert({
  removed,
  snapshot,
}: {
  removed: readonly string[];
  snapshot: CartView | null;
}) {
  const { t } = useI18n();
  const names = removed.map(
    (ref) => snapshot?.items.find((item) => item.variantId === ref)?.productName ?? ref,
  );
  return (
    <Alert
      testID="cart-out-of-stock"
      tone="warning"
      live
      title={t('member.cart.outOfStock')}
      // TODO(i18n) `member.shop.cart.outOfStockBody`.
      body={`${SHOP_PENDING_COPY.outOfStockBody} ${names.join(', ')}`}
    />
  );
}

export default function CartScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const money = useMoney();
  const online = useIsOnline();
  const gate = useSignInGate();
  const session = useSession();
  const gymId = useGymId();
  const queryClient = useQueryClient();

  const cartQuery = useCart(FALLBACK_CURRENCY);
  const locations = useLocations();
  const retryCart = useRetry(gymId === null ? null : queryKeys.cart(gymId));
  const retryLocations = useRetry(gymId === null ? null : queryKeys.locations(gymId));

  const updateItem = useUpdateCartItem();
  const removeItem = useRemoveCartItem();
  const checkout = useCheckoutCart();

  /** The branch the member last tapped. Read through {@link resolveBranch}. */
  const [chosenBranch, setChosenBranch] = useState<string | null>(null);
  const [promo, setPromo] = useState('');
  const [priceChanges, setPriceChanges] = useState<readonly CartPriceChange[] | null>(null);
  const [removedItems, setRemovedItems] = useState<readonly string[] | null>(null);
  const [failed, setFailed] = useState(false);

  /**
   * The cart as it was the instant checkout was pressed.
   *
   * The 409 branch needs the OLD unit prices and the 422 branch needs the names
   * of lines the server has already deleted — and both mutations invalidate the
   * cart on their way out, so neither is still in the cache when the branch
   * renders.
   */
  const snapshot = useRef<CartView | null>(null);

  const cart = cartQuery.data;
  const branches = locations.data?.locations;
  const locationId = resolveBranch(branches, chosenBranch);

  /**
   * The gym has branches, and none of them is selected — the one reason the CTA
   * is dead that the member can do something about.
   *
   * A disabled button that explains nothing is the same failure as a wrong
   * branch, one step earlier: the member presses, nothing happens, and no
   * sentence anywhere says a pickup point is still owed. Loading and error are
   * excluded (the section under the header is already saying so), and so is a
   * gym with no branches at all — "choose one" is not an instruction anybody
   * can follow when there are none.
   */
  const branchOwed = branches !== undefined && branches.length > 0 && locationId === null;

  function setQty(variantId: string, next: number): void {
    if (gate.prompt(CART_PATH)) return;
    const outcome =
      next <= 0
        ? removeItem.mutateAsync({ variantId })
        : updateItem.mutateAsync({ variantId, qty: next });
    outcome.catch(() => {
      toast.error(t('member.cart.errUpdate'));
    });
  }

  function placeOrder(): void {
    if (gate.prompt(CART_PATH)) return;
    if (cart === undefined || locationId === null) return;

    snapshot.current = cart;
    setFailed(false);
    setRemovedItems(null);

    const code = promo.trim();
    checkout.mutate(
      {
        fulfillment: 'PICKUP',
        locationId,
        promoCode: code === '' ? undefined : code,
      },
      {
        onSuccess: (outcome) => {
          if (outcome.ok) {
            setPriceChanges(null);
            // The server emptied the cart. The mutation already invalidated it
            // (`invalidateFor(…, 'checkoutCart')`), but the shop tab's badge is
            // still mounted behind this screen and would show the old count for
            // the length of that refetch.
            if (gymId !== null) {
              queryClient.setQueryData<CartView>(queryKeys.cart(gymId), {
                items: [],
                subtotal: 0,
                discount: 0,
                total: 0,
                currency: cart.currency,
              });
            }
            // `replace`, not `push`: the cart the member just emptied is not a
            // screen to go back to.
            //
            // `placed=1` is what makes that screen say "Order placed" — it is
            // shared with the orders tab and with `fit://orders/:id`, where the
            // same announcement would be a week-old event restated as news.
            router.replace(`/shop/order/${outcome.orderId}?placed=1`);
            return;
          }
          if (outcome.reason === 'PRICE_CHANGED') {
            setPriceChanges(outcome.newPrices);
            return;
          }
          setPriceChanges(null);
          setRemovedItems(outcome.removedItems);
        },
        onError: () => {
          setFailed(true);
        },
      },
    );
  }

  const header = (
    <AppBar
      align="center"
      leading={
        <IconButton
          icon="arrowLeft"
          accessibilityLabel={t('member.shop.cart.back')}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/shop');
          }}
          testID="cart-back"
        />
      }
      // The screen's first `role="header"`.
      title={t('member.shop.cart.title')}
    />
  );

  // ── Branches that replace the whole body ─────────────────────────────────

  if (gymId === null) {
    return (
      <Screen testID="cart-screen" header={header}>
        <EmptyState
          testID="cart-signed-out"
          icon="lock"
          title={
            session.status === 'signed-in'
              ? t('member.shop.cart.empty.title')
              : t('member.cart.signInToAdd')
          }
          body={session.status === 'signed-in' ? t('member.shop.cart.empty.subtitle') : undefined}
          action={{
            label:
              session.status === 'signed-in'
                ? t('member.shop.cart.empty.action')
                : t('common.cta.signIn'),
            onPress: () => {
              if (session.status === 'signed-in') router.replace('/shop');
              else gate.prompt(CART_PATH);
            },
            // `SignInGate.ready`: for the frame before the keychain read lands,
            // `prompt()` swallows the press on purpose rather than bouncing a
            // returning member to /login. Silent, that is a dead button — so it
            // reads as busy, which swallows the press and says why.
            busy: !gate.ready,
            testID: 'cart-signed-out-action',
          }}
        />
      </Screen>
    );
  }

  // =========================================================================
  // OFFLINE IS CHECKED BEFORE `isPending`, BECAUSE `isPending` NEVER CLEARS.
  //
  // `onlineManager` PAUSES a query rather than failing it: cold, with no radio,
  // `GET /cart` sits `isPending` forever and `isError` never becomes true. The
  // branch below would therefore skeleton for the rest of the session with no
  // explanation and no way out — and this is the screen that takes money.
  //
  // `app/(tabs)/classes/index.tsx` models the test: `fetchStatus === 'paused'`
  // with nothing cached IS the offline state. `!online` is folded in for the
  // frame before `onlineManager` has caught up with the radio.
  // =========================================================================
  if (cartQuery.isPending && (!online || cartQuery.fetchStatus === 'paused')) {
    return (
      <Screen testID="cart-screen" header={header}>
        {/* TODO(i18n): `common.offline.title` / `common.offline.body`. */}
        <OfflineNotice testID="cart-offline" />
      </Screen>
    );
  }

  if (cartQuery.isPending) {
    return (
      <Screen testID="cart-screen" header={header}>
        <RowSkeletons
          layout="line"
          count={3}
          label={t('member.shop.loading')}
          testID="cart-loading"
        />
      </Screen>
    );
  }

  if (cartQuery.isError) {
    return (
      <Screen testID="cart-screen" header={header}>
        <View style={{ gap: spacing[4] }}>
          {online ? null : <OfflineNotice testID="cart-offline" />}
          <LoadFailed
            testID="cart-error"
            title={t('member.shop.error')}
            retryLabel={t('member.shop.retry')}
            onRetry={retryCart}
          />
        </View>
      </Screen>
    );
  }

  if (cart === undefined || cart.items.length === 0) {
    return (
      <Screen testID="cart-screen" header={header}>
        <View style={{ gap: spacing[4] }}>
          {online ? null : <OfflineNotice testID="cart-offline" />}
          {removedItems === null ? null : (
            <OutOfStockAlert removed={removedItems} snapshot={snapshot.current} />
          )}
          <EmptyState
            testID="cart-empty"
            icon="bag"
            title={t('member.shop.cart.empty.title')}
            body={t('member.shop.cart.empty.subtitle')}
            action={{
              label: t('member.shop.cart.empty.action'),
              onPress: () => {
                router.replace('/shop');
              },
              testID: 'cart-browse',
            }}
          />
        </View>
      </Screen>
    );
  }

  // ── The cart proper ──────────────────────────────────────────────────────

  const count = cartCount(cart);
  const currency = cart.currency;
  const subtotal = cart.subtotal;
  /**
   * The CTA is genuinely dead — a branch is still owed, or the radio is out.
   *
   * `checkout.isPending` is deliberately NOT here. The rule is stated verbatim
   * at `app/(join)/checkout.tsx`: "`busy` is NOT `disabled`: a primary that
   * greys out the instant it is pressed reads as a rejection." `Button`'s
   * `busy` already swallows the press, so folding `isPending` in bought
   * nothing and cost the member a greyed-out control and VoiceOver saying
   * "dimmed" the moment they paid.
   */
  const canPay = locationId !== null && online;

  return (
    <Screen
      testID="cart-screen"
      header={header}
      footer={
        // OPAQUE, because `Screen`'s footer wrapper is absolutely positioned
        // over the scroll view and paints nothing of its own — see the rule on
        // `ScreenProps.footer`. A bare `View` here let the cart's own rows
        // ("1 კალათაში", "აირჩიე აღების ლოკაცია") draw straight through the
        // band, glyph on glyph, at the default scroll position.
        <Surface
          testID="cart-footer-plate"
          tone="card"
          radius="container"
          padding={4}
          style={{ gap: spacing[2] }}
        >
          {branchOwed ? (
            <InlineNote testID="cart-pickup-required" icon="info">
              {t('member.cart.pickLocation')}
            </InlineNote>
          ) : null}
          <Button
            label={t('member.shop.checkout.place')}
            busyLabel={t('member.shop.checkout.processing')}
            busy={checkout.isPending}
            disabled={!canPay}
            variant="primary"
            size="lg"
            fullWidth
            onPress={placeOrder}
            testID="cart-place-order"
          />
          <Text variant="caption" color="textSecondary" align="center">
            {t('member.shop.cart.secure')}
          </Text>
        </Surface>
      }
    >
      <View style={{ gap: spacing[6] }}>
        {online ? null : <OfflineNotice testID="cart-offline" />}

        {removedItems === null ? null : (
          <OutOfStockAlert removed={removedItems} snapshot={snapshot.current} />
        )}

        {failed ? (
          <Alert
            testID="cart-checkout-error"
            tone="danger"
            live
            title={t('member.shop.checkout.error')}
          />
        ) : null}

        <View style={{ gap: spacing[3] }}>
          {cart.items.map((item) => (
            <CartLine
              key={item.variantId}
              item={item}
              onQty={(next) => {
                setQty(item.variantId, next);
              }}
              onRemove={() => {
                setQty(item.variantId, 0);
              }}
              testID={`cart-line-${item.variantId}`}
            />
          ))}
        </View>

        {/* ── Pickup ──────────────────────────────────────────────────────── */}
        <View style={{ gap: spacing[3] }}>
          <SectionHeader
            title={t('member.shop.cart.pickup.title')}
            subtitle={t('member.shop.cart.pickup.subtitle')}
          />
          {locations.isPending ? (
            <RowSkeletons
              layout="line"
              count={1}
              label={t('member.shop.loading')}
              testID="cart-locations-loading"
            />
          ) : locations.isError ? (
            <LoadFailed
              testID="cart-locations-error"
              title={t('member.shop.error')}
              retryLabel={t('member.shop.retry')}
              onRetry={retryLocations}
            />
          ) : (branches ?? []).length === 0 ? (
            /*
              The gym has published no active branch, so there is no front desk
              to name and the order cannot be placed. Saying "choose a pickup
              location" over an empty row — which is what stood here — asks for
              something that does not exist and leaves a dead CTA unexplained.
              `checkout.locations.empty.*` is the member catalogue's own wording
              for this exact condition and is translated in both locales.
            */
            <Alert
              testID="cart-no-locations"
              tone="warning"
              title={t('checkout.locations.empty.title')}
              body={t('checkout.locations.empty.subtitle')}
            />
          ) : (
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel={t('member.cart.pickLocation')}
              style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}
            >
              {(branches ?? []).map((branch) => (
                <Chip
                  key={branch.id}
                  label={branch.name}
                  selected={branch.id === locationId}
                  onPress={() => {
                    setChosenBranch(branch.id);
                  }}
                  accessibilityHint={branch.address}
                  testID={`cart-location-${branch.id}`}
                />
              ))}
            </View>
          )}
        </View>

        {/* ── Promo ───────────────────────────────────────────────────────── */}
        <View style={{ gap: spacing[2] }}>
          <TextField
            label={t('member.cart.promo')}
            value={promo}
            onChangeText={setPromo}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={64}
            testID="cart-promo"
          />
          {/*
            TODO(i18n) `member.shop.cart.promoAtCheckout`. The sentence is not
            decoration: `CartView.discount` is always 0, so without it the total
            below silently disagrees with what the member is about to be charged.
          */}
          <InlineNote testID="cart-promo-note" icon="info">
            {SHOP_PENDING_COPY.promoAtCheckout}
          </InlineNote>
        </View>

        {/* ── Totals ──────────────────────────────────────────────────────── */}
        <View style={{ gap: spacing[3] }}>
          <SectionHeader title={t('member.cart.summary')} />
          <Surface tone="card" padding={4} style={{ gap: spacing[3] }}>
            <SummaryRow
              testID="cart-subtotal"
              label={t('member.shop.cart.summary.subtotal')}
              value={money.format(subtotal, currency)}
              valueLabel={money.spoken(subtotal, currency)}
            />
            <SummaryRow
              testID="cart-pickup"
              label={t('member.shop.cart.summary.pickup')}
              value={t('member.shop.cart.pickup.free')}
              valueLabel={t('member.shop.cart.pickup.free')}
            />
            <Divider />
            <SummaryRow
              testID="cart-total"
              emphasis
              label={t('member.shop.cart.summary.total')}
              value={money.format(subtotal, currency)}
              valueLabel={money.spoken(subtotal, currency)}
            />
            <Eyebrow size="micro" color="textSecondary">
              {t('member.shop.miniCart.items', { count })}
            </Eyebrow>
          </Surface>
          <InlineNote testID="cart-ready" icon="clock">
            {t('member.shop.cart.pickup.ready')}
          </InlineNote>
        </View>
      </View>

      <PriceChangedSheet
        open={priceChanges !== null}
        changes={priceChanges ?? []}
        snapshot={snapshot.current}
        busy={checkout.isPending}
        // `Sheet` is a native `Modal`, so the `cart-checkout-error` alert in the
        // scroll body is drawn UNDERNEATH this one. A retry that fails from
        // inside the sheet has to say so inside the sheet.
        failed={failed}
        onClose={() => {
          setPriceChanges(null);
        }}
        onConfirm={placeOrder}
      />
    </Screen>
  );
}
