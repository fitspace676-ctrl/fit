// Join — the receipt.
//
// ===========================================================================
// TWO CONFIRMATIONS, BECAUSE THE THREE PRODUCTS SETTLE ONTO TWO RECORDS.
//
// `CreateCheckoutResponse` is deliberately not a single id: a package or a
// credit pack raises a `PAID` `Order`, so it comes back with `orderId` and this
// screen reads `GET /checkout/:orderId`; a subscription enrolment instead mints
// a numbered `Invoice`, so it comes back with `subscriptionId` and the
// confirmation reads the member's own `GET /me/subscription`. Collapsing them
// onto one id would double-count revenue — `packages/types/src/signup.ts` says
// so — and collapsing them onto one READ would 404 half the time.
//
// Web solves the second case by routing to `/member/account/membership`. Mobile
// cannot: that screen belongs to stage C5 and does not exist in the router yet,
// so a `router.replace('/membership')` here would be a dead route the moment a
// subscription is bought — which is the majority case for a JOIN funnel. So
// both outcomes land here, and the screen branches on which id it was given.
// ===========================================================================
//
// `GET /checkout/:orderId`, NEVER `GET /orders/:orderId`. The latter is the
// staff console's surface, gated on `BillingRead`, which `ROLE_PERMISSIONS.
// MEMBER` does not hold — the exact pair (`POST /orders` → `GET /orders/:id`)
// that made a purchase impossible in the deleted app.
//
// COPY: `checkout.success` (8 keys), plus `member.membership.status.*` for the
// subscription line — D10's rule applied at the one point this screen needs a
// word the `checkout` namespace does not have.
//
// THE VERIFY-EMAIL LINE IS NOT DECORATION. `POST /auth/signup` issues a session
// for an UNVERIFIED address. The buyer is signed in now and cannot sign in
// again once this session ends until they click the emailed link, so
// `checkout.success.verifyEmail` is the most load-bearing sentence on the
// screen and is rendered on both branches.

import {
  AppBar,
  Alert as Advisory,
  Button,
  Divider,
  EmptyState,
  Eyebrow,
  Money,
  Mono,
  Pill,
  Screen,
  Surface,
  Text,
  spacing,
} from '@fit/ui-mobile';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { OfflineNotice } from '../../components/auth/notices';
import { useIsOnline } from '../../components/auth/use-online';
import { useMoney } from '../../components/shop/money';
import { LoadFailed, RowSkeletons, useRetry } from '../../components/shop/states';
import { useCheckoutOrder } from '../../hooks/queries/useCheckoutOrder';
import { useMembership } from '../../hooks/queries/useMembership';
import { useGymId } from '../../hooks/useActiveGym';
import { useSession } from '../../hooks/useSession';
import { queryKeys } from '../../lib/query-keys';
import { HOME_ROUTE } from '../../lib/route-policy';
import { useI18n } from '../../providers/I18nProvider';

export default function JoinCheckoutSuccessScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const money = useMoney();
  const online = useIsOnline();
  const session = useSession();
  const gymId = useGymId();
  const params = useLocalSearchParams<{ orderId?: string; subscriptionId?: string }>();

  const orderId =
    typeof params.orderId === 'string' && params.orderId !== '' ? params.orderId : null;
  // A subscription purchase carries no order. The id itself is not read back —
  // there is no member-facing `GET /subscriptions/:id` — it is only the SIGNAL
  // that the confirmation should read `GET /me/subscription` instead.
  const boughtSubscription =
    typeof params.subscriptionId === 'string' && params.subscriptionId !== '';

  const order = useCheckoutOrder(orderId);
  const membership = useMembership();
  const source = orderId === null ? membership : order;

  const retryOrder = useRetry(
    gymId === null || orderId === null ? null : queryKeys.checkoutOrder(gymId, orderId),
  );
  const retryMembership = useRetry(gymId === null ? null : queryKeys.membership(gymId));

  const home = (
    <Button
      testID="join-success-home"
      variant="primary"
      size="lg"
      fullWidth
      label={t('checkout.success.returnHome')}
      onPress={() => {
        // `replace`, not `push`: the funnel is finished and the buyer must not
        // be able to walk back into a spent checkout.
        router.replace(HOME_ROUTE);
      }}
    />
  );

  const header = (
    <AppBar
      testID="join-success-header"
      eyebrow={t('checkout.title')}
      title={t('checkout.success.title')}
      subtitle={t('checkout.success.subtitle')}
    />
  );

  return (
    <Screen testID="join-success" header={header} reserveTabBar={false} footer={home}>
      <View style={{ gap: spacing[5] }}>
        {/* Plan §6 item 4. TODO(i18n): no `offline` keys exist in either
            catalogue — see `components/auth/pending-copy.ts`. */}
        {online ? null : <OfflineNotice testID="join-success-offline" />}

        {/* THE SIGNED-OUT BRANCH. Reaching this screen without a session means
            the link was opened cold — a deep link, or a session that ended
            between the purchase and here. Both reads need a Bearer, so there is
            nothing to show and nothing to retry; the honest answer is the same
            one an unknown id gets. */}
        {session.status !== 'signed-in' || gymId === null ? (
          <EmptyState
            testID="join-success-signed-out"
            icon="lock"
            title={t('checkout.success.missing.title')}
            body={t('checkout.success.missing.subtitle')}
          />
        ) : orderId === null && !boughtSubscription ? (
          // No id at all — the screen was reached without either parameter.
          <EmptyState
            testID="join-success-missing"
            icon="info"
            title={t('checkout.success.missing.title')}
            body={t('checkout.success.missing.subtitle')}
          />
        ) : source.isPending ? (
          <RowSkeletons
            label={t('checkout.payment.loading')}
            layout="line"
            count={3}
            testID="join-success-loading"
          />
        ) : source.isError ? (
          <LoadFailed
            testID="join-success-error"
            title={t('checkout.success.missing.title')}
            retryLabel={t('checkout.packages.retry')}
            onRetry={orderId === null ? retryMembership : retryOrder}
          />
        ) : orderId !== null ? (
          renderOrder()
        ) : (
          renderSubscription()
        )}

        {/* The one sentence on this screen a buyer must not miss. Rendered
            whatever the outcome, because the session is unverified either way. */}
        <Advisory
          testID="join-success-verify"
          tone="info"
          icon="mail"
          title={t('checkout.success.verifyEmail')}
        />
      </View>
    </Screen>
  );

  function renderOrder() {
    const summary = order.data?.order;
    if (summary === undefined) {
      return (
        <EmptyState
          testID="join-success-missing"
          icon="info"
          title={t('checkout.success.missing.title')}
          body={t('checkout.success.missing.subtitle')}
        />
      );
    }

    return (
      <Surface tone="card" padding={5} testID="join-success-order">
        <View style={{ gap: spacing[3] }}>
          <Eyebrow size="label" color="textSecondary">
            {t('checkout.success.orderId', { id: summary.id })}
          </Eyebrow>

          {summary.items.map((item, index) => (
            <View
              key={`${item.label}-${String(index)}`}
              style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing[3] }}
            >
              <Text variant="bodySmall" color="textSecondary" style={{ flex: 1 }}>
                {item.label}
              </Text>
              <Money
                variant="monoSmall"
                accessibilityLabel={money.spoken(item.amount, summary.currency)}
              >
                {money.format(item.amount, summary.currency)}
              </Money>
            </View>
          ))}

          <Divider />

          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Eyebrow size="label" color="textSecondary">
              {t('checkout.success.total')}
            </Eyebrow>
            <Money
              variant="monoLarge"
              accessibilityLabel={money.spoken(summary.total, summary.currency)}
              testID="join-success-total"
            >
              {money.format(summary.total, summary.currency)}
            </Money>
          </View>

          {/* No card was charged — the T8.8 stub records the purchase and
              reserves the membership. Repeated here rather than assumed
              remembered from the step before it. */}
          <Text variant="caption" color="textSecondary" testID="join-success-note">
            {t('checkout.summary.note')}
          </Text>
        </View>
      </Surface>
    );
  }

  function renderSubscription() {
    const plan = membership.data?.subscription ?? null;
    if (plan === null) {
      // The enrolment succeeded (we have a `subscriptionId`) but the member's
      // own read has not caught up, or the plan is not live yet. Not an error —
      // the purchase is recorded — so the buyer gets the confirmation without a
      // plan line rather than a failure over a completed sale.
      return (
        <Advisory
          testID="join-success-subscription-pending"
          tone="success"
          icon="check"
          title={t('checkout.success.subtitle')}
        />
      );
    }

    return (
      <Surface tone="card" padding={5} testID="join-success-subscription">
        <View style={{ gap: spacing[3] }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: spacing[3],
            }}
          >
            <Text variant="bodyLarge" style={{ flex: 1 }}>
              {/* `planName` is nullable — a bespoke, plan-less subscription.
                  `member.membership.noPlan` is the namespace's own word for
                  "no named plan", which is exactly this case. */}
              {plan.planName ?? t('member.membership.noPlan')}
            </Text>
            <Pill tone="accent" size="sm">
              {t(`member.membership.status.${plan.status}`)}
            </Pill>
          </View>

          <Divider />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing[3] }}>
            <Eyebrow size="label" color="textSecondary">
              {t('member.membership.nextBilling')}
            </Eyebrow>
            {/* An ISO calendar day, set in the mono face — NOT formatted. `Intl`
                is banned in this app and `createDateTimeFormat` is UTC-only,
                so a locale-aware date here would be a lie in one direction or
                the other. Deliberate, and flagged in the C4b report. */}
            <Mono variant="monoSmall" testID="join-success-next-billing">
              {plan.currentPeriodEnd.slice(0, 10)}
            </Mono>
          </View>

          <Text variant="caption" color="textSecondary" testID="join-success-note">
            {t('checkout.summary.note')}
          </Text>
        </View>
      </Surface>
    );
  }
}
