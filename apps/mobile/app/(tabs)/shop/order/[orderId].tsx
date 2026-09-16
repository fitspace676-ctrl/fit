// Order confirmation — `GET /checkout/:orderId`.
//
// ===========================================================================
// THIS SCREEN IS THE DEFECT THE REBUILD EXISTS FOR, WRITTEN THE OTHER WAY.
//
// The deleted app read its confirmation back from `GET /orders/:orderId`. That
// is `apps/api/src/orders/orders.controller.ts` — the STAFF CONSOLE's order
// surface, gated on `BillingRead`, a permission `ROLE_PERMISSIONS.MEMBER` does
// not hold. Every member who completed a purchase would have got a 403 here,
// had the `POST /orders` before it not already 404'd, because that route has
// never existed.
//
// The member-safe read is `GET /checkout/:orderId`, and it arrives through
// `useCheckoutOrder(orderId)` — never a hand-built path, because
// `scripts/check-mobile-endpoints.ts` compares `ENDPOINTS` against the API's
// own AST and only a table entry is checked. An id belonging to another member
// or another gym is a `404` here, never a disclosure that it exists, so a
// failure on this screen reads as "not your order" and not as a crash.
// ===========================================================================
//
// COPY: `member.shop.order` (D10) — 12 keys against web's 9, the extras being
// `retry`, the `orderLabel` / `paidLabel` pair, and `detailTitle` (the neutral
// app-bar title for every arrival that is not the checkout's). `orderLabel` is the eyebrow
// over the id; `paidLabel` is NOT USED, because it is the string "Paid" and so
// is `status.paid`, so rendering both puts the word on screen twice meaning two
// different things. Flagged in the report rather than worked around silently.
//
// ROUTE POLICY, and a finding rather than a decision: `ROUTE_POLICY` names
// `order: 'auth'`, but this screen lives at `(tabs)/shop/order/[orderId]` and
// `policyFor` matches longest-prefix, so `'(tabs)/shop' -> 'public'` wins and
// no redirect fires. `lib/**` is another package's file this stage may not
// edit, so the screen gates itself: no session, no order, and the sign-in
// prompt returns here via `next=`.

import {
  AppBar,
  Button,
  Divider,
  EmptyState,
  Eyebrow,
  IconButton,
  Money,
  Mono,
  Pill,
  Screen,
  Surface,
  Text,
  spacing,
} from '@fit/ui-mobile';
import type { OrderStatus } from '@fit/types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { OfflineNotice } from '../../../../components/auth/notices';
import { useIsOnline } from '../../../../components/auth/use-online';
import { useMoney } from '../../../../components/shop/money';
import { useSignInGate } from '../../../../components/shop/sign-in-gate';
import { LoadFailed, RowSkeletons, useRetry } from '../../../../components/shop/states';
import { useCheckoutOrder } from '../../../../hooks/queries/useCheckoutOrder';
import { useGymId } from '../../../../hooks/useActiveGym';
import { ApiError } from '../../../../lib/http/api-error';
import type { MessageKey } from '../../../../lib/i18n/keys';
import { queryKeys } from '../../../../lib/query-keys';
import { useI18n } from '../../../../providers/I18nProvider';

/**
 * The three lifecycle states `orderStatusSchema` allows, mapped to the three
 * keys `member.shop.order.status` carries.
 *
 * A `Record<OrderStatus, MessageKey>` rather than a template literal, so adding
 * a fourth status to the enum is a `type-check` failure here instead of a raw
 * dot-path on a confirmation screen.
 */
const STATUS_KEY: Readonly<Record<OrderStatus, MessageKey>> = {
  pending: 'member.shop.order.status.pending',
  paid: 'member.shop.order.status.paid',
  cancelled: 'member.shop.order.status.cancelled',
};

/** The pill's tone per status. `paid` is the only one that is good news. */
const STATUS_TONE = {
  pending: 'quiet',
  paid: 'accent',
  cancelled: 'danger',
} as const;

export default function OrderScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const money = useMoney();
  const online = useIsOnline();
  const gate = useSignInGate();
  const gymId = useGymId();

  const params = useLocalSearchParams<{ orderId?: string; placed?: string }>();
  const orderId = typeof params.orderId === 'string' ? params.orderId : undefined;

  // ONE SCREEN, TWO ARRIVALS. Checkout `replace`s here with `?placed=1` and is
  // the only caller that does; the orders tab pushes, and `+native-intent`
  // rewrites `fit://orders/:id` here as well. Reading an order from history
  // under "Order placed" — with a subtitle promising to tell the member when
  // it is ready — restates a week-old event as news, so the announcement (and
  // the promise under it) belong to the arrival, not to the order.
  const placed = params.placed === '1';

  const query = useCheckoutOrder(orderId);
  const retry = useRetry(
    gymId === null || orderId === undefined ? null : queryKeys.checkoutOrder(gymId, orderId),
  );

  const here = orderId === undefined ? '/shop' : `/shop/order/${orderId}`;

  const header = (
    <AppBar
      align="center"
      leading={
        <IconButton
          icon="arrowLeft"
          accessibilityLabel={t('member.shop.cart.back')}
          onPress={() => {
            // Checkout used `replace` to get here, so there is deliberately no
            // emptied cart behind this screen to pop back to.
            if (router.canGoBack()) router.back();
            else router.replace('/shop');
          }}
          testID="order-back"
        />
      }
      // The screen's first `role="header"`.
      title={t(placed ? 'member.shop.order.title' : 'member.shop.order.detailTitle')}
    />
  );

  const keepShopping = {
    label: t('member.shop.order.continue'),
    onPress: () => {
      router.replace('/shop');
    },
    testID: 'order-continue',
  };

  if (gymId === null) {
    return (
      <Screen testID="order-screen" header={header}>
        <EmptyState
          testID="order-signed-out"
          icon="lock"
          title={t('member.cart.signInToAdd')}
          action={{
            label: t('common.cta.signIn'),
            onPress: () => {
              gate.prompt(here);
            },
            // `SignInGate.ready` — see `components/shop/sign-in-gate.ts`.
            busy: !gate.ready,
            testID: 'order-sign-in',
          }}
        />
      </Screen>
    );
  }

  if (orderId === undefined) {
    return (
      <Screen testID="order-screen" header={header}>
        <EmptyState
          testID="order-not-found"
          icon="info"
          title={t('member.shop.order.notFound.title')}
          body={t('member.shop.order.notFound.subtitle')}
          action={keepShopping}
        />
      </Screen>
    );
  }

  if (query.isPending) {
    return (
      <Screen testID="order-screen" header={header}>
        <RowSkeletons count={2} label={t('member.shop.order.loading')} testID="order-loading" />
      </Screen>
    );
  }

  if (query.isError) {
    // A 404 is not a failure to retry — the id is not this member's, and the
    // API answers 404 rather than 403 precisely so it never confirms that
    // someone else's order exists. Offering "try again" for it would be the app
    // telling the member their next move is to do the same thing twice.
    const missing = ApiError.is(query.error) && query.error.status === 404;
    return (
      <Screen testID="order-screen" header={header}>
        <View style={{ gap: spacing[4] }}>
          {online ? null : <OfflineNotice testID="order-offline" />}
          {missing ? (
            <EmptyState
              testID="order-not-found"
              icon="info"
              title={t('member.shop.order.notFound.title')}
              body={t('member.shop.order.notFound.subtitle')}
              action={keepShopping}
            />
          ) : (
            <LoadFailed
              testID="order-error"
              title={t('member.shop.order.error')}
              retryLabel={t('member.shop.order.retry')}
              onRetry={retry}
            />
          )}
        </View>
      </Screen>
    );
  }

  const order = query.data.order;

  return (
    <Screen
      testID="order-screen"
      header={header}
      footer={
        <Button
          label={t('member.shop.order.continue')}
          variant="primary"
          size="lg"
          fullWidth
          onPress={() => {
            router.replace('/shop');
          }}
          testID="order-continue"
        />
      }
    >
      <View style={{ gap: spacing[6] }}>
        {online ? null : <OfflineNotice testID="order-offline" />}

        {placed ? (
          <Text variant="bodySmall" color="textSecondary" testID="order-subtitle">
            {t('member.shop.order.subtitle')}
          </Text>
        ) : null}

        <Surface tone="card" padding={4} style={{ gap: spacing[3] }}>
          <View
            // One node, one sentence: "Order, ord_4821". Split, VoiceOver reads
            // the label and then spells the id out as an unrelated stop,
            // because it is a tabular monospace run.
            accessible
            accessibilityLabel={`${t('member.shop.order.orderLabel')}, ${order.id}`}
            style={{ gap: spacing[1] }}
          >
            <Eyebrow
              size="micro"
              color="textSecondary"
              accessible={false}
              importantForAccessibility="no-hide-descendants"
            >
              {t('member.shop.order.orderLabel')}
            </Eyebrow>
            <Mono
              variant="monoBody"
              accessible={false}
              importantForAccessibility="no-hide-descendants"
            >
              {order.id}
            </Mono>
          </View>

          <Pill tone={STATUS_TONE[order.status]} testID="order-status">
            {t(STATUS_KEY[order.status])}
          </Pill>
        </Surface>

        {order.items.length === 0 ? null : (
          <View style={{ gap: spacing[3] }}>
            {/*
              NO SECTION HEADER HERE, and that is a copy finding rather than a
              layout choice: `member.shop.order.paidLabel` is "Paid", the same
              string as `member.shop.order.status.paid` on the pill above. Using
              it as a heading puts the word on screen twice, six points apart,
              meaning two different things. The card needs no heading; the key
              needs a rename. See the report.
            */}
            <Surface tone="card" padding={4} style={{ gap: spacing[3] }}>
              {order.items.map((item, index) => (
                <View
                  key={`${item.label}-${String(index)}`}
                  accessible
                  accessibilityLabel={`${item.label}, ${money.spoken(item.amount, order.currency)}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: spacing[3],
                  }}
                  testID="order-item"
                >
                  <Text
                    variant="bodySmall"
                    color="textSecondary"
                    accessible={false}
                    importantForAccessibility="no-hide-descendants"
                    style={{ flex: 1 }}
                  >
                    {item.label}
                  </Text>
                  <Money
                    variant="monoSmall"
                    color="textSecondary"
                    accessibilityLabel={money.spoken(item.amount, order.currency)}
                    accessible={false}
                    importantForAccessibility="no-hide-descendants"
                  >
                    {money.format(item.amount, order.currency)}
                  </Money>
                </View>
              ))}

              <Divider />

              <View
                accessible
                accessibilityLabel={`${t('member.shop.order.total')}, ${money.spoken(order.total, order.currency)}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: spacing[3],
                }}
                testID="order-total"
              >
                <Text
                  variant="subheading"
                  accessible={false}
                  importantForAccessibility="no-hide-descendants"
                >
                  {t('member.shop.order.total')}
                </Text>
                <Money
                  variant="monoLarge"
                  accessibilityLabel={money.spoken(order.total, order.currency)}
                  accessible={false}
                  importantForAccessibility="no-hide-descendants"
                >
                  {money.format(order.total, order.currency)}
                </Money>
              </View>
            </Surface>
          </View>
        )}
      </View>
    </Screen>
  );
}
