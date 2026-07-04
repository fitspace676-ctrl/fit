import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEnv } = vi.hoisted(() => {
  const mockEnv: Record<string, unknown> = {};
  return { mockEnv };
});
vi.mock('../config/env', () => ({ env: mockEnv }));

import { ExpoPushService } from './expo-push.service';
import type { ExpoPushMessage } from './expo-push.service';

function configure(overrides: Record<string, unknown> = {}): void {
  for (const key of Object.keys(mockEnv)) delete mockEnv[key];
  Object.assign(mockEnv, { EXPO_PUSH_ENABLED: false }, overrides);
}

const MESSAGES: ExpoPushMessage[] = [
  { to: 'ExponentPushToken[a]', title: 'Hello', body: 'World', data: { href: '/bookings' } },
];

describe('ExpoPushService', () => {
  let fetchMock: ReturnType<typeof vi.fn<(url: string, init: RequestInit) => Promise<Response>>>;

  beforeEach(() => {
    configure();
    fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }), { status: 200 }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('is unconfigured and no-ops (resolving { sent: false }) when EXPO_PUSH_ENABLED is not true', async () => {
    const push = new ExpoPushService();
    expect(push.isConfigured).toBe(false);

    const result = await push.send(MESSAGES);

    expect(result).toEqual({ sent: false, tickets: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no-ops on an empty batch without touching the network, even when enabled', async () => {
    configure({ EXPO_PUSH_ENABLED: true });
    const push = new ExpoPushService();

    const result = await push.send([]);

    expect(result).toEqual({ sent: false, tickets: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs the batch to Expo and returns the per-message tickets', async () => {
    configure({ EXPO_PUSH_ENABLED: true });
    const push = new ExpoPushService();

    const result = await push.send(MESSAGES);

    expect(result).toEqual({ sent: true, tickets: [{ status: 'ok', id: 'ticket-1' }] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://exp.host/--/api/v2/push/send');
    expect(init.method).toBe('POST');
    // No access token configured → no Authorization header.
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    const body = JSON.parse(init.body as string) as unknown[];
    expect(body).toEqual(MESSAGES);
  });

  it('sends the Expo access token as a Bearer header when configured', async () => {
    configure({ EXPO_PUSH_ENABLED: true, EXPO_ACCESS_TOKEN: 'expo_abc' });
    const push = new ExpoPushService();

    await push.send(MESSAGES);

    const init = fetchMock.mock.calls[0]![1];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer expo_abc');
  });

  it('throws when Expo returns a non-2xx response', async () => {
    configure({ EXPO_PUSH_ENABLED: true });
    fetchMock.mockResolvedValue(new Response('rate limited', { status: 429 }));
    const push = new ExpoPushService();

    await expect(push.send(MESSAGES)).rejects.toThrow(/429/);
  });

  it('resolves { sent: true } with empty tickets when Expo returns no data array', async () => {
    configure({ EXPO_PUSH_ENABLED: true });
    fetchMock.mockResolvedValue(new Response('not json', { status: 200 }));
    const push = new ExpoPushService();

    const result = await push.send(MESSAGES);
    expect(result).toEqual({ sent: true, tickets: [] });
  });
});
