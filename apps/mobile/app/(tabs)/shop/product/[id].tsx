// Product detail — the variant chooser, and the only place a 2+ variant
// product can be added to the cart.
//
// ===========================================================================
// THERE IS NO `GET /products/:id`, AND THAT IS NOT AN OVERSIGHT HERE.
//
// `apps/api/src/products/products.controller.ts` exposes ONE public read —
// `GET /products?gymId` — and `ENDPOINTS` carries exactly that entry
// (`listProducts`). So this screen reads the listing and finds its row in it,
// which is also why arriving from the shop list is instant: the query is
// already in the cache under `queryKeys.products(gymId)` and this is a second
// observer of it, not a second request.
//
// The consequence to be honest about: a COLD deep link straight to a product
// fetches the whole catalogue. That is one request either way, and inventing
// `GET /products/:id` in the client is precisely the class of defect
// `scripts/check-mobile-endpoints.ts` exists to fail — `POST /orders` was a
// route someone assumed rather than read.
// ===========================================================================
//
// COPY: `member.shop.detail` (D10). This screen has NO WEB ROUTE — the member
// portal's shop links straight into its cart — so the member set is the one to
// read, and it is where the divergence from the top-level `shop.detail` lands:
// `about` and `chooseOption` are this screen's and exist only there.

import {
  AppBar,
  Button,
  Chip,
  EmptyState,
  Eyebrow,
  Heading,
  IconButton,
  InlineNote,
  Money,
  Mono,
  Pill,
  QtyStepper,
  Screen,
  SectionHeader,
  Surface,
  Text,
  spacing,
  useToast,
} from '@fit/ui-mobile';
import { MAX_CART_LINE_QUANTITY, type ProductSummary } from '@fit/types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState, type ReactElement } from 'react';
import { View } from 'react-native';

import { OfflineNotice } from '../../../../components/auth/notices';
import { useIsOnline } from '../../../../components/auth/use-online';
import {
  cartCount,
  hasPriceRange,
  isSoldOut,
  listCurrency,
  lowestPrice,
  productInitial,
  variantRef,
} from '../../../../components/shop/catalogue';
import { useMoney } from '../../../../components/shop/money';
import { SHOP_PENDING_COPY } from '../../../../components/shop/pending-copy';
import { useSignInGate } from '../../../../components/shop/sign-in-gate';
import { LoadFailed, RowSkeletons, useRetry } from '../../../../components/shop/states';
import { useAddCartItem } from '../../../../hooks/mutations/useCartMutations';
import { useCartOrEmpty } from '../../../../hooks/queries/useCart';
import { useProducts } from '../../../../hooks/queries/useShop';
import { useDiscoveryGym } from '../../../../hooks/useDiscoveryGym';
import { queryKeys } from '../../../../lib/query-keys';
import { useI18n } from '../../../../providers/I18nProvider';

/** The monogram plate, at the size the detail hero gives it. */
const HERO_THUMB = 96;

export default function ProductScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const online = useIsOnline();
  const gate = useSignInGate();
  // Public discovery, same seam as the listing next door — see that screen's
  // header for why the shop browses signed out and only the writes are gated.
  const gym = useDiscoveryGym();
  const gymId = gym.gymId;

  const params = useLocalSearchParams<{ id?: string }>();
  const productId = typeof params.id === 'string' ? params.id : undefined;

  // The explicit form: this route is public, so the tenant is the discovery
  // gym rather than the session's.
  const products = useProducts(gymId);
  // SESSION-scoped, deliberately: this platform's cart is Bearer-only.
  const { cart, query: cartQuery } = useCartOrEmpty(listCurrency(products.data?.products));
  const retryProducts = useRetry(gymId === null ? null : queryKeys.products(gymId));
  const retry = useCallback(() => {
    gym.retry();
    retryProducts();
  }, [gym, retryProducts]);
  const addItem = useAddCartItem();

  /** The chosen variant's `ProductVariantSummary.id` — a stringified INDEX. */
  const [variantId, setVariantId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);

  const product = products.data?.products.find((row) => row.id === productId);
  const count = cartCount(cart);

  /** Where a sign-in from this screen returns to. */
  const here = productId === undefined ? '/shop' : `/shop/product/${productId}`;

  const header = (
    <AppBar
      align="center"
      leading={
        <IconButton
          icon="arrowLeft"
          accessibilityLabel={t('member.shop.detail.back')}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/shop');
          }}
          testID="product-back"
        />
      }
      // ================================================================
      // NO TITLE ONCE THE PRODUCT IS KNOWN — THE NAME IS IN THE HERO.
      //
      // `mobile-class-detail.tsx:113-128` draws the detail app bar as two
      // round controls and nothing between them; the name is the hero's
      // 34px `h1`. Carrying it here as well set the same string twice
      // within 200pt, and at 28px extrabold the app-bar copy is the one
      // that loses — "Branded Training Tee" wrapped to two lines and
      // "E2E Water Bottle…" was simply cut.
      //
      // Kept for the states where there IS no product yet: a loading or
      // failed screen with no title has nothing for the rotor to land on.
      // ================================================================
      title={product === undefined ? t('member.shop.title') : undefined}
      trailing={
        <IconButton
          icon="bag"
          accessibilityLabel={t('member.shop.cart.open')}
          onPress={() => {
            router.push('/shop/cart');
          }}
          badge={count > 0 ? { count } : undefined}
          testID="product-cart-button"
        />
      }
    />
  );

  // The tenant is still being resolved — nothing to list yet, and nothing has
  // gone wrong.
  if (gym.isPending) {
    return (
      <Screen testID="product-screen" header={header}>
        <RowSkeletons label={t('member.shop.loading')} layout="line" testID="product-loading" />
      </Screen>
    );
  }

  // NO TENANT — not "signed out". A visitor with no session still gets a gym
  // out of `useDiscoveryGym()`; reaching here means the slug lookup found none,
  // which signing in would not fix. A failed load with a working retry.
  if (gymId === null) {
    return (
      <Screen testID="product-screen" header={header}>
        <LoadFailed
          testID="product-no-gym"
          title={t('member.shop.error')}
          retryLabel={t('member.shop.retry')}
          onRetry={retry}
        />
      </Screen>
    );
  }

  // Offline BEFORE pending — a paused query is `isPending` forever, so the
  // skeleton below would never resolve and never explain itself. Same shape as
  // the cart next door, and the same test `app/(tabs)/classes/index.tsx` uses.
  if (products.isPending && (!online || products.fetchStatus === 'paused')) {
    return (
      <Screen testID="product-screen" header={header}>
        {/* TODO(i18n): `common.offline.title` / `common.offline.body`. */}
        <OfflineNotice testID="product-offline" />
      </Screen>
    );
  }

  if (products.isPending) {
    return (
      <Screen testID="product-screen" header={header}>
        <RowSkeletons count={2} label={t('member.shop.loading')} testID="product-loading" />
      </Screen>
    );
  }

  if (products.isError) {
    return (
      <Screen testID="product-screen" header={header}>
        <View style={{ gap: spacing[4] }}>
          {online ? null : <OfflineNotice testID="product-offline" />}
          <LoadFailed
            testID="product-error"
            title={t('member.shop.error')}
            retryLabel={t('member.shop.retry')}
            onRetry={retry}
          />
        </View>
      </Screen>
    );
  }

  if (product === undefined) {
    return (
      <Screen testID="product-screen" header={header}>
        <EmptyState
          testID="product-not-found"
          icon="info"
          title={t('member.shop.detail.notFound.title')}
          body={t('member.shop.detail.notFound.subtitle')}
          action={{
            label: t('member.shop.detail.back'),
            onPress: () => {
              router.replace('/shop');
            },
            testID: 'product-not-found-back',
          }}
        />
      </Screen>
    );
  }

  return (
    <ProductBody
      product={product}
      variantId={variantId}
      onVariant={setVariantId}
      qty={qty}
      onQty={setQty}
      online={online}
      cartFailed={cartQuery.isError}
      adding={addItem.isPending}
      onAdd={(ref) => {
        if (gate.prompt(here)) return;
        addItem.mutate(
          { variantId: ref, qty },
          {
            onSuccess: () => {
              toast.success(t('member.shop.detail.added'));
              setQty(1);
            },
            onError: () => {
              toast.error(t('member.cart.errAdd'));
            },
          },
        );
      }}
      header={header}
    />
  );
}

interface ProductBodyProps {
  product: ProductSummary;
  variantId: string | null;
  onVariant: (id: string) => void;
  qty: number;
  onQty: (next: number) => void;
  online: boolean;
  /** `GET /cart` failed, so the bag badge above is not to be trusted. */
  cartFailed: boolean;
  adding: boolean;
  onAdd: (ref: string) => void;
  header: ReactElement;
}

/**
 * The loaded product.
 *
 * Split out only so the branch above reads as a list of §6 states rather than
 * one function with five early returns and a 200-line tail. It holds no state
 * of its own — every value it renders is a prop.
 */
function ProductBody({
  product,
  variantId,
  onVariant,
  qty,
  onQty,
  online,
  cartFailed,
  adding,
  onAdd,
  header,
}: ProductBodyProps) {
  const { t } = useI18n();
  const money = useMoney();

  const hasVariants = product.variants.length > 0;
  const chosen = product.variants.find((variant) => variant.id === variantId);
  const soldOut = isSoldOut(product);

  // With no variants the product IS the line (`"<id>:base"`). With variants,
  // nothing can be added until one is chosen — the client cannot pick for the
  // member, and a wrong line in a cart is worse than one more tap.
  const ref = hasVariants
    ? chosen === undefined
      ? null
      : variantRef(product.id, chosen.id)
    : variantRef(product.id, null);

  const amount = chosen?.priceAmount ?? lowestPrice(product);
  const buyable = !soldOut && (chosen === undefined ? !hasVariants : chosen.available);

  /**
   * The product has options and none is picked — the one reason the CTA is dead
   * that the member can do something about.
   *
   * Exactly the shape of the cart's `branchOwed`, one screen away, and for the
   * same reason: a disabled button swallows its own press, so it can never
   * explain itself, and "nothing happened" is indistinguishable from a broken
   * app. Sold out is excluded — picking a size does not un-sell it — and so is
   * a product with no options, where there is nothing to pick.
   */
  const optionOwed = hasVariants && !soldOut && chosen === undefined;

  /**
   * The running line total the sticky bar carries on its left.
   *
   * `mobile-class-detail.tsx:239-247` is the shape: the bar is never a lone
   * button, it is a FACT and a button, and the fact is whatever the press is
   * about to commit to. Here that is price × quantity.
   *
   * "From" while no option is picked, and only when the options differ —
   * `lowestPrice` is the cheapest variant, so quoting it flat as "the total"
   * would understate a member who then picks the larger size. Same phrasing
   * (`member.shop.from`) the catalogue row uses one screen back.
   */
  const lineTotal = amount * qty;
  const quoted = chosen === undefined && hasPriceRange(product);
  const totalText = quoted
    ? t('member.shop.from', { price: money.format(lineTotal, product.currency) })
    : money.format(lineTotal, product.currency);
  const totalSpoken = quoted
    ? t('member.shop.from', { price: money.spoken(lineTotal, product.currency) })
    : money.spoken(lineTotal, product.currency);

  return (
    <Screen
      testID="product-screen"
      header={header}
      footer={
        // Opaque — `Screen`'s footer wrapper paints nothing. See the rule on
        // `ScreenProps.footer`; the cart had the visible form of this bug and
        // this screen had the same latent one.
        <Surface
          testID="product-footer-plate"
          tone="card"
          radius="container"
          padding={4}
          style={{ gap: spacing[2] }}
        >
          {optionOwed ? (
            // ITS OWN SENTENCE, not the section header again. This note read
            // `member.shop.detail.options` — the word "Options" — which is the
            // title of the group above it and, as a warning, says nothing.
            <InlineNote testID="product-option-required" icon="info">
              {t('member.shop.detail.chooseOption')}
            </InlineNote>
          ) : null}
          {/*
            THE FACT ABOVE THE BUTTON, NOT BESIDE IT.

            `mobile-class-detail.tsx:239-247` sets its bar in two columns, and
            it can: "დაჯავშნა" is one short word. "კალათაში დამატება" is not —
            side by side, the lime pill took the row and the figure truncated to
            "45,…", which is the one thing in the bar that must never be a
            guess. So the pair stacks, in the cart's own summary-row shape
            (label left, figure right), over a full-width CTA.
          */}
          <View
            accessible
            accessibilityLabel={`${t('member.shop.cart.summary.total')}: ${totalSpoken}`}
            testID="product-total"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: spacing[3],
            }}
          >
            <Eyebrow size="micro" accessible={false}>
              {t('member.shop.cart.summary.total')}
            </Eyebrow>
            <Money
              variant="monoLarge"
              // Inert: the grouping `View` above is the accessible node, so
              // this label is never spoken. Required by `MoneyProps` all the
              // same, and rightly — a mono run without one is read digit by
              // digit the moment somebody drops the `accessible={false}`.
              accessibilityLabel={totalSpoken}
              accessible={false}
              numberOfLines={1}
            >
              {totalText}
            </Money>
          </View>
          <Button
            label={t('member.shop.detail.addToCart')}
            busyLabel={t('member.cart.adding')}
            busy={adding}
            disabled={ref === null || !buyable || !online}
            variant="primary"
            size="lg"
            fullWidth
            onPress={() => {
              if (ref !== null) onAdd(ref);
            }}
            testID="product-add"
          />
        </Surface>
      }
    >
      <View style={{ gap: spacing[6] }}>
        {online ? null : <OfflineNotice testID="product-offline" />}

        {/*
          The bag badge in the header reads from a cart that would not load, so
          it is showing a count nobody can vouch for — and an absent badge reads
          as "your cart is empty", which is a claim, not a gap.
          TODO(i18n) `member.shop.cart.loadError`.
        */}
        {cartFailed ? (
          <InlineNote testID="product-cart-error" icon="info">
            {SHOP_PENDING_COPY.cartLoadError}
          </InlineNote>
        ) : null}

        {/*
          ================================================================
          THE HERO, AND WHY IT IS A COLUMN RATHER THAN A ROW.

          As a row — 96pt plate, then a 16pt name and a 17pt price beside it
          — this card was the catalogue ROW again, one screen deeper and no
          bigger. The detail artboard's hero is a column: the plate's
          equivalent, then the name at the direction's display step, then
          the figures under it (`mobile-class-detail.tsx:130-158`). The
          member arriving here has already tapped the row; the screen owes
          them something the row did not show.
          ================================================================
        */}
        <Surface tone="card" radius="container" padding={5} style={{ gap: spacing[5] }}>
          {/* Never a photo — a monogram plate, exactly as in the list. The
              direction does not carry supplier photography. */}
          <Surface
            tone="quiet"
            radius={26}
            side={HERO_THUMB}
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              width: HERO_THUMB,
              height: HERO_THUMB,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* A MONOGRAM, never a photo, and never a `Heading` — a heading
                role here would put a header on the screen for a single
                decorative letter. */}
            <Mono variant="monoDisplay" color="onQuiet" style={{ opacity: 0.8 }}>
              {productInitial(product.name) ?? ''}
            </Mono>
          </Surface>

          <View style={{ gap: spacing[3] }}>
            {/*
              ============================================================
              THE NAME OF THE THING BEING BOUGHT, AND THE SCREEN'S `h1`.

              It is a `Heading` now BECAUSE the app bar no longer carries
              the title (see the header above): the screen has exactly one
              first-level header either way, and this is the one a member
              can actually read — 34px, wrapping, never truncated.
              ============================================================
            */}
            <Heading level={1} testID="product-name">
              {product.name}
            </Heading>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: spacing[3],
              }}
            >
              <Money
                variant="monoDisplay"
                color="textAccent"
                accessibilityLabel={money.spoken(amount, product.currency)}
              >
                {money.format(amount, product.currency)}
              </Money>
              {soldOut ? (
                <Pill tone="danger" testID="product-sold-out">
                  {t('member.shop.detail.outOfStock')}
                </Pill>
              ) : null}
            </View>
          </View>
        </Surface>

        {product.description === '' ? null : (
          // A SECTION, not a loose grey line between two cards. The artboard
          // gives the detail's prose its own header ("რას უნდა ელოდოთ",
          // `mobile-class-detail.tsx:197-201`); unheaded, this sentence read as
          // a caption belonging to the card above it.
          <View style={{ gap: spacing[3] }}>
            <SectionHeader title={t('member.shop.detail.about')} />
            <Text variant="bodyRegular" color="textSecondary" testID="product-description">
              {product.description}
            </Text>
          </View>
        )}

        {hasVariants ? (
          <View style={{ gap: spacing[3] }}>
            <SectionHeader title={t('member.shop.detail.options')} />
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel={t('member.shop.detail.options')}
              style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}
            >
              {product.variants.map((variant) => (
                <Chip
                  key={variant.id}
                  label={variant.name}
                  selected={variant.id === variantId}
                  disabled={!variant.available}
                  // An unavailable option is still LISTED (the API projects it
                  // that way on purpose, "so the buyer sees what exists"), so
                  // the hint has to say why it cannot be pressed.
                  accessibilityHint={
                    variant.available ? undefined : t('member.shop.detail.unavailable')
                  }
                  onPress={() => {
                    onVariant(variant.id);
                  }}
                  testID={`product-variant-${variant.id}`}
                />
              ))}
            </View>
          </View>
        ) : null}

        <View style={{ gap: spacing[3] }}>
          <SectionHeader title={t('member.shop.detail.quantity')} />
          <QtyStepper
            value={qty}
            // `min: 1` here, not 0: this stepper picks how many to ADD, and
            // "add zero" is not a thing. Removing is the cart's job.
            min={1}
            max={MAX_CART_LINE_QUANTITY}
            onChange={onQty}
            disabled={!buyable}
            labels={{
              decrease: t('member.shop.cart.decrease'),
              increase: t('member.shop.cart.increase'),
              value: t('member.shop.detail.quantity'),
            }}
            testID="product-qty"
            style={{ alignSelf: 'flex-start' }}
          />
        </View>
      </View>
    </Screen>
  );
}
