import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../env';
import { classOccupancyStreamUrl, getClass, listClasses } from './classes';

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

describe('listClasses', () => {
  it('GETs the schedule with gymId and the window on the query string', async () => {
    const calls = stubFetch({ instances: [] });

    await expect(listClasses({ gymId: 'gym_a', ...WINDOW })).resolves.toEqual({ instances: [] });

    const call = calls[0] as Call;
    expect(call.init.method).toBe('GET');
    expect(call.url).toBe(
      `${env.apiUrl}/class-instances?gymId=gym_a&from=${encodeURIComponent(WINDOW.from)}&to=${encodeURIComponent(WINDOW.to)}`,
    );
  });

  it('drops an absent view rather than sending the string "undefined"', async () => {
    const calls = stubFetch({ instances: [] });
    await listClasses({ gymId: 'gym_a', ...WINDOW });
    expect((calls[0] as Call).url).not.toContain('view');
  });

  it('sends the view hint when given', async () => {
    const calls = stubFetch({ instances: [] });
    await listClasses({ gymId: 'gym_a', ...WINDOW, view: 'week' });
    expect((calls[0] as Call).url).toContain('view=week');
  });
});

describe('getClass', () => {
  it('puts the id in the path and the gym on the query string', async () => {
    const calls = stubFetch({ instance: { id: 'ci_1' } });

    await getClass({ classId: 'ci_1', gymId: 'gym_a' });

    expect((calls[0] as Call).url).toBe(`${env.apiUrl}/class-instances/ci_1?gymId=gym_a`);
  });

  it('percent-encodes an id so a stray slash cannot forge a path segment', async () => {
    const calls = stubFetch({ instance: {} });
    await getClass({ classId: 'a/b', gymId: 'gym_a' });
    expect((calls[0] as Call).url).toContain('/class-instances/a%2Fb?');
  });
});

describe('classOccupancyStreamUrl', () => {
  it('builds the SSE URL without opening a connection', () => {
    // A URL, not a request: the route is a Nest @Sse() handler and the socket is
    // opened by the screen layer with react-native-sse, which nothing under
    // lib/ may import.
    const mock = stubFetch();
    expect(classOccupancyStreamUrl('gym_a')).toBe(
      `${env.apiUrl}/class-instances/occupancy/stream?gymId=gym_a`,
    );
    expect(mock).toHaveLength(0);
  });
});
