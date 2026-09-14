import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPassword } from './auth';

describe('resetPassword', () => {
  let fetchMock: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;

  const reply = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status });

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', 'formacore.io');
    vi.stubEnv('NEXT_PUBLIC_DEV_GYM_SLUG', '');
    // The browser page the reset form runs on.
    vi.stubGlobal('window', { location: { host: 'riverside.formacore.io' } });
    fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(reply({})),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("names the page's gym host and stores an issued session", async () => {
    fetchMock.mockResolvedValueOnce(
      reply({ accessToken: 'a', refreshToken: 'r', sessionIssued: true }),
    );

    const result = await resetPassword('tok', 'brand-new-secret');

    expect(result).toEqual({ accessToken: 'a', refreshToken: 'r', sessionIssued: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:3000/auth/reset-password');
    expect(new Headers(init?.headers).get('x-tenant-host')).toBe('riverside.formacore.io');
    expect(JSON.parse(init?.body as string)).toEqual({
      token: 'tok',
      password: 'brand-new-secret',
    });

    const [sessionUrl, sessionInit] = fetchMock.mock.calls[1]!;
    expect(sessionUrl).toBe('/api/session');
    expect(JSON.parse(sessionInit?.body as string)).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
    });
  });

  it('stores nothing when the API issued no session on this gym', async () => {
    fetchMock.mockResolvedValueOnce(reply({ ok: true, sessionIssued: false }));

    const result = await resetPassword('tok', 'brand-new-secret');

    expect(result).toEqual({ ok: true, sessionIssued: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws the API's message on a rejected token", async () => {
    fetchMock.mockResolvedValueOnce(
      reply({ message: 'Reset token is invalid or has expired' }, 400),
    );

    await expect(resetPassword('tok', 'brand-new-secret')).rejects.toThrow(
      'Reset token is invalid or has expired',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
