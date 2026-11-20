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

function request(path: string, cookie: string, headers: Record<string, string> = {}) {
  return new NextRequest(`https://fit-web.vercel.app${path}`, {
    headers: {
      host: 'fit-web.vercel.app',
      'x-forwarded-host': 'downtown.formacore.io',
      cookie,
      ...headers,
    },
  });
}

beforeEach(() => {
  vi.stubEnv('JWT_SECRET', SECRET);
  vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', 'formacore.io');
  vi.stubEnv('NEXT_PUBLIC_DEV_GYM_SLUG', '');
  vi.stubEnv('COOKIE_DOMAIN', '.formacore.io');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('web middleware — wrong-gym sessions', () => {
  it('lets a session through on its own gym’s host', async () => {
    const token = await accessToken({ sub: 'u1', role: 'MEMBER', gymSlug: 'downtown' });
    const res = await middleware(request('/ka/member/home', `memberAccessToken=${token}`));
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.getSetCookie().some((c) => c.startsWith('memberAccessToken='))).toBe(false);
  });

  it('sends another gym’s session to this host’s sign-in, clearing it', async () => {
    const token = await accessToken({ sub: 'u1', role: 'MEMBER', gymSlug: 'riverside' });
    const res = await middleware(
      request('/ka/member/home', `memberAccessToken=${token}; memberRefreshToken=rt`),
    );
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.pathname).toBe('/ka/member/login');
    const cookies = res.headers.getSetCookie();
    expect(cookies.filter((c) => /^memberAccessToken=;/.test(c))).toHaveLength(2);
    expect(cookies.filter((c) => /^memberRefreshToken=;/.test(c))).toHaveLength(2);
    expect(cookies.some((c) => /Domain=\.formacore\.io/.test(c))).toBe(true);
  });

  it('clears it on the sign-in page without redirecting (no loop)', async () => {
    const token = await accessToken({ sub: 'u1', role: 'MEMBER', gymSlug: 'riverside' });
    const res = await middleware(request('/ka/member/login', `memberAccessToken=${token}`));
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.getSetCookie().filter((c) => /^memberAccessToken=;/.test(c))).toHaveLength(
      2,
    );
  });

  it('compares nothing on a host that names no gym', async () => {
    const token = await accessToken({ sub: 'u1', role: 'MEMBER', gymSlug: 'riverside' });
    const res = await middleware(
      request('/ka/member/home', `memberAccessToken=${token}`, {
        'x-forwarded-host': 'app.formacore.io',
      }),
    );
    expect(res.headers.get('location')).toBeNull();
  });

  it('compares nothing for a token without the claim', async () => {
    const token = await accessToken({ sub: 'u1', role: 'MEMBER', gymId: 'g-riverside' });
    const res = await middleware(request('/ka/member/home', `memberAccessToken=${token}`));
    expect(res.headers.get('location')).toBeNull();
  });

  it('refreshes with the tenant host and drops a pair minted for another gym', async () => {
    const renewed = await accessToken({ sub: 'u1', role: 'MEMBER', gymSlug: 'riverside' });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ accessToken: renewed, refreshToken: 'rt2' }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await middleware(
      request('/ka/member/home', 'memberRefreshToken=rt', { 'sec-fetch-dest': 'document' }),
    );

    const init = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get('x-tenant-host')).toBe('downtown.formacore.io');
    expect(new URL(res.headers.get('location') ?? '').pathname).toBe('/ka/member/login');
    expect(res.headers.getSetCookie().some((c) => c.startsWith('memberRefreshToken=rt2'))).toBe(
      false,
    );
  });
});

describe('web session isolation', () => {
  it('uses its own identity when both surface sessions coexist', async () => {
    const own = await accessToken({ sub: 'own-user', role: 'MEMBER', gymSlug: 'downtown' });
    const other = await accessToken({ sub: 'other-user', role: 'OWNER', gymSlug: 'downtown' });
    const res = await middleware(
      request('/ka/member/home', `adminAccessToken=${other}; memberAccessToken=${own}`),
    );
    expect(res.headers.get('location')).toBeNull();
  });

  it('ignores the other surface and the legacy shared jar without spending their refresh tokens', async () => {
    const token = await accessToken({ sub: 'same-email-user', role: 'OWNER', gymSlug: 'downtown' });
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    const res = await middleware(
      request(
        '/ka/member/home',
        `adminAccessToken=${token}; adminRefreshToken=other-rt; accessToken=${token}; refreshToken=legacy-rt`,
        { 'sec-fetch-dest': 'document' },
      ),
    );
    expect(new URL(res.headers.get('location') ?? '').pathname).toBe('/ka/member/login');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it('rejects the wrong role even when copied into this surface cookie', async () => {
    const token = await accessToken({ sub: 'same-email-user', role: 'OWNER', gymSlug: 'downtown' });
    const res = await middleware(request('/ka/member/home', `memberAccessToken=${token}`));
    expect(new URL(res.headers.get('location') ?? '').pathname).toBe('/ka/member/login');
  });

  it('renders login with legacy cookies without a redirect loop', async () => {
    const res = await middleware(
      request('/ka/member/login', 'accessToken=legacy; refreshToken=legacy-rt'),
    );
    expect(res.headers.get('location')).toBeNull();
  });
});

describe('Flitt return routing', () => {
  it('preserves the order id on the exact provider return URL', async () => {
    const res = await middleware(request('/checkout/result?orderId=o1', ''));
    const location = new URL(res.headers.get('location')!);
    expect(location.pathname).toBe('/ka/member/checkout/result');
    expect(location.searchParams.get('orderId')).toBe('o1');
  });
  it('requires login on the result route and preserves the return destination', async () => {
    const res = await middleware(request('/en/member/checkout/result?orderId=o1', ''));
    const location = new URL(res.headers.get('location')!);
    expect(location.pathname).toBe('/en/member/login');
    expect(location.searchParams.get('from')).toBe('/en/member/checkout/result?orderId=o1');
  });
});
