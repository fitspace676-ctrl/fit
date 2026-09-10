import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../env';
import { listMyOrders } from './orders';

interface Call {
  url: string;
  init: RequestInit;
}

function stubFetch(body: unknown = {}, status = 200): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
  return calls;
}

const PAGE = {
  orders: [
    {
      id: 'ord_1',
      status: 'paid',
      total: 4500,
      currency: 'GEL',
      itemCount: 3,
      itemLabels: ['Whey Protein', 'Shaker'],
      createdAt: '2026-06-01T10:00:00.000Z',
    },
  ],
  total: 1,
  page: 1,
  limit: 20,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listMyOrders', () => {
  it('GETs /me/orders with no query when the pager is left to the server', async () => {
    const calls = stubFetch(PAGE);

    await expect(listMyOrders()).resolves.toEqual(PAGE);

    const call = calls[0] as Call;
    expect(call.init.method).toBe('GET');
    expect(call.url).toBe(`${env.apiUrl}/me/orders`);
  });

  it('sends page and limit when given', async () => {
    const calls = stubFetch({ ...PAGE, page: 2, limit: 10 });
    await listMyOrders({ page: 2, limit: 10 });
    expect((calls[0] as Call).url).toBe(`${env.apiUrl}/me/orders?page=2&limit=10`);
  });

  it('is /me/orders and NEVER the staff roster', async () => {
    // `GET /orders` is `OrdersController` — `BillingRead`, which no member holds.
    // The deleted app reached for that surface and 403'd; this asserts the
    // member-safe route by its URL rather than only by the endpoint table.
    const calls = stubFetch(PAGE);
    await listMyOrders();
    expect((calls[0] as Call).url).not.toBe(`${env.apiUrl}/orders`);
    expect((calls[0] as Call).url.endsWith('/me/orders')).toBe(true);
  });

  it('rejects rather than resolving an error body as a page', async () => {
    // D7: non-2xx throws. A 403 resolved as `{}` would render as "no orders".
    stubFetch({ message: 'Forbidden' }, 403);
    await expect(listMyOrders()).rejects.toThrow();
  });
});
