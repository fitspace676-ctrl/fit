import type { PaymentAction } from '@fit/types';

/** Returns true only when the caller must stop its instant-success path. */
export function redirectToHostedPayment(payment: PaymentAction | undefined, beforeRedirect: () => void): boolean {
  if (payment?.status !== 'requires_action') return false;
  if (!payment.checkoutUrl) throw new Error('Missing payment checkout URL');
  beforeRedirect();
  const url = payment.checkoutUrl;
  setTimeout(() => window.location.assign(url), 50);
  return true;
}
