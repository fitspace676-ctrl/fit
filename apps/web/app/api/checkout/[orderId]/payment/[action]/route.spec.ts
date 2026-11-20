/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument -- fetch/next mocks */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const session = vi.hoisted<{ token: string | undefined }>(() => ({ token: 'member-token' }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (session.token ? { value: session.token } : undefined) }),
}));
vi.mock('@/lib/tenant-headers', () => ({
  tenantHeaders: async () => ({ 'x-tenant-host': 'gym.formacore.io' }),
}));
import { POST } from './route';
const fetchMock = vi.fn();
beforeEach(() => {
  session.token = 'member-token';
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
function call(action: string) {
  return POST(
    new Request('https://gym.formacore.io/api/checkout/o1/payment/retry', { method: 'POST' }),
    { params: Promise.resolve({ orderId: 'o1', action }) },
  );
}
it('forwards retry with the member token and explicit web return target', async () => {
  fetchMock.mockResolvedValue(
    Response.json({ payment: { status: 'requires_action' } }, { status: 201 }),
  );
  expect((await call('retry')).status).toBe(201);
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(url).toContain('/checkout/o1/payment/retry');
  expect(init.headers.Authorization).toBe('Bearer member-token');
  expect(JSON.parse(init.body)).toEqual({ returnTo: 'web' });
});
it('requires a session and limits the proxy to payment actions', async () => {
  session.token = undefined;
  expect((await call('sync')).status).toBe(401);
  expect((await call('delete')).status).toBe(404);
  expect(fetchMock).not.toHaveBeenCalled();
});
it('preserves payment-in-progress cancellation errors', async () => {
  fetchMock.mockResolvedValue(Response.json({ code: 'PAYMENT_IN_PROGRESS' }, { status: 409 }));
  const response = await call('cancel');
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ code: 'PAYMENT_IN_PROGRESS' });
});
