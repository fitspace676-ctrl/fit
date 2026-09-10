import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../env';
import { ApiError } from '../http/api-error';
import { bookClass, cancelBooking, listMyBookings } from './bookings';

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

function headerOf(init: RequestInit, name: string): string | undefined {
  return (init.headers as Record<string, string> | undefined)?.[name];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('bookClass', () => {
  it('POSTs to the occurrence with no body', async () => {
    const calls = stubFetch({ bookingId: 'b_1', status: 'BOOKED' });

    await bookClass({ classId: 'ci_1' });

    const call = calls[0] as Call;
    expect(call.init.method).toBe('POST');
    expect(call.url).toBe(`${env.apiUrl}/class-instances/ci_1/bookings`);
    expect(call.init.body).toBeUndefined();
  });

  it('sends the Idempotency-Key header when given, and omits it otherwise', async () => {
    // Without a key a retried POST takes a second seat *and spends a second
    // class credit* — the header is the only thing that makes a retry safe.
    const withKey = stubFetch({ bookingId: 'b_1' });
    await bookClass({ classId: 'ci_1', idempotencyKey: 'attempt-1' });
    expect(headerOf((withKey[0] as Call).init, 'Idempotency-Key')).toBe('attempt-1');

    vi.unstubAllGlobals();
    const without = stubFetch({ bookingId: 'b_1' });
    await bookClass({ classId: 'ci_1' });
    expect(headerOf((without[0] as Call).init, 'Idempotency-Key')).toBeUndefined();
  });

  it('throws ApiError with the API code on a 409', async () => {
    stubFetch({ code: 'ALREADY_BOOKED', message: 'Already booked', details: null }, 409);

    await expect(bookClass({ classId: 'ci_1' })).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      code: 'ALREADY_BOOKED',
    });
  });

  it('rejects a blank class id in the fetcher rather than on the wire', async () => {
    const calls = stubFetch();
    await expect(bookClass({ classId: '' })).rejects.toThrow(/Missing path parameter/);
    expect(calls).toHaveLength(0);
  });
});

describe('cancelBooking', () => {
  it('DELETEs the caller booking on the occurrence', async () => {
    const calls = stubFetch({ bookingId: 'b_1', status: 'CANCELED' });

    await cancelBooking({ classId: 'ci_1' });

    const call = calls[0] as Call;
    expect(call.init.method).toBe('DELETE');
    expect(call.url).toBe(`${env.apiUrl}/class-instances/ci_1/bookings`);
  });

  it('surfaces CANCELLATION_WINDOW_PASSED as an ApiError the screen can branch on', async () => {
    stubFetch({ code: 'CANCELLATION_WINDOW_PASSED', message: 'Too late', details: null }, 409);

    const error = await cancelBooking({ classId: 'ci_1' }).catch((cause: unknown) => cause);
    expect(ApiError.is(error)).toBe(true);
    expect((error as ApiError).code).toBe('CANCELLATION_WINDOW_PASSED');
  });
});

describe('listMyBookings', () => {
  it('GETs /me/bookings with no member id on the wire', async () => {
    const calls = stubFetch({ bookings: [] });

    await listMyBookings();

    const call = calls[0] as Call;
    expect(call.init.method).toBe('GET');
    // The member is the session. A member id here would be a route that could be
    // pointed at someone else.
    expect(call.url).toBe(`${env.apiUrl}/me/bookings`);
  });

  it('sends the scope filter when given', async () => {
    const calls = stubFetch({ bookings: [] });
    await listMyBookings({ scope: 'upcoming' });
    expect((calls[0] as Call).url).toBe(`${env.apiUrl}/me/bookings?scope=upcoming`);
  });
});
