import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../env';
import { ENDPOINTS } from './endpoints';
import {
  bookServiceSession,
  listMyServiceSessions,
  listServiceSlots,
  listServices,
} from './service-sessions';

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

afterEach(() => {
  vi.unstubAllGlobals();
});

const WINDOW = { from: '2026-09-01T00:00:00.000Z', to: '2026-09-08T00:00:00.000Z' };

describe('listServices', () => {
  it('GETs the public catalogue scoped by gymId', async () => {
    const calls = stubFetch({ services: [] });
    await listServices({ gymId: 'gym_a' });
    expect((calls[0] as Call).url).toBe(`${env.apiUrl}/services?gymId=gym_a`);
  });
});

describe('listServiceSlots', () => {
  it('GETs the public slot listing with the window', async () => {
    const calls = stubFetch({ slots: [] });

    await listServiceSlots({ gymId: 'gym_a', ...WINDOW });

    expect((calls[0] as Call).url).toBe(
      `${env.apiUrl}/service-sessions?gymId=gym_a&from=${encodeURIComponent(WINDOW.from)}&to=${encodeURIComponent(WINDOW.to)}`,
    );
  });

  it('narrows to one service when asked', async () => {
    const calls = stubFetch({ slots: [] });
    await listServiceSlots({ gymId: 'gym_a', serviceId: 'svc_1', ...WINDOW });
    expect((calls[0] as Call).url).toContain('serviceId=svc_1');
  });
});

describe('the member routes', () => {
  it('lists the caller sessions from /me/service-sessions', async () => {
    const calls = stubFetch({ sessions: [] });
    await listMyServiceSessions();
    expect((calls[0] as Call).url).toBe(`${env.apiUrl}/me/service-sessions`);
  });

  it('books a slot with a POST and no body', async () => {
    const calls = stubFetch({ session: { id: 'ss_1' } });

    await bookServiceSession({ sessionId: 'ss_1' });

    const call = calls[0] as Call;
    expect(call.init.method).toBe('POST');
    expect(call.url).toBe(`${env.apiUrl}/me/service-sessions/ss_1/book`);
    expect(call.init.body).toBeUndefined();
  });
});

describe('the admin controller in the same API file', () => {
  it('is absent from ENDPOINTS — it is ClassRead / ClassWrite, which a MEMBER lacks', () => {
    const paths = Object.values(ENDPOINTS).map((endpoint) => endpoint.path);
    expect(paths).not.toContain('/admin/service-sessions');
    expect(paths.some((path) => path.startsWith('/admin/'))).toBe(false);
  });
});
