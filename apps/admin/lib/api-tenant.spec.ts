// `lib/api.ts` — the tenant header on every console call, and the one answer to
// the API refusing a session that belongs to another gym.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
);

vi.mock('next/navigation', () => ({ redirect }));
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: () => undefined }),
  headers: () =>
    Promise.resolve(
      new Headers({ host: 'fit-admin.vercel.app', 'x-forwarded-host': 'downtown.formacore.io' }),
    ),
}));
vi.mock('next-intl/server', () => ({ getLocale: () => Promise.resolve('ka') }));

const { ApiError, fetchMembers } = await import('./api');

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  redirect.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('console API client', () => {
  it('tells the API which gym’s host the console is on', async () => {
    fetchMock.mockResolvedValue(Response.json({ data: [], total: 0 }));
    await fetchMembers();
    const init = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get('x-tenant-host')).toBe('downtown.formacore.io');
  });

  it('sends a session from another gym back to the sign-in', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ code: 'TENANT_MISMATCH', message: 'wrong gym' }, { status: 403 }),
    );
    await expect(fetchMembers()).rejects.toThrow('NEXT_REDIRECT /login?reason=tenant');
  });

  it('still raises an ordinary 403 as an ApiError', async () => {
    fetchMock.mockResolvedValue(Response.json({ code: 'FORBIDDEN' }, { status: 403 }));
    await expect(fetchMembers()).rejects.toBeInstanceOf(ApiError);
    expect(redirect).not.toHaveBeenCalled();
  });
});
