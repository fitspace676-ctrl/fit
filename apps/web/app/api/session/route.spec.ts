import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/session', () => ({ getServerSession: () => Promise.resolve(null) }));

import { DELETE, POST } from './route';

const SECRET = 'session-test-secret';

function token(role: string): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: 'same-email-user',
    role,
    type: 'access',
    exp: Math.floor(Date.now() / 1000) + 600,
  })}`;
  return `${body}.${createHmac('sha256', SECRET).update(body).digest('base64url')}`;
}

function request(accessToken: string) {
  return new NextRequest('https://downtown.formacore.io/api/session', {
    method: 'POST',
    body: JSON.stringify({ accessToken, refreshToken: 'member-refresh' }),
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => vi.unstubAllEnvs());

describe('member session endpoint', () => {
  it('writes only member cookies for a verified member', async () => {
    vi.stubEnv('JWT_SECRET', SECRET);
    const res = await POST(request(token('MEMBER')));
    expect(res.status).toBe(204);
    expect(res.cookies.get('memberAccessToken')).toBeDefined();
    expect(res.cookies.get('memberRefreshToken')?.value).toBe('member-refresh');
    expect(res.headers.getSetCookie().every((cookie) => cookie.startsWith('member'))).toBe(true);
  });

  it.each(['OWNER', 'MANAGER', 'SUPER_ADMIN', 'unknown'])(
    'rejects %s before storing it',
    async (role) => {
      vi.stubEnv('JWT_SECRET', SECRET);
      const res = await POST(request(token(role)));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ code: 'NOT_A_MEMBER' });
      expect(res.headers.getSetCookie()).toEqual([]);
    },
  );

  it('rejects an untrusted signature', async () => {
    vi.stubEnv('JWT_SECRET', 'different-secret');
    expect((await POST(request(token('MEMBER')))).status).toBe(401);
  });

  it('signs out without touching staff or legacy shared cookies', () => {
    vi.stubEnv('COOKIE_DOMAIN', '.formacore.io');
    const res = DELETE();
    expect(res.headers.getSetCookie().every((cookie) => cookie.startsWith('member'))).toBe(true);
  });
});
