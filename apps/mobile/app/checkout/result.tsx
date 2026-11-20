// The payment result: what the provider says about one order, right now.
//
// The hosted payment page closes for three different reasons and this screen
// must not guess between them: the buyer paid, the bank declined, or the buyer
// simply closed the page. Every state drawn here comes from the server's answer
// to `POST /checkout/:orderId/payment/sync`, which asks the provider each time.
// The spinner therefore only turns while a question is actually in flight, and
// the "nothing was charged" line is shown only for states where that is known.

import { useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  Alert as Advisory,
  Button,
  Divider,
  Icon,
  Money,
  Screen,
  Spinner,
  Surface,
  Text,
  spacing,
  useThemeColors,
  type IconName,
} from '@fit/ui-mobile';
import type { OrderSummary } from '@fit/types';
import { useMoney } from '../../components/shop/money';
import { useGymId } from '../../hooks/useActiveGym';
import { paymentDestinationKey, usePaymentBrowser } from '../../hooks/usePaymentBrowser';
import { cancelOrderPayment, retryOrderPayment, syncOrderPayment } from '../../lib/api/payments';
import { pollPayment } from '../../lib/payment-flow';
import { queryKeys } from '../../lib/query-keys';
import { useI18n } from '../../providers/I18nProvider';

/** What the screen is saying — one per distinct thing the buyer can be told. */
type View_ =
  | 'checking'
  | 'processing'
  | 'paid'
  | 'notPaid'
  | 'failed'
  | 'expired'
  | 'waiting'
  | 'refunded'
  | 'error';

const MEDALLION = spacing[14] + spacing[10];

const LOOKS: Record<
  View_,
  {
    icon: IconName | null;
    fill: 'accentMuted' | 'successMuted' | 'errorMuted' | 'warningMuted';
    ink: 'accent' | 'success' | 'error' | 'warning';
  }
> = {
  checking: { icon: null, fill: 'accentMuted', ink: 'accent' },
  processing: { icon: null, fill: 'accentMuted', ink: 'accent' },
  paid: { icon: 'check', fill: 'successMuted', ink: 'success' },
  notPaid: { icon: 'card', fill: 'warningMuted', ink: 'warning' },
  failed: { icon: 'x', fill: 'errorMuted', ink: 'error' },
  expired: { icon: 'clock', fill: 'warningMuted', ink: 'warning' },
  waiting: { icon: 'clock', fill: 'accentMuted', ink: 'accent' },
  refunded: { icon: 'refresh', fill: 'accentMuted', ink: 'accent' },
  error: { icon: 'info', fill: 'errorMuted', ink: 'error' },
};

function viewOf(checking: boolean, failed: boolean, order: OrderSummary | undefined): View_ {
  const payment = order?.payment;
  if (checking) return payment?.processing === true ? 'processing' : 'checking';
  if (!payment) return 'error';
  switch (payment.status) {
    case 'paid':
      return 'paid';
    case 'refunded':
      return 'refunded';
    case 'failed':
      return 'failed';
    case 'expired':
      return 'expired';
    case 'requires_action':
      return payment.processing === true ? 'waiting' : 'notPaid';
    case 'pending':
      return failed ? 'error' : 'waiting';
  }
}

export default function PaymentResultScreen() {
  const params = useLocalSearchParams<{ orderId?: string; dismissed?: string }>();
  const orderId = typeof params.orderId === 'string' ? params.orderId : '';
  // Only the first check after the buyer closed the page is a single question;
  // "check again" and a retry are deliberate and wait like any other.
  const dismissed = params.dismissed === '1';
  const { t } = useI18n();
  const money = useMoney();
  const colors = useThemeColors();
  const router = useRouter();
  const client = useQueryClient();
  const gymId = useGymId();
  const openPayment = usePaymentBrowser();
  const [round, setRound] = useState(0);
  const [order, setOrder] = useState<OrderSummary>();
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const idle = useRef(false);
  idle.current = !checking && !busy;
  const settled = order?.payment?.status === 'paid' || order?.payment?.status === 'refunded';

  // Paying often means leaving for the bank's app. Coming back is the moment
  // the answer has most likely changed, so ask again without being told to.
  useEffect(() => {
    if (settled) return;
    let wasAway = false;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') wasAway = true;
      else if (state === 'active' && wasAway) {
        wasAway = false;
        if (idle.current) setRound((value) => value + 1);
      }
    });
    return () => subscription.remove();
  }, [settled]);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let wake: (() => void) | undefined;
    setChecking(true);
    setFailed(false);
    async function check() {
      if (!orderId) throw new Error('Missing order');
      const result = await pollPayment(
        async () => {
          const response = await syncOrderPayment(orderId, { signal: controller.signal });
          // Each answer is drawn as it lands, so the screen says what the bank
          // says while it is still asking.
          if (!controller.signal.aborted) setOrder(response.order);
          return response;
        },
        {
          signal: controller.signal,
          dismissed: dismissed && round === 0,
          wait: () =>
            new Promise<void>((resolve) => {
              wake = resolve;
              timer = setTimeout(resolve, 2000);
            }),
        },
      );
      if (controller.signal.aborted || !result) return;
      setOrder(result.order);
      if (result.order.payment?.status === 'paid') {
        if (gymId) {
          const keys = [
            queryKeys.creditPacks(gymId),
            queryKeys.membership(gymId),
            queryKeys.packages(gymId),
            queryKeys.myOrders(gymId),
            queryKeys.cart(gymId),
            queryKeys.checkoutOrder(gymId, orderId),
            queryKeys.profile(gymId),
            queryKeys.packCatalogue(gymId),
            queryKeys.catalogue(gymId),
            queryKeys.bookings(gymId),
            queryKeys.classes(gymId),
            queryKeys.products(gymId),
          ];
          for (const queryKey of keys) {
            void client.invalidateQueries({ queryKey: queryKey.slice(0, 2) });
          }
        }
        const destination = await AsyncStorage.getItem(paymentDestinationKey(orderId)).catch(
          () => null,
        );
        if (controller.signal.aborted) return;
        router.replace(
          destination === 'membership'
            ? '/profile/membership'
            : destination === 'join'
              ? `/checkout-success?orderId=${encodeURIComponent(orderId)}`
              : `/shop/order/${encodeURIComponent(orderId)}`,
        );
      }
    }
    void check()
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => {
      controller.abort();
      clearTimeout(timer);
      wake?.();
    };
  }, [orderId, round, gymId, client, router, dismissed]);

  async function retry() {
    if (busy || !orderId) return;
    setBusy(true);
    setFailed(false);
    try {
      const result = await retryOrderPayment(orderId);
      const destination = await AsyncStorage.getItem(paymentDestinationKey(orderId)).catch(
        () => null,
      );
      await openPayment(
        result.payment,
        destination === 'membership' ? 'membership' : destination === 'join' ? 'join' : 'shop',
      );
      setRound((value) => value + 1);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (busy || !orderId) return;
    setBusy(true);
    setFailed(false);
    try {
      await cancelOrderPayment(orderId);
      if (gymId) {
        void client.invalidateQueries({ queryKey: queryKeys.myOrders(gymId).slice(0, 2) });
        void client.invalidateQueries({ queryKey: queryKeys.checkoutOrder(gymId, orderId) });
      }
      router.replace(`/shop/order/${encodeURIComponent(orderId)}`);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  const view = viewOf(checking, failed, order);
  const look = LOOKS[view];
  const working = view === 'checking' || view === 'processing';
  const payment = order?.payment;
  const canRetry = !working && payment?.retry === true;
  const canCancel = !working && order?.status === 'pending' && Boolean(payment?.provider);
  const body =
    view === 'paid' || view === 'refunded'
      ? null
      : view === 'error'
        ? t('member.payment.error')
        : t(`member.payment.result.${view}Body`);

  return (
    <Screen testID="payment-result" reserveTabBar={false}>
      <View style={{ gap: spacing[8], paddingTop: spacing[10], paddingBottom: spacing[6] }}>
        <View style={{ alignItems: 'center', gap: spacing[3] }}>
          <View
            testID={`payment-state-${view}`}
            style={{
              width: MEDALLION,
              height: MEDALLION,
              borderRadius: MEDALLION / 2,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors[look.fill],
              marginBottom: spacing[3],
            }}
          >
            {look.icon === null ? (
              <Spinner
                size={spacing[10]}
                strokeWidth={3}
                color={look.ink}
                accessibilityLabel={t('member.payment.checking')}
              />
            ) : (
              <Icon name={look.icon} size={spacing[10]} color={look.ink} />
            )}
          </View>
          <Text variant="title" align="center" accessibilityRole="header">
            {view === 'refunded'
              ? t('member.payment.refunded')
              : t(`member.payment.result.${view}Title`)}
          </Text>
          {body ? (
            <Text variant="body" color="textSecondary" align="center">
              {body}
            </Text>
          ) : null}
        </View>

        {order ? (
          <Surface tone="card" padding={5} testID="payment-summary">
            <View style={{ gap: spacing[3] }}>
              {order.items.map((item, index) => (
                <View
                  key={`${index}-${item.label}`}
                  style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing[4] }}
                >
                  <Text variant="body" color="textSecondary" style={{ flex: 1 }}>
                    {item.label}
                  </Text>
                  <Money
                    variant="monoBody"
                    accessibilityLabel={money.spoken(item.amount, order.currency)}
                  >
                    {money.format(item.amount, order.currency)}
                  </Money>
                </View>
              ))}
              {order.items.length > 0 ? <Divider /> : null}
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: spacing[4],
                }}
              >
                <Text variant="subtitle">{t('member.payment.result.total')}</Text>
                <Money
                  variant="monoLarge"
                  accessibilityLabel={money.spoken(order.total, order.currency)}
                >
                  {money.format(order.total, order.currency)}
                </Money>
              </View>
            </View>
          </Surface>
        ) : null}

        {failed && view !== 'error' ? (
          <Advisory tone="danger" title={t('member.payment.error')} />
        ) : null}

        <View style={{ gap: spacing[3] }}>
          {canRetry ? (
            <Button
              variant="primary"
              size="lg"
              icon="card"
              label={t(
                payment?.status === 'requires_action'
                  ? 'member.payment.complete'
                  : 'member.payment.retry',
              )}
              onPress={() => {
                void retry();
              }}
              busy={busy}
              testID="payment-retry"
            />
          ) : null}
          {!working && view !== 'paid' ? (
            <Button
              variant={canRetry ? 'secondary' : 'primary'}
              size="lg"
              icon="refresh"
              label={t('member.payment.checkAgain')}
              disabled={busy || !orderId}
              onPress={() => setRound((value) => value + 1)}
              testID="payment-check"
            />
          ) : null}
          {canCancel ? (
            <Button
              variant="ghost"
              size="lg"
              label={t('member.payment.cancel')}
              onPress={() => {
                void cancel();
              }}
              disabled={busy}
              testID="payment-cancel"
            />
          ) : null}
          <Button
            variant="ghost"
            size="lg"
            label={t('member.payment.back')}
            onPress={() => router.replace('/home')}
            testID="payment-home"
          />
        </View>
      </View>
    </Screen>
  );
}
