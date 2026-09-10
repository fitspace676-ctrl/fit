import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../env';
import {
  getUnreadCount,
  listNotifications,
  markNotificationsRead,
  registerPushToken,
  unregisterPushToken,
} from './notifications';

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
      return new Response(status === 204 ? null : JSON.stringify(body), {
        status,
        headers: status === 204 ? {} : { 'Content-Type': 'application/json' },
      });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listNotifications', () => {
  it('GETs the inbox with no query when unpaginated', async () => {
    const calls = stubFetch({ data: [], total: 0, page: 1, limit: 20, unread: 0 });
    await listNotifications();
    expect((calls[0] as Call).url).toBe(`${env.apiUrl}/notifications`);
  });

  it('sends page, limit and unreadOnly when given', async () => {
    const calls = stubFetch({ data: [], total: 0, page: 2, limit: 5, unread: 3 });
    await listNotifications({ page: 2, limit: 5, unreadOnly: true });
    expect((calls[0] as Call).url).toBe(
      `${env.apiUrl}/notifications?page=2&limit=5&unreadOnly=true`,
    );
  });
});

describe('getUnreadCount', () => {
  it('GETs the badge count', async () => {
    const calls = stubFetch({ unread: 3 });
    await expect(getUnreadCount()).resolves.toEqual({ unread: 3 });
    expect((calls[0] as Call).url).toBe(`${env.apiUrl}/notifications/unread-count`);
  });
});

describe('markNotificationsRead', () => {
  it('marks all read with an empty body when called with no ids', async () => {
    const calls = stubFetch({ updated: 4, unread: 0 });

    await markNotificationsRead();

    const call = calls[0] as Call;
    expect(call.init.method).toBe('POST');
    expect(call.url).toBe(`${env.apiUrl}/notifications/mark-read`);
    expect(JSON.parse(call.init.body as string)).toEqual({});
  });

  it('marks specific ids when given', async () => {
    const calls = stubFetch({ updated: 1, unread: 2 });
    await markNotificationsRead({ ids: ['n_1'] });
    expect(JSON.parse((calls[0] as Call).init.body as string)).toEqual({ ids: ['n_1'] });
  });
});

describe('push token registration', () => {
  it('POSTs the token, deviceId and platform', async () => {
    const calls = stubFetch({ id: 'pt_1' }, 201);

    await registerPushToken({ token: 'ExponentPushToken[x]', deviceId: 'dev_1', platform: 'ios' });

    const call = calls[0] as Call;
    expect(call.url).toBe(`${env.apiUrl}/notifications/push-token`);
    expect(JSON.parse(call.init.body as string)).toEqual({
      token: 'ExponentPushToken[x]',
      deviceId: 'dev_1',
      platform: 'ios',
    });
  });

  it('resolves a 204 unregister to undefined instead of choking on an empty body', async () => {
    const calls = stubFetch(undefined, 204);

    await expect(unregisterPushToken({ deviceId: 'dev 1' })).resolves.toBeUndefined();

    const call = calls[0] as Call;
    expect(call.init.method).toBe('DELETE');
    expect(call.url).toBe(`${env.apiUrl}/notifications/push-token/dev%201`);
  });
});
