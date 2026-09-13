import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ cookies: () => Promise.resolve(new Map()) }));
vi.mock('@/lib/session', () => ({ getServerSession: () => Promise.resolve(null) }));

const { sessionCookieOptions, legacySessionClearHeaders } = await import('./session-cookies');
const { sessionCookies } = await import('./session-refresh');
const { DELETE } = await import('@/app/api/session/route');

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('sessionCookieOptions', () => {
  it('is host-only even when a cookie domain is configured', () => {
    vi.stubEnv('COOKIE_DOMAIN', '.formacore.io');
    expect(sessionCookieOptions(60)).not.toHaveProperty('domain');
    expect(sessionCookies({ accessToken: 'a.b.c', refreshToken: 'rt' })).toSatisfy(
      (cookies: Array<{ options: object }>) => cookies.every((c) => !('domain' in c.options)),
    );
  });
});

describe('legacySessionClearHeaders', () => {
  it('is empty without a configured cookie domain', () => {
    vi.stubEnv('COOKIE_DOMAIN', '');
    vi.stubEnv('NEXT_PUBLIC_COOKIE_DOMAIN', '');
    expect(legacySessionClearHeaders()).toEqual([]);
  });
});

describe('DELETE /api/session', () => {
  it('clears the impersonation, the session, and the legacy parent-domain session', () => {
    vi.stubEnv('COOKIE_DOMAIN', '.formacore.io');
    const cookies = DELETE().headers.getSetCookie();
    const names = cookies.map((c) => c.split('=')[0]);
    expect(names).toEqual(
      expect.arrayContaining([
        'impersonationToken',
        'impersonationMeta',
        'accessToken',
        'refreshToken',
      ]),
    );
    // The legacy clears are raw headers; a `cookies.set` after them would have
    // wiped them, which is why the impersonation clear runs first.
    expect(cookies.filter((c) => /Domain=\.formacore\.io/.test(c))).toHaveLength(2);
  });
});
