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

/**
 * `dismissed` marks a buyer who closed the payment page themselves, so the
 * result screen asks the server once instead of waiting on a bank that was
 * never asked.
 */
export const paymentResultPath = (
  orderId: string,
  dismissed = false,
): `/checkout/result?orderId=${string}` =>
  `/checkout/result?orderId=${encodeURIComponent(orderId)}${dismissed ? '&dismissed=1' : ''}`;

/** How long the result screen keeps asking, by what the server last said. */
export const PAYMENT_WAIT_MS = { idle: 8_000, processing: 90_000 } as const;

export async function launchPayment(
  payment: PaymentAction | undefined,
  deps: {
    scheme: string;
    open: (url: string, returnUrl: string) => Promise<unknown>;
    result: (path: ReturnType<typeof paymentResultPath>) => void;
  },
): Promise<boolean> {
  if (payment?.status !== 'requires_action') return false;
  // Even a missing URL or a dismissed/failed browser must lead to server sync,
  // never to a receipt and never back to creating a duplicate order.
  let dismissed = false;
  try {
    if (payment.checkoutUrl) {
      const outcome = await deps.open(payment.checkoutUrl, `${deps.scheme}://checkout/result`);
      const type = (outcome as { type?: unknown } | null | undefined)?.type;
      dismissed = type === 'cancel' || type === 'dismiss';
    }
  } finally {
    deps.result(paymentResultPath(payment.orderId, dismissed));
  }
  return true;
}

/**
 * Sequential polling: no overlapping provider requests, and abort on leave.
 *
 * Every round asks the API, which asks the provider. It stops on a final state,
 * and otherwise waits only as long as the answer justifies: up to 90 seconds
 * while the bank is processing a submitted card, 8 seconds when nothing has
 * been submitted, and not at all when the buyer closed the page themselves.
 */
export async function pollPayment(
  sync: () => Promise<GetOrderResponse>,
  options: {
    signal: AbortSignal;
    wait: () => Promise<void>;
    now?: () => number;
    dismissed?: boolean;
  },
): Promise<GetOrderResponse | undefined> {
  const now = options.now ?? Date.now;
  const start = now();
  let response: GetOrderResponse | undefined;
  while (!options.signal.aborted) {
    response = await sync();
    const payment = response.order.payment;
    if (payment?.status !== 'pending' && payment?.status !== 'requires_action') return response;
    const processing = payment.processing === true;
    if (options.dismissed && !processing) return response;
    const limit = processing ? PAYMENT_WAIT_MS.processing : PAYMENT_WAIT_MS.idle;
    if (now() - start >= limit) return response;
    await options.wait();
  }
  return response;
}
