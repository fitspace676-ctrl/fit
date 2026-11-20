'use client';

import { redirectToHostedPayment } from '@/lib/online-payment';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { OnlinePaymentsConfig, PaymentAction } from '@fit/types';

const Capability = createContext<OnlinePaymentsConfig>({ enabled: false, provider: null });

/**
 * A real client component, not `Capability.Provider` re-exported: a server
 * layout cannot render a context object handed across the client boundary.
 */
export function OnlinePaymentsProvider({
  value,
  children,
}: {
  value: OnlinePaymentsConfig;
  children: ReactNode;
}) {
  return <Capability.Provider value={value}>{children}</Capability.Provider>;
}

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
