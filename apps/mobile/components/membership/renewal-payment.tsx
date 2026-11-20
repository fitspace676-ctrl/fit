import { useState } from 'react';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Surface, Text, spacing } from '@fit/ui-mobile';
import type { MeSubscriptionPayment } from '@fit/types';
import { usePaySubscription } from '../../hooks/mutations/useSubscriptionMutations';
import { paymentDestinationKey, usePaymentBrowser } from '../../hooks/usePaymentBrowser';
import { useGymId } from '../../hooks/useActiveGym';
import { ApiError } from '../../lib/http/api-error';
import { paymentResultPath } from '../../lib/payment-flow';
import { queryKeys } from '../../lib/query-keys';
import { useI18n } from '../../providers/I18nProvider';
import { formatMediumDate } from '../services/date-format';
import { formatMoney } from '../services/money';

export function RenewalPayment({
  payment,
  overdue,
  online,
}: {
  payment?: MeSubscriptionPayment;
  overdue: boolean;
  online: boolean;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const openPayment = usePaymentBrowser();
  const purchase = usePaySubscription();
  const client = useQueryClient();
  const gymId = useGymId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (payment?.mode !== 'manual') return null;
  const current = payment;
  async function pay() {
    if (busy || !online) return;
    setBusy(true);
    setError(null);
    try {
      if (current.pendingOrderId) {
        await AsyncStorage.setItem(paymentDestinationKey(current.pendingOrderId), 'membership');
        router.push(paymentResultPath(current.pendingOrderId));
        return;
      }
      const result = await purchase.mutateAsync();
      if (!(await openPayment(result.payment, 'membership')) && gymId) {
        await client.invalidateQueries({ queryKey: queryKeys.membership(gymId) });
      }
    } catch (cause) {
      const code = cause instanceof ApiError ? cause.code : undefined;
      setError(
        t(
          code === 'SUBSCRIPTION_NOT_DUE'
            ? 'member.payment.notDue'
            : code === 'ONLINE_PAYMENTS_UNAVAILABLE'
              ? 'member.payment.frontDesk'
              : 'member.payment.error',
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Surface tone="card" padding={5}>
      <View style={{ gap: spacing[3] }}>
        <Text>
          {t('member.payment.renewalAmount', {
            amount: formatMoney(payment.amount, payment.currency, locale),
          })}
        </Text>
        {payment.dueAt ? (
          <Text>
            {t('member.payment.renewalDue', { date: formatMediumDate(locale, payment.dueAt) })}
          </Text>
        ) : null}
        {overdue ? <Text>{t('member.payment.overdue')}</Text> : null}
        {payment.canPayNow ? (
          <Button
            testID="membership-pay"
            label={t('member.payment.payPeriod')}
            busy={busy}
            disabled={!online}
            onPress={() => {
              void pay();
            }}
          />
        ) : null}
        {error ? <Text testID="membership-payment-error">{error}</Text> : null}
      </View>
    </Surface>
  );
}
