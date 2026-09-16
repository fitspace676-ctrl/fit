import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../env';
import { getCatalogue, listLocations, listPackages, listProducts } from './catalogue';

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

describe('the public catalogues', () => {
  it.each([
    { name: 'products', run: () => listProducts({ gymId: 'gym_a' }), url: '/products?gymId=gym_a' },
    { name: 'packages', run: () => listPackages({ gymId: 'gym_a' }), url: '/packages?gymId=gym_a' },
    {
      name: 'locations',
      run: () => listLocations({ gymId: 'gym_a' }),
      url: '/locations?gymId=gym_a',
    },
    {
      name: 'catalogue',
      run: () => getCatalogue({ gymId: 'gym_a' }),
      url: '/catalogue?gymId=gym_a',
    },
  ])('$name is a GET scoped by an explicit gymId', async ({ run, url }) => {
    const calls = stubFetch();

    await run();

    const call = calls[0] as Call;
    expect(call.init.method).toBe('GET');
    expect(call.url).toBe(`${env.apiUrl}${url}`);
  });

  it('narrows packages and the catalogue by location when one is chosen', async () => {
    const packages = stubFetch();
    await listPackages({ gymId: 'gym_a', locationId: 'loc_1' });
    expect((packages[0] as Call).url).toBe(`${env.apiUrl}/packages?gymId=gym_a&locationId=loc_1`);

    vi.unstubAllGlobals();
    const catalogue = stubFetch();
    await getCatalogue({ gymId: 'gym_a', locationId: 'loc_1' });
    expect((catalogue[0] as Call).url).toBe(`${env.apiUrl}/catalogue?gymId=gym_a&locationId=loc_1`);
  });

  it('treats an empty list as a normal result, not an error', async () => {
    // A gym with nothing configured is a 200 with empty arrays; the screens
    // render their empty state. Only a *throw* would put an error UI on screen.
    stubFetch({ products: [] });
    await expect(listProducts({ gymId: 'gym_a' })).resolves.toEqual({ products: [] });
  });
});
