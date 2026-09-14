import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ host: 'downtown.formacore.io' })),
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === 'accessToken' && session.token ? { name, value: session.token } : undefined,
    }),
}));

const { fetchProducts } = await import('./shop');
const { fetchClassInstances } = await import('./classes');
const { fetchServices } = await import('./services');
const { fetchTrainers } = await import('./trainers');

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  session.token = undefined;
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The one request a fetcher made: its URL and its init. */
function sentRequest(): { url: string; init: RequestInit; headers: Record<string, string> } {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, init, headers: init.headers as Record<string, string> };
}

const FETCHERS = [
  {
    name: 'fetchProducts',
    path: '/products',
    envelope: { products: [] },
    run: (signal?: AbortSignal) => fetchProducts({ gymId: 'g1', signal }),
  },
  {
    name: 'fetchClassInstances',
    path: '/class-instances',
    envelope: { instances: [] },
    run: (signal?: AbortSignal) =>
      fetchClassInstances({
        gymId: 'g1',
        from: '2026-09-14T00:00:00.000Z',
        to: '2026-09-21T00:00:00.000Z',
        signal,
      }),
  },
  {
    name: 'fetchServices',
    path: '/services',
    envelope: { services: [] },
    run: (signal?: AbortSignal) => fetchServices({ gymId: 'g1', signal }),
  },
  {
    name: 'fetchTrainers',
    path: '/trainers',
    envelope: { trainers: [] },
    run: (signal?: AbortSignal) => fetchTrainers({ gymId: 'g1', signal }),
  },
] as const;

describe.each(FETCHERS)('$name', ({ path, envelope, run }) => {
  it("forwards a signed-in member's session as a bearer token, uncached", async () => {
    session.token = 'member-jwt';
    fetchMock.mockResolvedValue(Response.json(envelope));

    await expect(run()).resolves.toEqual([]);

    const { url, init, headers } = sentRequest();
    expect(new URL(url).pathname).toBe(path);
    expect(new URL(url).searchParams.get('gymId')).toBe('g1');
    expect(headers.Authorization).toBe('Bearer member-jwt');
    expect(headers['x-tenant-host']).toBe('downtown.formacore.io');
    expect(init.cache).toBe('no-store');
  });

  it('sends no Authorization header for an anonymous visitor', async () => {
    fetchMock.mockResolvedValue(Response.json(envelope));

    await expect(run()).resolves.toEqual([]);

    const { headers, init } = sentRequest();
    expect(headers).not.toHaveProperty('Authorization');
    expect(headers['x-tenant-host']).toBe('downtown.formacore.io');
    expect(init.cache).toBe('no-store');
  });

  it("throws the API's message on a non-OK status", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ message: 'Location not found', code: 'LOCATION_NOT_FOUND' }, { status: 404 }),
    );

    await expect(run()).rejects.toThrow('Location not found');
  });

  it('rejects with an AbortError once the signal aborts', async () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => {}));
    const controller = new AbortController();

    const pending = run(controller.signal);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
