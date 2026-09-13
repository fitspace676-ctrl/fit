import { afterEach, describe, expect, it, vi } from 'vitest';

// The tab-return renewal: no valid access cookie, a refresh cookie beside it, and
// the request arriving on a gym's host through the web app's proxy.
const { refreshTokens, verifyAccessToken } = vi.hoisted(() => ({
  refreshTokens: vi.fn(),
  verifyAccessToken: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve(new Map([['refreshToken', { value: 'rt-old' }]])),
  headers: () =>
    Promise.resolve(
      new Headers({ host: 'fit-admin.vercel.app', 'x-forwarded-host': 'downtown.formacore.io' }),
    ),
}));
vi.mock('@/lib/session', () => ({ getServerSession: () => Promise.resolve(null) }));
vi.mock('@/lib/session-refresh', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  refreshTokens,
}));
vi.mock('@/lib/auth-session', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  verifyAccessToken,
}));

const { GET } = await import('./route');

afterEach(() => {
  vi.unstubAllEnvs();
  refreshTokens.mockReset();
  verifyAccessToken.mockReset();
});

describe('GET /api/session — renewing in place', () => {
  it("renews on this host's gym and expires the legacy parent-domain session", async () => {
    vi.stubEnv('JWT_SECRET', 'secret');
    vi.stubEnv('COOKIE_DOMAIN', '.formacore.io');
    refreshTokens.mockResolvedValue({ accessToken: 'a.b.c', refreshToken: 'rt-new' });
    verifyAccessToken.mockResolvedValue({ sub: 'u1', role: 'OWNER', gymSlug: 'downtown' });

    const res = await GET();

    expect(refreshTokens).toHaveBeenCalledWith('rt-old', 'downtown.formacore.io');
    const cookies = res.headers.getSetCookie();
    // The renewed pair is host-only …
    expect(cookies.some((c) => c.startsWith('refreshToken=rt-new') && !/Domain=/i.test(c))).toBe(
      true,
    );
    // … and the parent-domain copies are expired after it, not dropped by it.
    expect(cookies.filter((c) => /Domain=\.formacore\.io/.test(c))).toHaveLength(2);
    expect(await res.json()).toMatchObject({ user: { gymSlug: 'downtown' }, recoverable: false });
  });
});
