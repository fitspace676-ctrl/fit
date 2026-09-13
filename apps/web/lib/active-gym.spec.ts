import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({ value: 'downtown.formacore.io' }));

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ host: host.value })),
}));

vi.mock('./env', () => ({
  env: { NEXT_PUBLIC_ROOT_DOMAIN: 'formacore.io', NEXT_PUBLIC_API_URL: 'https://api.test' },
}));

const { getActiveGymPresence } = await import('./active-gym');

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
