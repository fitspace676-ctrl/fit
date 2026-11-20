import { afterEach, expect, it, vi } from 'vitest';
import { cancelOrderPayment, retryOrderPayment, syncOrderPayment } from './payments';
import { createCheckout, checkoutCart } from './checkout';
import { env } from '../env';

afterEach(() => vi.unstubAllGlobals());
function fetchResponse(body: unknown) {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
it('syncs the member-safe order and forwards abort', async () => {
  const response = { order: { id: 'a/b', payment: { status: 'paid' } } };
  const fetch = fetchResponse(response);
  const signal = new AbortController().signal;
  expect(await syncOrderPayment('a/b', { signal })).toEqual(response);
  expect(fetch).toHaveBeenCalledWith(`${env.apiUrl}/checkout/a%2Fb/payment/sync`, expect.objectContaining({ method: 'POST', signal: expect.anything() }));
});
it('retries with app return target', async () => {
  const fetch = fetchResponse({ payment: { status: 'requires_action' } });
  await retryOrderPayment('ord_1');
  expect(fetch).toHaveBeenCalledWith(`${env.apiUrl}/checkout/ord_1/payment/retry`, expect.objectContaining({ method: 'POST', body: JSON.stringify({ returnTo: 'app' }) }));
});
it('cancels the existing order without creating a new purchase', async () => {
  const fetch = fetchResponse({});
  await cancelOrderPayment('ord_1');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(`${env.apiUrl}/checkout/ord_1/payment/cancel`, expect.objectContaining({ method: 'POST' }));
});
it('preserves hosted payment actions in cart outcomes', async () => {
  const payment = { status: 'requires_action', orderId: 'ord_1', checkoutUrl: 'https://checkout.flitt.com/test', expiresAt: null };
  fetchResponse({ orderId: 'ord_1', payment });
  expect(await checkoutCart({ fulfillment: 'PICKUP', locationId: 'loc_1' })).toEqual({ ok: true, orderId: 'ord_1', payment });
});
it('requests the app return for catalogue purchases', async () => {
  const fetch = fetchResponse({ orderId: 'ord_1' });
  await createCheckout({ productType: 'package', productId: 'pkg_1' });
  expect(fetch).toHaveBeenCalledWith(`${env.apiUrl}/checkout`, expect.objectContaining({ body: JSON.stringify({ productType: 'package', productId: 'pkg_1', returnTo: 'app' }) }));
});
