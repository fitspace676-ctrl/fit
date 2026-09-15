import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({ value: 'downtown.formacore.io' }));

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ host: host.value })),
}));

vi.mock('./env', () => ({
  env: { NEXT_PUBLIC_ROOT_DOMAIN: 'formacore.io', NEXT_PUBLIC_API_URL: 'https://api.test/' },
}));

const { getActiveGymBrand } = await import('./active-gym');

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  host.value = 'downtown.formacore.io';
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const gym = (brand: Record<string, unknown>) =>
  new Response(
    JSON.stringify({
      gymId: 'g1',
      name: 'Downtown Strength',
      brand: { name: 'Downtown Strength', secondaryColor: '#222222', ...brand },
      portal: {
        loginImageUrl: null,
        logoUrl: 'https://media.test/portal.png',
        primaryColor: '#ff5500',
      },
    }),
    { status: 200 },
  );

describe('getActiveGymBrand', () => {
  it("names the host's gym, with its brand mark and colour", async () => {
    fetchMock.mockResolvedValue(
      gym({ logoUrl: 'https://media.test/logo.png', primaryColor: '#111111' }),
    );
    await expect(getActiveGymBrand()).resolves.toEqual({
      name: 'Downtown Strength',
      logoUrl: 'https://media.test/logo.png',
      themeColor: '#111111',
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.test/gyms/by-subdomain/downtown');
  });

  it('falls back to the portal logo, and drops a colour that is not a hex', async () => {
    fetchMock.mockResolvedValue(gym({ logoUrl: null, primaryColor: 'red;}' }));
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
    host.value = 'formacore.io';
    await expect(getActiveGymBrand()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
