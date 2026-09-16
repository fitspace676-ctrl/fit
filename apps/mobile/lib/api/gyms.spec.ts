import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../env';
import { ENDPOINTS } from './endpoints';
import { getGymBySubdomain } from './gyms';

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

describe('getGymBySubdomain', () => {
  it('GETs the public tenant lookup with no Authorization header', async () => {
    // Reached before a session exists. A stale Bearer would be noise the server
    // still has to parse.
    const calls = stubFetch({ gymId: 'gym_a', name: 'Downtown' });

    await expect(getGymBySubdomain({ slug: 'downtown' })).resolves.toEqual({
      gymId: 'gym_a',
      name: 'Downtown',
    });

    const call = calls[0] as Call;
    expect(call.url).toBe(`${env.apiUrl}/gyms/by-subdomain/downtown`);
    expect(call.init.headers).not.toHaveProperty('Authorization');
  });

  it('percent-encodes the slug into the path', async () => {
    const calls = stubFetch({ gymId: 'gym_a' });
    await getGymBySubdomain({ slug: 'a b' });
    expect((calls[0] as Call).url).toBe(`${env.apiUrl}/gyms/by-subdomain/a%20b`);
  });

  it('throws on an unknown slug — a 404 is the caller decision to interpret', async () => {
    stubFetch({ code: 'GYM_NOT_FOUND', message: 'Gym not found', details: null }, 404);
    await expect(getGymBySubdomain({ slug: 'nope' })).rejects.toMatchObject({
      status: 404,
      code: 'GYM_NOT_FOUND',
    });
  });
});

describe('GET /gyms', () => {
  it('has no fetcher and no endpoint — it is the SUPER_ADMIN platform roster', () => {
    // TenantGuard + @AllowCrossTenant(): `Gym` is not a tenant-scoped model, so
    // without that guard any authenticated user could read every gym.
    expect(Object.values(ENDPOINTS).map((endpoint) => endpoint.path)).not.toContain('/gyms');
  });
});
