import { NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearSessionCookies,
  legacySessionClearHeaders,
  sessionCookieOptions,
} from './session-cookies';
import { setSessionCookies } from './session-refresh';

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Every `Set-Cookie` a response carries. */
function setCookies(res: NextResponse): string[] {
  return res.headers.getSetCookie();
}

describe('sessionCookieOptions', () => {
  it('is host-only even when a cookie domain is configured', () => {
    vi.stubEnv('COOKIE_DOMAIN', '.formacore.io');
    expect(sessionCookieOptions(60)).not.toHaveProperty('domain');
  });
});

describe('legacySessionClearHeaders', () => {
  it('is empty without a configured cookie domain', () => {
    vi.stubEnv('COOKIE_DOMAIN', '');
    vi.stubEnv('NEXT_PUBLIC_COOKIE_DOMAIN', '');
    expect(legacySessionClearHeaders()).toEqual([]);
  });

  it('expires both cookies on the legacy parent domain', () => {
    vi.stubEnv('NEXT_PUBLIC_COOKIE_DOMAIN', '.formacore.io');
    const headers = legacySessionClearHeaders();
    expect(headers).toHaveLength(2);
    expect(headers[0]).toMatch(/^accessToken=; Domain=\.formacore\.io; Path=\/; Max-Age=0/);
    expect(headers[1]).toMatch(/^refreshToken=; Domain=\.formacore\.io; Path=\/; Max-Age=0/);
  });
});

describe('clearSessionCookies', () => {
  it('clears the host-only cookies and the legacy parent-domain ones', () => {
    vi.stubEnv('COOKIE_DOMAIN', '.formacore.io');
    const res = NextResponse.next();
    clearSessionCookies(res);
    const cookies = setCookies(res);
    expect(cookies).toHaveLength(4);
    const hostOnly = cookies.filter((c) => !/Domain=/i.test(c));
    expect(hostOnly.map((c) => c.split('=')[0])).toEqual(['accessToken', 'refreshToken']);
    expect(hostOnly.every((c) => /Max-Age=0/.test(c))).toBe(true);
    expect(cookies.filter((c) => /Domain=\.formacore\.io/.test(c))).toHaveLength(2);
  });
});

describe('setSessionCookies', () => {
  it('writes the refreshed pair host-only and expires the legacy copy', () => {
    vi.stubEnv('COOKIE_DOMAIN', '.formacore.io');
    const res = NextResponse.next();
    setSessionCookies(res, { accessToken: 'a.b.c', refreshToken: 'rt' });
    const cookies = setCookies(res);
    const written = cookies.filter((c) => !/Domain=/i.test(c));
    expect(written.map((c) => c.split(';')[0])).toEqual(['accessToken=a.b.c', 'refreshToken=rt']);
    expect(
      cookies.filter((c) => /Domain=\.formacore\.io; Path=\/; Max-Age=0/.test(c)),
    ).toHaveLength(2);
  });
});
