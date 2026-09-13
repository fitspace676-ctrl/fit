import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { middleware } from './middleware';

const SECRET = 'test-secret';

/** A signed HS256 access token, as the API mints them. */
async function accessToken(claims: Record<string, unknown>): Promise<string> {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    type: 'access',
    exp: Math.floor(Date.now() / 1000) + 600,
    ...claims,
  })}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return `${body}.${Buffer.from(signature).toString('base64url')}`;
}

/** A console request as it arrives behind the web app's `/admin` rewrite. */
function request(path: string, cookie: string, headers: Record<string, string> = {}) {
  return new NextRequest(`https://fit-admin.vercel.app${path}`, {
    headers: {
      host: 'fit-admin.vercel.app',
      'x-forwarded-host': 'downtown.formacore.io',
      'x-forwarded-proto': 'https',
      cookie,
      ...headers,
    },
  });
}

const cleared = (res: Response, name: string) =>
  res.headers.getSetCookie().filter((c) => c.startsWith(`${name}=;`));

beforeEach(() => {
  vi.stubEnv('JWT_SECRET', SECRET);
  vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', 'formacore.io');
  vi.stubEnv('COOKIE_DOMAIN', '.formacore.io');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('admin middleware — wrong-gym sessions', () => {
  it('lets staff through on their own gym’s host', async () => {
    const token = await accessToken({ sub: 'u1', role: 'OWNER', gymSlug: 'downtown' });
    const res = await middleware(request('/members', `accessToken=${token}`));
    expect(res.headers.get('location')).toBeNull();
  });

  it('sends another gym’s session to this host’s sign-in, clearing it everywhere', async () => {
    const token = await accessToken({ sub: 'u1', role: 'OWNER', gymSlug: 'riverside' });
    const res = await middleware(request('/members?page=2', `accessToken=${token}`));
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.origin).toBe('https://downtown.formacore.io');
    expect(location.pathname).toBe('/admin/login');
    expect(location.searchParams.get('from')).toBe('/admin/members?page=2');
    // Host-only and legacy parent-domain copies of both cookies.
    expect(cleared(res, 'accessToken')).toHaveLength(2);
    expect(cleared(res, 'refreshToken')).toHaveLength(2);
  });

  it('drops only the impersonation when that is what names another gym', async () => {
    const token = await accessToken({ sub: 'owner', role: 'OWNER', gymSlug: 'riverside' });
    const res = await middleware(request('/members', `impersonationToken=${token}`));
    expect(new URL(res.headers.get('location') ?? '').pathname).toBe('/admin/login');
    expect(cleared(res, 'impersonationToken')).toHaveLength(1);
    expect(cleared(res, 'accessToken')).toHaveLength(0);
  });

  it('compares nothing on a host that names no gym, or for a token without the claim', async () => {
    const other = await accessToken({ sub: 'u1', role: 'OWNER', gymSlug: 'riverside' });
    const onApp = await middleware(
      request('/members', `accessToken=${other}`, { 'x-forwarded-host': 'app.formacore.io' }),
    );
    expect(onApp.headers.get('location')).toBeNull();

    const legacy = await accessToken({ sub: 'u1', role: 'OWNER', gymId: 'g-riverside' });
    const noClaim = await middleware(request('/members', `accessToken=${legacy}`));
    expect(noClaim.headers.get('location')).toBeNull();
  });

  it('clears the session on the sign-in page when the API refused it', async () => {
    const res = await middleware(request('/login?reason=tenant', 'accessToken=whatever'));
    expect(res.headers.get('location')).toBeNull();
    expect(cleared(res, 'accessToken')).toHaveLength(2);
    expect(cleared(res, 'impersonationToken')).toHaveLength(1);
  });

  it('leaves an ordinary visit to the sign-in page alone', async () => {
    const token = await accessToken({ sub: 'u1', role: 'OWNER', gymSlug: 'downtown' });
    const res = await middleware(request('/login', `accessToken=${token}`));
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it('refreshes with the tenant host and refuses a pair minted for another gym', async () => {
    const renewed = await accessToken({ sub: 'u1', role: 'OWNER', gymSlug: 'riverside' });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ accessToken: renewed, refreshToken: 'rt2' }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await middleware(
      request('/members', 'refreshToken=rt', { 'sec-fetch-dest': 'document' }),
    );

    const init = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get('x-tenant-host')).toBe('downtown.formacore.io');
    expect(new URL(res.headers.get('location') ?? '').pathname).toBe('/admin/login');
    expect(res.headers.getSetCookie().some((c) => c.startsWith('refreshToken=rt2'))).toBe(false);
  });

  it('writes a matching refreshed pair host-only and expires the legacy copy', async () => {
    const renewed = await accessToken({ sub: 'u1', role: 'OWNER', gymSlug: 'downtown' });
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ accessToken: renewed, refreshToken: 'rt2' })),
    );

    const res = await middleware(
      request('/members', 'refreshToken=rt', { 'sec-fetch-dest': 'document' }),
    );

    const cookies = res.headers.getSetCookie();
    expect(res.headers.get('location')).toBeNull();
    expect(cookies.find((c) => c.startsWith('refreshToken=rt2'))).not.toMatch(/Domain=/i);
    expect(cleared(res, 'refreshToken')).toHaveLength(1);
  });
});
