import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({ value: 'downtown.formacore.io' }));

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ host: host.value })),
}));

vi.mock('./env', () => ({
  env: { NEXT_PUBLIC_ROOT_DOMAIN: 'formacore.io', NEXT_PUBLIC_API_URL: 'https://api.test' },
}));

const { getActiveGymBrand, getActiveGymPortalSkin, getActiveGymPresence } =
  await import('./active-gym');

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  host.value = 'downtown.formacore.io';
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getActiveGymPresence', () => {
  it('is found when the lookup succeeds', async () => {
    fetchMock.mockResolvedValue(new Response('{"gymId":"g1"}', { status: 200 }));
    await expect(getActiveGymPresence()).resolves.toBe('found');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.test/gyms/by-subdomain/downtown');
  });

  it('is not-found when the API says there is no such gym', async () => {
    host.value = 'typo.formacore.io';
    fetchMock.mockResolvedValue(new Response('{}', { status: 404 }));
    await expect(getActiveGymPresence()).resolves.toBe('not-found');
  });

  it('is unknown on a server error, never not-found', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 502 }));
    await expect(getActiveGymPresence()).resolves.toBe('unknown');
  });

  it('is unknown when the API is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(getActiveGymPresence()).resolves.toBe('unknown');
  });

  it('is none on a host that names no tenant, without calling the API', async () => {
    host.value = 'app.formacore.io';
    await expect(getActiveGymPresence()).resolves.toBe('none');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('the tenant lookup', () => {
  it('is never served from the data cache, so a saved setting lands on the next visit', async () => {
    // `next: { revalidate: 300 }` kept a gym's old portal colour on its own
    // sign-in screen for up to five minutes after the console said "saved".
    fetchMock.mockResolvedValue(new Response('{"gymId":"g1"}', { status: 200 }));
    await getActiveGymPresence();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit & { next?: unknown };
    expect(init.cache).toBe('no-store');
    expect(init.next).toBeUndefined();
  });
});

describe('getActiveGymPortalSkin', () => {
  const gym = (portal: Record<string, unknown>) =>
    new Response(
      JSON.stringify({
        gymId: 'g1',
        name: 'Downtown Strength',
        brand: {
          name: 'Downtown Strength',
          logoUrl: null,
          primaryColor: '#111111',
          secondaryColor: '#222222',
        },
        portal: { loginImageUrl: null, logoUrl: null, ...portal },
      }),
      { status: 200 },
    );

  it('carries the colour the gym chose, even when it equals the brand colour', async () => {
    // The console's "customise" seeds the field with the brand colour; a gym
    // that saved it there has chosen, and the lookup now says so outright.
    fetchMock.mockResolvedValue(gym({ primaryColor: '#111111', chosenPrimaryColor: '#111111' }));
    await expect(getActiveGymPortalSkin()).resolves.toMatchObject({ primaryColor: '#111111' });
  });

  it('carries nothing when the lookup says the brand is standing in', async () => {
    fetchMock.mockResolvedValue(gym({ primaryColor: '#111111', chosenPrimaryColor: null }));
    await expect(getActiveGymPortalSkin()).resolves.toMatchObject({ primaryColor: null });
  });

  it('falls back to comparing against the brand for an API that predates the field', async () => {
    fetchMock.mockResolvedValue(gym({ primaryColor: '#ff5500' }));
    await expect(getActiveGymPortalSkin()).resolves.toMatchObject({ primaryColor: '#ff5500' });
    fetchMock.mockResolvedValue(gym({ primaryColor: '#111111' }));
    await expect(getActiveGymPortalSkin()).resolves.toMatchObject({ primaryColor: null });
  });
});

describe('getActiveGymBrand', () => {
  const gym = (overrides: Record<string, unknown> = {}) =>
    new Response(
      JSON.stringify({
        gymId: 'g1',
        name: 'Downtown Strength',
        brand: {
          name: 'Downtown Strength',
          logoUrl: 'https://media.test/g1/brand/logo.png',
          primaryColor: '#111111',
          secondaryColor: '#222222',
        },
        portal: { loginImageUrl: null, logoUrl: null, primaryColor: '#ff5500' },
        ...overrides,
      }),
      { status: 200 },
    );

  it("names the host's gym, with its mark and the colour it chose", async () => {
    fetchMock.mockResolvedValue(gym());
    await expect(getActiveGymBrand()).resolves.toEqual({
      name: 'Downtown Strength',
      logoUrl: 'https://media.test/g1/brand/logo.png',
      themeColor: '#ff5500',
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.test/gyms/by-subdomain/downtown');
  });

  it('prefers the portal logo, and tints nothing when the portal only inherits the brand colour', async () => {
    fetchMock.mockResolvedValue(
      gym({
        portal: {
          loginImageUrl: null,
          logoUrl: 'https://media.test/portal.png',
          primaryColor: '#111111',
        },
      }),
    );
    await expect(getActiveGymBrand()).resolves.toEqual({
      name: 'Downtown Strength',
      logoUrl: 'https://media.test/portal.png',
      themeColor: null,
    });
  });

  it('is null for an unknown slug, without throwing', async () => {
    host.value = 'typo.formacore.io';
    fetchMock.mockResolvedValue(new Response('{"code":"GYM_NOT_FOUND"}', { status: 404 }));
    await expect(getActiveGymBrand()).resolves.toBeNull();
  });

  it('is null when the API is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(getActiveGymBrand()).resolves.toBeNull();
  });

  it('is null on a host that names no tenant, without calling the API', async () => {
    host.value = 'app.formacore.io';
    await expect(getActiveGymBrand()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
