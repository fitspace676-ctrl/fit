// Join — buy a membership from a cold start, with no account. THE D9 SCREEN.
//
// ===========================================================================
// ONE SCREEN, FOUR STEPS, AND THE ORDER OF TWO NETWORK CALLS.
//
// `POST /auth/signup` CREATES THE ACCOUNT AND RETURNS A `TokenPair`, AND ONLY
// THEN DOES `POST /checkout` RUN. That sequencing is the whole reason a
// signed-out visitor can finish this funnel: `POST /checkout` resolves the
// buying member from the Bearer, so it cannot run before a session exists. The
// two calls are ordered by `await`, never by a race — **a failed signup must
// never reach the charge** — and `checkout.test.tsx` asserts exactly that, in
// both directions.
//
// The step machine itself lives in `components/checkout/join-state.ts`, which
// is where the "why one route and not four" argument is written down. This file
// is its renderer, plus the two mutations and the six failure branches.
// ===========================================================================
//
// THERE IS NO PAYMENT GATEWAY. `packages/types/src/signup.ts` says so plainly
// (the T8.8 stub): `CreateCheckoutResponse` is `{productType, orderId,
// subscriptionId}` — no redirect URL, no client secret, no card fields anywhere
// in the contract. Reaching the `201` means the purchase was RECORDED and the
// membership reserved. So step 4 is a review-and-confirm, and the copy says
// "pay at the front desk" (`checkout.payment.notice`,
// `checkout.summary.note`), which is the truth. Drawing a card form that
// charges nothing would be the one thing worse than not having one.
//
// COPY: `checkout` (109 keys, full en/ka parity) plus `auth.showPassword` /
// `auth.hidePassword` for the password reveal — D10's namespace choice for this
// screen, made once, here. The two DoD states with no copy anywhere in either
// catalogue — offline and the 429 cool-down — reuse
// `components/auth/notices.tsx`, whose `pending-copy.ts` already owns that
// debt; the one join-specific gap is in `components/checkout/pending-copy.ts`.
//
// THE TENANT. `ROUTE_POLICY['(join)']` is `'public'`, so this screen renders
// with no session — but every gym-scoped query hook takes `gymId` from the
// ACCESS TOKEN's claim, and `gymScope(null)` returns `enabled: false`. So
// signed out, `useCatalogue()` would fetch nothing, forever. That is the seam
// `hooks/useDiscoveryGym.ts` closes for every public screen, and this one uses
// it twice over: once for the catalogue read, and once — through
// `useDiscoveryMutationDeps()` — for the CHARGE, which `useMutationDeps()`
// cannot serve. See that file for why.

import {
  AppBar,
  Alert as Advisory,
  Button,
  Chip,
  EmptyState,
  IconButton,
  InlineNote,
  Money,
  Pips,
  Screen,
  Segmented,
  Surface,
  SwitchRow,
  Text,
  Divider,
  Eyebrow,
  spacing,
} from '@fit/ui-mobile';
import type { CheckoutProductType } from '@fit/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { View } from 'react-native';

import { CoolDownNotice, OfflineNotice } from '../../components/auth/notices';
import { useCoolDown } from '../../components/auth/use-cool-down';
import { useIsOnline } from '../../components/auth/use-online';
import { ChoiceCard } from '../../components/checkout/choice-card';
import { DetailsStep } from '../../components/checkout/details-step';
import { classifyJoinFailure, type JoinFailure } from '../../components/checkout/join-failure';
import {
  FREE_ACCOUNT_ID,
  SECTIONS,
  STEP_CHIP_KEYS,
  STEP_TITLE_KEYS,
  canAdvance,
  canSubmit,
  freeAccountOffered,
  initialJoinState,
  isFreeSelected,
  joinReducer,
  productsOfType,
  reachable,
  selectedProduct,
  signupBodyFor,
  stepsDone,
  type JoinContext,
  type JoinProduct,
  type Step,
} from '../../components/checkout/join-state';
import { OrderSummary } from '../../components/checkout/order-summary';
import { CHECKOUT_PENDING_COPY } from '../../components/checkout/pending-copy';
import { deviceToday } from '../../components/checkout/start-date';
import { useMoney } from '../../components/shop/money';
import { LoadFailed, RowSkeletons } from '../../components/shop/states';
import { RESOURCE_ROOTS } from '../../hooks/mutations/invalidation';
import { createCheckoutMutationOptions } from '../../hooks/mutations/useCheckoutMutations';
import { catalogueQueryOptions } from '../../hooks/queries/useShop';
import { useDiscoveryGym, useDiscoveryMutationDeps } from '../../hooks/useDiscoveryGym';
import { useOnboarding } from '../../hooks/useOnboarding';
import { useSession } from '../../hooks/useSession';
import { resolveGymSlug, signUpMember } from '../../lib/auth/session';
import type { MessageKey } from '../../lib/i18n/keys';
import { queryKeys } from '../../lib/query-keys';
import { HOME_ROUTE } from '../../lib/route-policy';
import { useI18n } from '../../providers/I18nProvider';

/** The tabs the product step offers, in the order they are drawn. */
const PRODUCT_TABS = [
  'subscription',
  'package',
  'credit_pack',
] as const satisfies readonly CheckoutProductType[];

/** Each step's supporting line, in `SECTIONS` order. */
const STEP_SUBTITLE_KEYS = [
  'checkout.locations.subtitle',
  'checkout.packages.subtitle',
  'checkout.details.subtitle',
  'checkout.payment.subtitle',
] as const satisfies readonly MessageKey[];

export default function JoinCheckoutScreen() {
  const { t, plural } = useI18n();
  const router = useRouter();
  const money = useMoney();
  const online = useIsOnline();
  const session = useSession();
  const gym = useDiscoveryGym();
  const checkoutDeps = useDiscoveryMutationDeps();
  const queryClient = useQueryClient();
  const onboarding = useOnboarding();
  const coolDown = useCoolDown();

  const signedIn = session.status === 'signed-in';
  const gymId = gym.gymId;

  const [state, dispatch] = useReducer(joinReducer, initialJoinState);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<JoinFailure | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  // ── The catalogue ────────────────────────────────────────────────────────
  //
  // The branch is in the KEY because it is on the WIRE: `GET /catalogue?
  // locationId=` narrows the package list, so one key for two requests would
  // hand back the previous branch's catalogue out of the cache and never
  // refetch. `queryKeys.catalogue(gymId, locationId)` carries it at index 2 —
  // the filter-bucket shape `products` and `notifications` have — so the
  // two-segment root still prefix-matches every branch and the invalidation
  // matrix's `createCheckout` row keeps working. This screen used to append
  // that segment by hand; the factory owns it now.
  const catalogueQuery = useQuery(catalogueQueryOptions(gymId, state.locationId ?? undefined));
  const catalogue = catalogueQuery.data ?? null;

  // The DISCOVERY gym, not the session's — and that is the point. The session's
  // gym does not exist until `POST /auth/signup` resolves, and
  // `useMutationDeps()` would have captured `null` at render time, so
  // `useCreateCheckout()` would throw `MissingGymScopeError` on the very call
  // this funnel exists to make. `useDiscoveryMutationDeps()` is that swap made
  // once, in `hooks/`, rather than assembled here.
  const checkout = useMutation(createCheckoutMutationOptions(checkoutDeps));

  // A single-branch gym does not get asked. Only ever fills an EMPTY selection,
  // so a buyer who has chosen is never overwritten by a refetch.
  const onlyLocationId =
    catalogue !== null && catalogue.locations.length === 1
      ? (catalogue.locations[0]?.id ?? null)
      : null;
  useEffect(() => {
    if (onlyLocationId !== null && state.locationId === null) {
      dispatch({ type: 'location', locationId: onlyLocationId });
    }
  }, [onlyLocationId, state.locationId]);

  const today = deviceToday();
  const context = useMemo<JoinContext>(
    () => ({
      catalogue,
      signedIn,
      intake: catalogue?.memberIntake ?? null,
      startDatePolicy: catalogue?.startDatePolicy ?? null,
      // The DEVICE's wall clock. `Intl` is banned and `createDateTimeFormat` is
      // UTC-only, so a gym-zone "today" is not reachable on this platform —
      // see `components/checkout/start-date.ts` for the full note and what it
      // costs.
      today,
    }),
    [catalogue, signedIn, today],
  );

  const done = stepsDone(state, context);
  const product = selectedProduct(catalogue, state);
  const free = isFreeSelected(catalogue, state, signedIn);
  const freeOffered = freeAccountOffered(catalogue, signedIn);
  const rows = productsOfType(catalogue, state.productType);
  /** The gym has no products of ANY type — a different empty from an empty tab. */
  const nothingOnSale =
    catalogue !== null && PRODUCT_TABS.every((tab) => productsOfType(catalogue, tab).length === 0);

  const branchName = catalogue?.locations.find((row) => row.id === state.locationId)?.name;
  const freeName =
    catalogue === null || catalogue.freeAccount.name.trim() === ''
      ? t('checkout.packages.free.name')
      : catalogue.freeAccount.name.trim();

  const goto = useCallback(
    (step: Step): void => {
      dispatch({ type: 'goto', step });
      setShowErrors(false);
    },
    [dispatch],
  );

  // ── The purchase ─────────────────────────────────────────────────────────

  const submit = useCallback((): void => {
    if (gymId === null || submitting || coolDown.active || !online) return;
    if (!canSubmit(state, context, gymId, submitting)) {
      setShowErrors(true);
      return;
    }

    // Captured AFTER the guard, so the nested `run()` and its `.catch` see a
    // plain `string`. TypeScript drops a narrowing when it crosses a function
    // boundary, and the alternative — a cast at each of the four uses — is four
    // places a real `null` could later slip through.
    const tenant: string = gymId;

    setSubmitting(true);
    setFailure(null);

    async function run(): Promise<void> {
      if (!signedIn) {
        // ================================================================
        // THE INTRO IS MARKED SEEN BEFORE THE SESSION FLIPS, ON PURPOSE.
        //
        // `resolveRedirect` zone 2 sends a signed-in user with an incomplete
        // onboarding flag to `/onboarding`, from ANY route. A signed-out
        // visitor never sees the intro (zone 1 has no such rule), so a buyer
        // who reached this funnel without an account has `isComplete === false`
        // — and the instant `signUpMember` resolves, `RouteGuard` would
        // `router.replace('/onboarding')` BETWEEN THE SIGNUP AND THE CHARGE.
        // The charge would still complete, invisibly, on an unmounted screen,
        // and the buyer would be reading a two-slide intro instead of a
        // receipt.
        //
        // Marking it complete first is the smallest fix that lives inside this
        // screen: `useOnboarding().complete()` is the store's own public
        // function. It is also defensible on its own terms — a buyer who has
        // just walked four steps of a join funnel has been introduced to the
        // app. Reported as a route-policy gap rather than presented as a
        // feature: the general answer is for zone 2 to exempt `public` routes.
        // ================================================================
        await onboarding.complete();
        await signUpMember(signupBodyFor(state, tenant, context.intake), {
          // Diagnostic only (D4). `memberSignupSchema` takes a `gymId`, so the
          // tenant is already unambiguous on the wire; the slug only lets the
          // client notice a session that landed somewhere else.
          gymSlug: resolveGymSlug(),
        });
      }

      // A FREE ACCOUNT HAS NOTHING TO SETTLE. The signup that just ran IS the
      // membership: no order, no receipt, no `POST /checkout`.
      if (product === null) {
        router.replace(HOME_ROUTE);
        return;
      }

      const result = await checkout.mutateAsync({
        productType: state.productType,
        productId: product.id,
        ...(state.locationId === null ? {} : { locationId: state.locationId }),
      });

      // `replace`, not `push`: back out of the confirmation must not be able to
      // re-submit. Exactly one of the two ids is set, keyed by `productType` —
      // a package or pack settles onto an `Order`, a subscription mints an
      // `Invoice` instead, and the confirmation reads a different endpoint for
      // each.
      router.replace(
        result.orderId === null
          ? `/checkout-success?subscriptionId=${encodeURIComponent(result.subscriptionId ?? '')}`
          : `/checkout-success?orderId=${encodeURIComponent(result.orderId)}`,
      );
    }

    run().catch((error: unknown) => {
      setSubmitting(false);
      const next = classifyJoinFailure(error);
      setFailure(next);

      switch (next.kind) {
        case 'coolDown':
          // NEVER auto-retried. Retrying a rate-limit response is what the
          // limiter is defending against, and it turns a 15-minute wait into a
          // longer one.
          coolDown.start(next.seconds);
          return;
        case 'emailTaken':
          // A branch, not a failure — and it has to be shown WHERE IT FIRES.
          // Web sets the flag while the details section is `hidden`, so the
          // buyer sits on the payment step with a live button and no message.
          dispatch({ type: 'goto', step: 2 });
          return;
        case 'productUnavailable':
          // The catalogue we chose from is wrong: the row is gone, is another
          // tenant's, or is off sale. Re-read it and send the buyer back to the
          // picker rather than leaving a dead selection on the review step.
          void queryClient.invalidateQueries({ queryKey: RESOURCE_ROOTS.catalogue(tenant) });
          dispatch({ type: 'goto', step: 1 });
          return;
        case 'alreadySubscribed':
          // The cached membership is what let this funnel offer the purchase.
          void queryClient.invalidateQueries({ queryKey: queryKeys.membership(tenant) });
          return;
        default:
          return;
      }
    });
  }, [
    gymId,
    submitting,
    coolDown,
    online,
    state,
    context,
    signedIn,
    onboarding,
    product,
    checkout,
    router,
    queryClient,
  ]);

  // ── Chrome ───────────────────────────────────────────────────────────────

  const header = (
    <AppBar
      testID="join-header"
      eyebrow={t('checkout.title')}
      // The screen's ONE `AppBar` title, and it changes with the step exactly
      // as web's does — the step IS the page here.
      title={t(STEP_TITLE_KEYS[state.step])}
      subtitle={t(STEP_SUBTITLE_KEYS[state.step])}
      leading={
        <IconButton
          icon="chevronLeft"
          accessibilityLabel={t('checkout.back')}
          testID="join-back"
          onPress={() => {
            if (state.step > 0) {
              goto((state.step - 1) as Step);
              return;
            }
            // Step 1's Back leaves the funnel. `canGoBack` is false on a cold
            // deep link straight into `/checkout`, and popping an empty stack
            // is a no-op that reads as a dead button.
            if (router.canGoBack()) router.back();
            else router.replace('/');
          }}
        />
      }
    />
  );

  const tenantMissing = gymId === null && !gym.isPending;

  return (
    <Screen
      testID="join-checkout"
      header={header}
      // No capsule under the join funnel — see `_layout.tsx`.
      reserveTabBar={false}
      footer={
        tenantMissing ? undefined : (
          // Opaque — `Screen`'s footer wrapper is absolutely positioned over
          // the scroll and paints nothing. See the rule on `ScreenProps.footer`.
          <Surface
            testID="join-footer-plate"
            tone="card"
            radius="container"
            padding={4}
            style={{ gap: spacing[3] }}
          >
            {state.step === 3 ? (
              <Button
                testID="join-submit"
                variant="primary"
                size="lg"
                fullWidth
                icon={free ? 'check' : 'lock'}
                label={free ? t('checkout.payment.createFree') : t('checkout.payment.pay')}
                busyLabel={t('checkout.payment.processing')}
                busy={submitting}
                // ==========================================================
                // `busy` is NOT `disabled`: a primary that greys out the
                // instant it is pressed reads as a rejection. The cool-down
                // and the radio genuinely do disable it — there is nothing the
                // buyer can do about either from this screen, and both already
                // render their own notice above.
                //
                // AN UNTICKED BOX IS NOT IN THAT CATEGORY, and it used to be.
                // It is the one remaining reason to refuse that the buyer can
                // FIX, in one tap, on this very screen — and a disabled
                // `Button` swallows its own press, so `submit` never ran and
                // `showErrors` never turned on. This file argues that exact
                // point about `join-continue` two hundred lines below and then
                // did the opposite here, on the last control in the funnel.
                //
                // Live, the press reaches `submit`, `canSubmit` refuses it
                // (`stepsDone` index 3 IS `state.terms`) and the note beside
                // the switch appears. Nothing can be bought without the tick;
                // the difference is only whether the buyer is told why.
                // ==========================================================
                disabled={coolDown.active || !online}
                onPress={submit}
              />
            ) : (
              <Button
                testID="join-continue"
                variant="primary"
                size="lg"
                fullWidth
                endIcon="chevronRight"
                label={t('checkout.continue')}
                // ==========================================================
                // DISABLED ON THE PICKING STEPS, LIVE ON THE FORM.
                //
                // A disabled `Button` swallows its own press, so "press
                // Continue and I will show you what is missing" cannot work
                // through a disabled control — the handler never runs and
                // `showErrors` never turns on. Web has the same shape and the
                // same dead end.
                //
                // Steps 1 and 2 have nothing to explain: the buyer has not
                // picked a card, and the cards are right there. Step 3 is a
                // form, where "why can I not continue?" is a real question, so
                // the button stays live and answers it.
                // ==========================================================
                disabled={state.step !== 2 && !canAdvance(state, context)}
                onPress={() => {
                  if (canAdvance(state, context)) goto((state.step + 1) as Step);
                  else setShowErrors(true);
                }}
              />
            )}
          </Surface>
        )
      }
    >
      <View style={{ gap: spacing[5] }}>
        {/* Plan §6 item 4. TODO(i18n): there are no `offline` keys in either
            catalogue — see `components/auth/pending-copy.ts`. */}
        {online ? null : <OfflineNotice testID="join-offline" />}

        {coolDown.active ? (
          <CoolDownNotice testID="join-cooldown" secondsLeft={coolDown.secondsLeft} />
        ) : null}

        {tenantMissing ? (
          <EmptyState
            testID="join-no-gym"
            icon="info"
            // The one sentence in the namespace for "there is no gym in scope
            // here", authored in both locales.
            title={t('checkout.packages.noGym')}
            action={{
              label: t('checkout.packages.retry'),
              onPress: gym.retry,
              testID: 'join-no-gym-retry',
            }}
          />
        ) : (
          <>
            <StepIndicator
              step={state.step}
              done={done}
              onGoto={goto}
              disabled={submitting}
              testID="join-steps"
            />

            <FailureNotice
              failure={failure}
              testID="join-failure"
              onHome={() => {
                router.replace(HOME_ROUTE);
              }}
            />

            {gym.isPending || catalogueQuery.isPending ? (
              <RowSkeletons
                label={t(
                  state.step === 0 ? 'checkout.locations.loading' : 'checkout.packages.loading',
                )}
                testID="join-loading"
              />
            ) : catalogueQuery.isError ? (
              <LoadFailed
                testID="join-error"
                title={t(state.step === 0 ? 'checkout.locations.error' : 'checkout.packages.error')}
                retryLabel={t(
                  state.step === 0 ? 'checkout.locations.retry' : 'checkout.packages.retry',
                )}
                onRetry={() => {
                  if (gymId === null) return;
                  // The ROOT, so a retry re-reads whichever branch bucket is on
                  // screen rather than only the unfiltered one.
                  void queryClient.invalidateQueries({
                    queryKey: RESOURCE_ROOTS.catalogue(gymId),
                  });
                }}
              />
            ) : (
              <>
                {state.step === 0 ? renderLocationStep() : null}

                {state.step === 1 ? renderPackageStep() : null}

                {state.step === 2 ? (
                  <DetailsStep
                    testID="join-details"
                    state={state}
                    dispatch={dispatch}
                    context={context}
                    showErrors={showErrors}
                    emailTaken={failure?.kind === 'emailTaken'}
                    disabled={submitting}
                    sessionPending={session.status === 'hydrating'}
                    onSignIn={() => {
                      router.push(`/login?next=${encodeURIComponent('/checkout')}`);
                    }}
                  />
                ) : null}

                {state.step === 3 ? (
                  renderPaymentStep()
                ) : (
                  <OrderSummary
                    testID="join-summary"
                    branchName={branchName}
                    productName={free ? freeName : product?.name}
                    total={product?.priceAmount}
                    currency={product?.currency}
                    freeLabel={free ? t('checkout.packages.free.price') : undefined}
                  />
                )}
              </>
            )}
          </>
        )}
      </View>
    </Screen>
  );

  // ── Step bodies ──────────────────────────────────────────────────────────
  //
  // RENDER FUNCTIONS, NOT NESTED COMPONENTS. A component declared inside
  // another gets a new identity on every render, so React unmounts and remounts
  // its whole subtree each time — which on a form is a lost keyboard and a lost
  // caret. Calling them (`{renderPackageStep()}`) inlines the JSX into THIS
  // component's tree instead, where the reconciler sees the same elements it
  // saw last time. They read `t`, `money`, `state` and `dispatch` off the
  // closure rather than through props, so there is nothing to thread and
  // nothing to keep in sync.

  function renderLocationStep() {
    const locations = catalogue?.locations ?? [];
    const selectedId = state.locationId;
    if (locations.length === 0) {
      return (
        <EmptyState
          testID="join-locations-empty"
          icon="pin"
          title={t('checkout.locations.empty.title')}
          body={t('checkout.locations.empty.subtitle')}
        />
      );
    }
    return (
      <View style={{ gap: spacing[3] }} accessibilityRole="radiogroup">
        {locations.map((location) => {
          const selected = location.id === selectedId;
          return (
            <ChoiceCard
              key={location.id}
              testID={`join-location-${location.id}`}
              title={location.name}
              // ALWAYS passed, `null` included: `null` draws the monogram plate,
              // `undefined` would draw no band at all — and a branch with no
              // photo yet must not be a hole in a list of pictures. The data has
              // been on `GET /catalogue` since `LOCATION_SELECT` was written.
              photoUrl={location.photoUrl}
              meta={location.address}
              selected={selected}
              onPress={() => {
                dispatch({ type: 'location', locationId: location.id });
              }}
              accessibilityLabel={`${location.name}. ${location.address}`}
              accessibilityHint={
                selected ? t('checkout.locations.selected') : t('checkout.locations.select')
              }
            />
          );
        })}
      </View>
    );
  }

  function renderPackageStep() {
    const options = rows;
    const productType = state.productType;
    const selectedId = state.productId;
    const offerFree = freeOffered;
    const freeTitle = freeName;
    const freeDescription =
      catalogue === null || catalogue.freeAccount.description.trim() === ''
        ? t('checkout.packages.free.description')
        : catalogue.freeAccount.description.trim();
    return (
      <View style={{ gap: spacing[4] }}>
        <Segmented
          testID="join-product-tabs"
          label={t('checkout.packages.tabsLabel')}
          value={productType}
          onChange={(next) => {
            dispatch({ type: 'productType', productType: next });
          }}
          options={PRODUCT_TABS.map((tab) => ({
            value: tab,
            label: t(`checkout.packages.tabs.${tab}`),
          }))}
        />

        {options.length === 0 ? (
          // TWO DIFFERENT EMPTIES, and the catalogue has copy for both. A gym
          // that sells nothing at all needs "check back soon"; a gym whose
          // OTHER tabs have stock needs "nothing in this category", or the
          // buyer stops looking at a screen that has products one tab away.
          nothingOnSale ? (
            <EmptyState
              testID="join-packages-empty"
              icon="bag"
              title={t('checkout.packages.empty.title')}
              body={t('checkout.packages.empty.subtitle')}
            />
          ) : (
            <EmptyState
              testID="join-tab-empty"
              icon="info"
              title={t('checkout.packages.tabEmpty')}
            />
          )
        ) : (
          <View style={{ gap: spacing[3] }} accessibilityRole="radiogroup">
            {options.map((row) => (
              <ChoiceCard
                key={row.id}
                testID={`join-product-${row.id}`}
                title={row.name}
                meta={metaFor(row)}
                description={row.description}
                price={money.format(row.priceAmount, row.currency)}
                priceAccessibilityLabel={money.spoken(row.priceAmount, row.currency)}
                priceSuffix={suffixFor(row)}
                badge={row.popular ? t('checkout.packages.popular') : undefined}
                features={row.features}
                selected={row.id === selectedId}
                onPress={() => {
                  dispatch({ type: 'product', productId: row.id });
                }}
                accessibilityLabel={`${row.name}. ${money.spoken(row.priceAmount, row.currency)}`}
                accessibilityHint={
                  row.id === selectedId
                    ? t('checkout.packages.selected')
                    : t('checkout.packages.select')
                }
              />
            ))}
          </View>
        )}

        {/* The gym's own no-purchase offer, outside the list under an "or" —
            it is not one of the products, it is the alternative to buying one. */}
        {offerFree ? (
          <View style={{ gap: spacing[3] }}>
            <Eyebrow size="label" color="textSecondary" testID="join-free-or">
              {t('checkout.packages.free.or')}
            </Eyebrow>
            <ChoiceCard
              testID="join-product-free"
              title={freeTitle}
              description={freeDescription}
              price={t('checkout.packages.free.price')}
              priceAccessibilityLabel={t('checkout.packages.free.price')}
              selected={selectedId === FREE_ACCOUNT_ID}
              onPress={() => {
                dispatch({ type: 'product', productId: FREE_ACCOUNT_ID });
              }}
              accessibilityLabel={`${freeTitle}. ${t('checkout.packages.free.price')}`}
            />
          </View>
        ) : null}
      </View>
    );
  }

  function renderPaymentStep() {
    const chosen = product;
    const isFree = free;
    const freeTitle = freeName;
    // The chosen row vanished between the picker and here — a branch switch, or
    // a product withdrawn. Say so vaguely, because `422 PRODUCT_UNAVAILABLE` is
    // vague on purpose, and send them back.
    if (!isFree && chosen === null) {
      return (
        <EmptyState
          testID="join-payment-unavailable"
          icon="info"
          title={t('checkout.payment.unavailable.title')}
          body={t('checkout.payment.unavailable.subtitle')}
          action={{
            label: t('checkout.back'),
            onPress: () => {
              goto(1);
            },
            testID: 'join-payment-unavailable-back',
          }}
        />
      );
    }

    return (
      <View style={{ gap: spacing[4] }}>
        <Surface tone="card" padding={5} testID="join-payment-summary">
          <View style={{ gap: spacing[3] }}>
            {branchName === undefined ? null : (
              <View
                style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing[3] }}
              >
                <Eyebrow size="label" color="textSecondary">
                  {t('checkout.summary.branch')}
                </Eyebrow>
                <Text variant="body" align="right" style={{ flex: 1 }}>
                  {branchName}
                </Text>
              </View>
            )}
            <View
              style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing[3] }}
            >
              <Eyebrow size="label" color="textSecondary">
                {t('checkout.payment.summary.package')}
              </Eyebrow>
              <Text variant="body" align="right" style={{ flex: 1 }}>
                {isFree ? freeTitle : (chosen?.name ?? '')}
              </Text>
            </View>

            <Divider />

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Eyebrow size="label" color="textSecondary">
                {t('checkout.payment.summary.total')}
              </Eyebrow>
              {isFree || chosen === null ? (
                <Text variant="bodyLarge" testID="join-payment-total-free">
                  {t('checkout.packages.free.price')}
                </Text>
              ) : (
                <Money
                  variant="monoLarge"
                  accessibilityLabel={money.spoken(chosen.priceAmount, chosen.currency)}
                  testID="join-payment-total"
                >
                  {money.format(chosen.priceAmount, chosen.currency)}
                </Money>
              )}
            </View>
          </View>
        </Surface>

        {/* THE HONEST SENTENCE. There is no gateway; reaching the 201 records
            the purchase and reserves the membership. */}
        <InlineNote icon="info" testID="join-payment-notice">
          {isFree ? t('checkout.payment.freeNotice') : t('checkout.payment.notice')}
        </InlineNote>

        <SwitchRow
          testID="join-terms"
          label={t('checkout.payment.terms')}
          checked={state.terms}
          disabled={submitting}
          onChange={(next) => {
            dispatch({ type: 'terms', terms: next });
          }}
        />

        {/* The reason Pay refused, next to the thing that fixes it. `live`, via
            `InlineNote`'s own region, because it appears as the RESULT of a
            press: a buyer who has just pressed Pay and heard nothing has no way
            to know why.
            TODO(i18n) `checkout.payment.termsRequired` — see
            `components/checkout/pending-copy.ts`. */}
        {showErrors && !state.terms ? (
          <InlineNote icon="info" iconColor="error" live testID="join-terms-required">
            {CHECKOUT_PENDING_COPY.termsRequired}
          </InlineNote>
        ) : null}
      </View>
    );
  }

  function metaFor(row: JoinProduct): string | undefined {
    if (row.sessionCount !== null) {
      return plural('checkout.packages.sessions', row.sessionCount);
    }
    return row.type === 'subscription' ? t('checkout.packages.unlimited') : undefined;
  }

  function suffixFor(row: JoinProduct): string | undefined {
    if (row.interval === 'month') return t('checkout.packages.perMonth');
    if (row.interval === 'year') return t('checkout.packages.perYear');
    return undefined;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The indicator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Where the buyer is, and how far back they may jump.
 *
 * Two elements doing two jobs, which is why neither one alone would do:
 *
 *   * **`Pips`** is the glanceable progress meter — four segments at 390pt,
 *     which is what reads best there, and it is where `checkout.progressLabel`
 *     and `checkout.progress` ("Step 2 of 4") live. It is not pressable, and it
 *     does not need to be.
 *   * **The chip rail** is the NAVIGATION, and it is a rail of `Chip`s rather
 *     than a `Segmented` because `reachable(i)` is a per-option rule:
 *     `Segmented` has one `disabled` for the whole group, so it would let a
 *     buyer jump to the payment step with no product chosen. `Chip` is the
 *     design system's pressable with a per-item `disabled`, and a horizontal
 *     rail is what the artboard draws (`web-checkout.tsx:327-343`, a numbered
 *     step strip with a hairline between). At 390pt four Georgian step names do
 *     not fit on one line, so the rail scrolls rather than wraps.
 */
function StepIndicator({
  step,
  done,
  onGoto,
  disabled,
  testID,
}: {
  step: Step;
  done: readonly boolean[];
  onGoto: (next: Step) => void;
  disabled: boolean;
  testID: string;
}) {
  const { t } = useI18n();
  return (
    <View style={{ gap: spacing[3] }}>
      <Pips
        testID={`${testID}-pips`}
        filled={step + 1}
        total={SECTIONS.length}
        accessibilityLabel={t('checkout.progressLabel')}
        accessibilityValueText={t('checkout.progress', {
          current: step + 1,
          total: SECTIONS.length,
        })}
      />
      {/*
        ====================================================================
        FOUR CHIPS THAT WRAP, NOT A RAIL THAT SCROLLS.
        //
        This was a `ScrollRail`, and on step 4 the buyer could see the LEFT
        EDGE of "გადახდა" and nothing else: the four labels overflow 335pt,
        so the step they were actually on was the one off the end. It
        overflows in English too — Location · Package · Your details ·
        Review & pay — so it is a layout bug that Georgian widths made total
        rather than a translation problem.
        //
        Neither of the two obvious fixes fits. `ScrollRail`'s `scrollToIndex`
        needs a FIXED `itemWidth` (it is a `ScrollView`, not a `FlatList`, and
        cannot measure a child it was not told about) and these chips are
        label-width, all four different. Collapsing to "Step 4 of 4" beside
        the pips would fit, but the chips are also NAVIGATION — `onGoto` walks
        the buyer back to a step they have already completed — and a counter
        cannot be pressed.
        //
        So the row wraps. Four chips become two rows on a narrow screen, all
        four on screen, all four pressable, no scroll to discover and no
        measurement pass to get wrong. The pips above already carry the
        "4 of 4" reading for a screen reader (`checkout.progress`), so
        nothing is lost by keeping the labels.
        ====================================================================
      */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }} testID={testID}>
        {SECTIONS.map((section, index) => (
          <Chip
            key={section}
            testID={`${testID}-${section}`}
            label={t(STEP_CHIP_KEYS[index] ?? 'checkout.steps.location')}
            selected={index === step}
            disabled={disabled || !reachable(done, index)}
            onPress={() => {
              onGoto(index as Step);
            }}
          />
        ))}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The failure branches
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One advisory per failure kind — except the two that are not advisories.
 *
 * `emailTaken` renders inside the details step, beside the email field it is
 * about; `coolDown` renders as the screen's own `CoolDownNotice`, above
 * everything, because it disables the submit button and has to be read before
 * the button is pressed again. Everything else lands here.
 */
function FailureNotice({
  failure,
  onHome,
  testID,
}: {
  failure: JoinFailure | null;
  onHome: () => void;
  testID: string;
}) {
  const { t } = useI18n();
  if (failure === null) return null;

  switch (failure.kind) {
    case 'emailTaken':
    case 'coolDown':
      return null;
    case 'productUnavailable':
      return (
        <Advisory
          testID={`${testID}-unavailable`}
          tone="danger"
          icon="info"
          live
          title={t('checkout.payment.unavailable.title')}
          body={t('checkout.payment.unavailable.subtitle')}
        />
      );
    case 'alreadySubscribed':
      return (
        <Advisory
          testID={`${testID}-already-subscribed`}
          tone="info"
          icon="check"
          live
          // TODO(i18n): `checkout.payment.alreadySubscribed`. See
          // `components/checkout/pending-copy.ts` — web never rendered this
          // branch, so the key was never authored.
          title={CHECKOUT_PENDING_COPY.alreadySubscribed}
        >
          <Button
            testID={`${testID}-already-subscribed-home`}
            variant="secondary"
            size="sm"
            label={t('checkout.success.returnHome')}
            onPress={onHome}
          />
        </Advisory>
      );
    case 'gymUnknown':
      return (
        <Advisory
          testID={`${testID}-gym`}
          tone="danger"
          icon="info"
          live
          title={t('checkout.packages.noGym')}
        />
      );
    default:
      return (
        <Advisory
          testID={`${testID}-generic`}
          tone="danger"
          icon="info"
          live
          title={t('checkout.payment.error')}
        />
      );
  }
}
