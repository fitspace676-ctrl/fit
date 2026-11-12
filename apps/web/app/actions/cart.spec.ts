import { afterEach, describe, expect, it, vi } from 'vitest';
import { addToCartAction, checkoutCartAction } from './cart';

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: () => ({ value: 'member-token' }) }),
}));
vi.mock('@/lib/tenant-headers', () => ({
  tenantHeaders: () => Promise.resolve({ 'x-tenant-host': 'downtown.localhost' }),
}));

afterEach(() => vi.unstubAllGlobals());

describe('shop cart actions', () => {
  it('preserves the selected variant reference in the request and parsed response', async () => {
    const item = {
      variantId: 'tee:2',
      productId: 'tee',
      productName: 'Training tee',
      variantName: 'L',
      imageUrl: null,
      unitPrice: 4000,
      qty: 1,
      lineTotal: 4000,
      currency: 'GEL',
      available: true,
    };
    const cart = { items: [item], subtotal: 4000, discount: 0, total: 4000, currency: 'GEL' };
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ cart }));
    vi.stubGlobal('fetch', fetch);
    expect(await addToCartAction('tee:2', 1)).toEqual({ ok: true, cart });
    const [url, request] = fetch.mock.calls[0]!;
    expect(url).toMatch(/\/cart\/items$/);
    expect(request?.body).toBe(JSON.stringify({ variantId: 'tee:2', qty: 1 }));
    expect(request?.headers).toMatchObject({
      Authorization: 'Bearer member-token',
      'x-tenant-host': 'downtown.localhost',
    });
  });

  it('checks out the same authenticated server cart without reconstructing its variants', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json({ orderId: 'order-1' }));
    vi.stubGlobal('fetch', fetch);
    expect(await checkoutCartAction('branch-1')).toEqual({ ok: true, orderId: 'order-1' });
    const [url, request] = fetch.mock.calls[0]!;
    expect(url).toMatch(/\/cart\/checkout$/);
    expect(request?.body).toBe(JSON.stringify({ fulfillment: 'PICKUP', locationId: 'branch-1' }));
    expect(request?.headers).toMatchObject({
      Authorization: 'Bearer member-token',
      'x-tenant-host': 'downtown.localhost',
    });
  });
});
