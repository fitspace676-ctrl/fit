'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { MeSubscriptionPayment } from '@fit/types';
import { createDateTimeFormat } from '@fit/i18n';
import { Banner, Button, Card } from '@/src/components/ui/kit';
import { useRouter } from '@/src/i18n/navigation';
import { useOnlinePayment } from '@/src/components/checkout/online-payments';
import { paySubscriptionAction } from '@/app/actions/subscription-payment';
import { formatMoney } from '@/lib/shop';

export function RenewalPayment({
  timeZone,
  payment,
  overdue,
}: {
  timeZone: string;
  payment?: MeSubscriptionPayment;
  overdue: boolean;
}) {
  const t = useTranslations('member.payment');
  const locale = useLocale();
  const router = useRouter();
  const online = useOnlinePayment();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (payment?.mode !== 'manual') return null;
  const current = payment;
  function pay() {
    if (pending || online.redirecting) return;
    if (current.pendingOrderId) {
      router.push(`/checkout/result?orderId=${encodeURIComponent(current.pendingOrderId)}`);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await paySubscriptionAction();
      if (!result.ok) {
        setError(
          t(
            result.code === 'SUBSCRIPTION_NOT_DUE'
              ? 'notDue'
              : result.code === 'ONLINE_PAYMENTS_UNAVAILABLE'
                ? 'frontDesk'
                : 'error',
          ),
        );
        return;
      }
      try {
        if (!online.redirect(result.data.payment)) router.refresh();
      } catch {
        router.push(`/checkout/result?orderId=${encodeURIComponent(result.data.payment.orderId)}`);
      }
    });
  }
  return (
    <Card>
      <p>{t('renewalAmount', { amount: formatMoney(payment.amount, payment.currency, locale) })}</p>
      {payment.dueAt ? (
        <p>
          {t('renewalDue', {
            date: createDateTimeFormat(locale, { timeZone, dateStyle: 'medium' }).format(
              new Date(payment.dueAt),
            ),
          })}
        </p>
      ) : null}
      {overdue ? <Banner tone="error">{t('overdue')}</Banner> : null}
      {payment.canPayNow ? (
        <Button
          label={t('payPeriod')}
          onClick={pay}
          disabled={pending || online.redirecting}
          loading={pending}
        />
      ) : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
    </Card>
  );
}
