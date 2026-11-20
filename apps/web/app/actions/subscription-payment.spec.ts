import { afterEach, expect, it, vi } from 'vitest';
import { paySubscriptionAction } from './subscription-payment';

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: () => ({ value: 'token' }) }),
}));
vi.mock('@/lib/tenant-headers', () => ({
  tenantHeaders: () => Promise.resolve({ 'X-Gym-Id': 'gym' }),
}));
afterEach(() => vi.unstubAllGlobals());
it('posts the web return target and passes the hosted payment through', async () => {
  const payment = {
    status: 'requires_action',
    orderId: 'o1',
    checkoutUrl: 'https://pay.example',
    expiresAt: null,
  };
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ payment }), { status: 201 }));
  vi.stubGlobal('fetch', fetch);
  expect(await paySubscriptionAction()).toEqual({ ok: true, data: { payment } });
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining('/me/subscription/pay'),
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ returnTo: 'web' }),
    }),
  );
});
it.each(['SUBSCRIPTION_NOT_DUE', 'ONLINE_PAYMENTS_UNAVAILABLE'])('preserves %s', async (code) => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ code }), { status: 409 })),
  );
  expect(await paySubscriptionAction()).toEqual({ ok: false, code });
});
