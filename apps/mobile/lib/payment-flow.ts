import type { GetOrderResponse, OnlinePaymentsConfig, PaymentAction } from '@fit/types';

export function canPayOnline(config: OnlinePaymentsConfig | undefined): boolean {
  // Unknown config cannot authorise a purchase either.
  return config?.enabled === true;
}

export function paymentScheme(scheme: string | string[] | undefined): string {
  const value = Array.isArray(scheme) ? scheme[0] : scheme;
  if (!value) throw new Error('Missing Expo app scheme');
  return value;
}

export const paymentResultPath = (orderId: string) =>
  `/checkout/result?orderId=${encodeURIComponent(orderId)}` as const;

export async function launchPayment(
  payment: PaymentAction | undefined,
  deps: { scheme: string; open: (url: string, returnUrl: string) => Promise<unknown>; result: (path: ReturnType<typeof paymentResultPath>) => void },
): Promise<boolean> {
  if (payment?.status !== 'requires_action') return false;
  // Even a missing URL or a dismissed/failed browser must lead to server sync,
  // never to a receipt and never back to creating a duplicate order.
  try {
    if (payment.checkoutUrl) await deps.open(payment.checkoutUrl, `${deps.scheme}://checkout/result`);
  } finally {
    deps.result(paymentResultPath(payment.orderId));
  }
  return true;
}

/** Sequential polling: no overlapping provider requests, and abort on leave. */
export async function pollPayment(
  sync: () => Promise<GetOrderResponse>,
  options: { signal: AbortSignal; wait: () => Promise<void>; now?: () => number },
): Promise<GetOrderResponse | undefined> {
  const now = options.now ?? Date.now;
  const deadline = now() + 30_000;
  let response: GetOrderResponse | undefined;
  for (let attempt = 0; attempt <= 15 && !options.signal.aborted; attempt += 1) {
    response = await sync();
    const status = response.order.payment?.status;
    if (status !== 'pending' && status !== 'requires_action') return response;
    if (attempt === 15 || now() >= deadline) return response;
    await options.wait();
  }
  return response;
}
