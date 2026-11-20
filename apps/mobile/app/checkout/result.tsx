import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Screen, Text, spacing } from '@fit/ui-mobile';
import type { OrderSummary } from '@fit/types';
import { useGymId } from '../../hooks/useActiveGym';
import { paymentDestinationKey, usePaymentBrowser } from '../../hooks/usePaymentBrowser';
import { cancelOrderPayment, retryOrderPayment, syncOrderPayment } from '../../lib/api/payments';
import { pollPayment } from '../../lib/payment-flow';
import { queryKeys } from '../../lib/query-keys';
import { useI18n } from '../../providers/I18nProvider';

export default function PaymentResultScreen() {
  const params = useLocalSearchParams<{ orderId?: string }>();
  const orderId = typeof params.orderId === 'string' ? params.orderId : '';
  const { t } = useI18n();
  const router = useRouter();
  const client = useQueryClient();
  const gymId = useGymId();
  const openPayment = usePaymentBrowser();
  const [round, setRound] = useState(0);
  const [order, setOrder] = useState<OrderSummary>();
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let wake: (() => void) | undefined;
    setChecking(true);
    setFailed(false);
    async function check() {
      if (!orderId) throw new Error('Missing order');
      const result = await pollPayment(
        () => syncOrderPayment(orderId, { signal: controller.signal }),
        {
          signal: controller.signal,
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
  }, [orderId, round, gymId, client, router]);

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
  return (
    <Screen testID="payment-result">
      <View style={{ gap: spacing[4] }}>
        <Text variant="subheading">
          {t(checking ? 'member.payment.checking' : 'member.payment.incomplete')}
        </Text>
        {checking ? <ActivityIndicator /> : null}
        {failed ? <Text>{t('member.payment.error')}</Text> : null}
        {!checking && order?.payment?.retry ? (
          <Button
            label={t('member.payment.retry')}
            onPress={() => {
              void retry();
            }}
            busy={busy}
            testID="payment-retry"
          />
        ) : null}
        {!checking && order?.status === 'pending' && order.payment?.provider ? (
          <Button
            label={t('member.payment.cancel')}
            onPress={() => {
              void cancel();
            }}
            disabled={busy}
            testID="payment-cancel"
          />
        ) : null}
        {!checking ? (
          <Button
            label={t('member.payment.checkAgain')}
            disabled={busy || !orderId}
            onPress={() => setRound((value) => value + 1)}
            testID="payment-check"
          />
        ) : null}
        <Button label={t('member.payment.back')} onPress={() => router.replace('/home')} />
      </View>
    </Screen>
  );
}
