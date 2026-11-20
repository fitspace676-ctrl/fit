'use client';

import { redirectToHostedPayment } from '@/lib/online-payment';
import { createContext, useContext, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { OnlinePaymentsConfig, PaymentAction } from '@fit/types';

const Capability = createContext<OnlinePaymentsConfig>({ enabled: false, provider: null });
export const OnlinePaymentsProvider = Capability.Provider;

export function paymentErrorKey(code?: string) {
  if (code === 'ONLINE_PAYMENTS_UNAVAILABLE') return 'unavailable';
  if (code === 'PAYMENT_PROVIDER_UNAVAILABLE') return 'providerUnavailable';
  if (code === 'PAYMENT_IN_PROGRESS') return 'inProgress';
  return 'error';
}

export function useOnlinePayment() {
  const capability = useContext(Capability);
  const t = useTranslations('checkout.online');
  const [redirecting, setRedirecting] = useState(false);
  function redirect(payment?: PaymentAction): boolean {
    return redirectToHostedPayment(payment, () => setRedirecting(true));
  }
  return { ...capability, t, redirecting, redirect };
}
