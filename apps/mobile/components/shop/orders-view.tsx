// @fit/mobile — the Shop screen's Orders tab.
//
// The list half of a pair that until now had only a detail: `GET /checkout/
// :orderId` could confirm the purchase just made, and nothing could answer "what
// have I bought". `GET /me/orders` is that answer, and a row links into the
// screen the confirmation already uses (`/shop/order/:id`) rather than a second
// order screen — same route, same status vocabulary, no fork.
//
// ===========================================================================
// THIS TAB IS SESSION-SCOPED WHERE THE PRODUCTS TAB IS NOT.
//
// The catalogue browses signed out (D9, and the shop screen's header explains
// why): `GET /products` takes an explicit `gymId`. An order history cannot —
// there is no member id on the wire, the caller *is* the session — so signed
// out this tab is a sign-in prompt rather than an empty list. "You have no
// orders" would be a claim the app cannot make about someone it cannot name.
// ===========================================================================
//
// The status vocabulary is `order/[orderId].tsx`'s, imported rather than copied:
// three states, one of them lossy (a `REFUNDED` order reads as `cancelled`),
// and a list that named a state differently from the detail it links into would
// be the same order described two ways one tap apart.

import { Button, EmptyState, ListRow, Pill, Surface, spacing } from '@fit/ui-mobile';
import type { MemberOrderSummary, OrderStatus } from '@fit/types';
import { View } from 'react-native';

import { MY_ORDERS_PAGE_SIZE, useMyOrders } from '../../hooks/queries/useOrders';
import { useGymId } from '../../hooks/useActiveGym';
import type { MessageKey } from '../../lib/i18n/keys';
import { queryKeys } from '../../lib/query-keys';
import { useI18n } from '../../providers/I18nProvider';
import { formatMediumDate } from '../services/date-format';
import { useMoney } from './money';
import { useSignInGate } from './sign-in-gate';
import { LoadFailed, RowSkeletons, useRetry } from './states';

/** The three lifecycle states, mapped to the keys the order screen already uses. */
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

export interface OrdersViewProps {
  /** Where a sign-in from this tab returns to. */
  signInNext: string;
  /** Open one order's detail — `/shop/order/:id`. */
  onOpenOrder: (orderId: string) => void;
  /** "Browse shop" from the empty state: the tab beside this one, not a push. */
  onBrowseProducts: () => void;
}

/** The member's own purchase history, paged. */
export function OrdersView({ signInNext, onOpenOrder, onBrowseProducts }: OrdersViewProps) {
  const { t, locale } = useI18n();
  const money = useMoney();
  const gate = useSignInGate();
  const gymId = useGymId();

  const orders = useMyOrders();
  // The SAME key the query is registered under — `useRetry` invalidates it, and
  // an infinite query's pages all live beneath it.
  const retry = useRetry(
    gymId === null ? null : queryKeys.myOrders(gymId, { limit: MY_ORDERS_PAGE_SIZE }),
  );

  if (gymId === null) {
    return (
      <EmptyState
        testID="shop-orders-signed-out"
        icon="lock"
        title={t('member.shop.orders.signedOut.title')}
        body={t('member.shop.orders.signedOut.subtitle')}
        action={{
          label: t('common.cta.signIn'),
          onPress: () => {
            gate.prompt(signInNext);
          },
          // `SignInGate.ready` — the keychain read is async, and a button that
          // routes on a guess bounces a returning member to /login.
          busy: !gate.ready,
          testID: 'shop-orders-sign-in',
        }}
      />
    );
  }

  if (orders.isPending) {
    return (
      <RowSkeletons
        layout="line"
        label={t('member.shop.orders.loading')}
        testID="shop-orders-loading"
      />
    );
  }

  if (orders.isError) {
    return (
      <LoadFailed
        testID="shop-orders-error"
        title={t('member.shop.orders.error')}
        retryLabel={t('member.shop.orders.retry')}
        onRetry={retry}
      />
    );
  }

  const rows = orders.data.pages.flatMap((page) => page.orders);

  if (rows.length === 0) {
    return (
      <EmptyState
        testID="shop-orders-empty"
        icon="bag"
        title={t('member.shop.orders.empty.title')}
        body={t('member.shop.orders.empty.subtitle')}
        action={{
          label: t('member.shop.orders.empty.action'),
          onPress: onBrowseProducts,
          testID: 'shop-orders-browse',
        }}
      />
    );
  }

  return (
    <View style={{ gap: spacing[4] }}>
      <Surface tone="card" padVertical={1} testID="shop-orders-list">
        {rows.map((order) => (
          <OrderRow
            key={order.id}
            order={order}
            date={formatMediumDate(locale, order.createdAt)}
            amount={money.format(order.total, order.currency)}
            spokenAmount={money.spoken(order.total, order.currency)}
            onPress={() => {
              onOpenOrder(order.id);
            }}
          />
        ))}
      </Surface>

      {orders.hasNextPage ? (
        <Button
          label={t('member.shop.orders.loadMore')}
          variant="secondary"
          fullWidth
          busy={orders.isFetchingNextPage}
          onPress={() => {
            void orders.fetchNextPage();
          }}
          testID="shop-orders-load-more"
        />
      ) : null}
    </View>
  );
}

interface OrderRowProps {
  order: MemberOrderSummary;
  date: string;
  amount: string;
  spokenAmount: string;
  onPress: () => void;
}

/**
 * One order.
 *
 * The TOTAL is the title and the basket is the hint, the shape `billing.tsx`
 * gives an invoice row — money is what the member scans a purchase history for,
 * and an order has no human number to put there instead (`Order.id` is a cuid).
 *
 * `itemLabels` carries the first two lines only (`MY_ORDER_LABEL_PREVIEW`), so
 * anything beyond them is counted rather than named: "Whey Protein, Shaker +2
 * more". The remainder is computed from `itemCount`, which is the whole order's
 * line count — never from the labels array, which is already truncated.
 */
function OrderRow({ order, date, amount, spokenAmount, onPress }: OrderRowProps) {
  const { t } = useI18n();

  const status = t(STATUS_KEY[order.status]);
  const remainder = order.itemCount - order.itemLabels.length;
  const items = [
    order.itemLabels.join(', '),
    remainder > 0 ? t('member.shop.orders.moreItems', { count: remainder }) : '',
  ]
    .filter((part) => part !== '')
    .join(' ');

  return (
    <ListRow
      testID={`shop-order-${order.id}`}
      icon="bag"
      title={amount}
      hint={items === '' ? date : `${date} · ${items}`}
      onPress={onPress}
      // The pill is inside the row's single accessibility node, so the status
      // has to be spoken here or it is not spoken at all. The money is the
      // `spoken` form: a monospace total is read digit by digit otherwise.
      accessibilityLabel={`${spokenAmount}, ${date}, ${status}`}
      trailing={
        <View
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Pill tone={STATUS_TONE[order.status]} size="sm">
            {status}
          </Pill>
        </View>
      }
    />
  );
}
