import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../env';
import { enrollSubscription, freezeSubscription, unfreezeSubscription } from './subscriptions';

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

function bodyOf(call: Call): unknown {
  return JSON.parse(call.init.body as string);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('enrollSubscription', () => {
  it('sends only the planId — never a member id or a price', async () => {
    // The member comes from the session and the terms are snapshotted from the
    // plan server-side, so a tampered body cannot buy someone else a membership
    // or set its own price.
    const calls = stubFetch({ subscriptionId: 's_1' }, 201);

    await enrollSubscription({ planId: 'plan_1' });

    const call = calls[0] as Call;
    expect(call.init.method).toBe('POST');
    expect(call.url).toBe(`${env.apiUrl}/subscriptions`);
    expect(bodyOf(call)).toEqual({ planId: 'plan_1' });
  });

  it('surfaces ALREADY_SUBSCRIBED as a 409 ApiError', async () => {
    stubFetch({ code: 'ALREADY_SUBSCRIBED', message: 'no', details: null }, 409);
    await expect(enrollSubscription({ planId: 'plan_1' })).rejects.toMatchObject({
      status: 409,
      code: 'ALREADY_SUBSCRIBED',
    });
  });
});

describe('freezeSubscription', () => {
  it('POSTs the window to the subscription path', async () => {
    const calls = stubFetch({ frozenUntil: '2026-10-01T00:00:00.000Z' });

    await freezeSubscription({
      subscriptionId: 's_1',
      startDate: '2026-09-10T00:00:00.000Z',
      durationDays: 7,
    });

    const call = calls[0] as Call;
    expect(call.url).toBe(`${env.apiUrl}/subscriptions/s_1/freeze`);
    // The subscription id belongs in the path, not the body.
    expect(bodyOf(call)).toEqual({ startDate: '2026-09-10T00:00:00.000Z', durationDays: 7 });
  });
});

describe('unfreezeSubscription', () => {
  it('POSTs with no body', async () => {
    const calls = stubFetch({ newPeriodEnd: '2026-11-01T00:00:00.000Z' });

    await unfreezeSubscription({ subscriptionId: 's_1' });

    const call = calls[0] as Call;
    expect(call.url).toBe(`${env.apiUrl}/subscriptions/s_1/unfreeze`);
    expect(call.init.body).toBeUndefined();
  });
});
