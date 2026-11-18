import { describe, expect, it, vi } from 'vitest';

vi.mock('../../config/env', () => ({ env: { PLATFORM_ROOT_DOMAIN: 'fit.ge' } }));

import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Role } from '@fit/db';
import { TenantMiddleware, extractBearerToken, type RequestWithUser } from './tenant.middleware';
import { tenantStorage, type TenantState } from './tenant.context';
import type { TokenService, VerifiedAccessClaims } from '../../auth/token.service';

function makeMiddleware(verify: (token: string) => VerifiedAccessClaims): TenantMiddleware {
  const tokens = {
    verifyAccessToken: vi.fn(verify),
    assertSessionActive: vi.fn().mockResolvedValue(undefined),
  } as unknown as TokenService;
  return new TenantMiddleware(tokens);
}

function request(authorization?: string): RequestWithUser {
  return { headers: authorization ? { authorization } : {} } as unknown as RequestWithUser;
}

describe('extractBearerToken', () => {
  it('pulls the token out of a Bearer header', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });
  it('is case-insensitive on the scheme', () => {
    expect(extractBearerToken('bearer xyz')).toBe('xyz');
  });
  it('returns null for a missing or non-Bearer header', () => {
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken('Basic abc')).toBeNull();
    expect(extractBearerToken('Bearer ')).toBeNull();
  });
});

describe('TenantMiddleware', () => {
  it('rejects a request with no bearer token (401) without verifying', async () => {
    const verify = vi.fn();
    const middleware = makeMiddleware(verify);
    await expect(middleware.use(request(), {} as never, () => undefined)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(verify).not.toHaveBeenCalled();
  });

  it('establishes the tenant from gymId + role claims and runs next inside the ALS store', async () => {
    const middleware = makeMiddleware(() => ({ sub: 'u-1', role: 'MANAGER', gymId: 'gym-a' }));
    const req = request('Bearer t');
    let observed: TenantState | undefined;

    await middleware.use(req, {} as never, () => {
      observed = tenantStorage.getStore();
    });

    expect(req.user).toEqual({ userId: 'u-1', role: Role.MANAGER, gymId: 'gym-a' });
    expect(observed).toEqual({
      userId: 'u-1',
      gymId: 'gym-a',
      role: Role.MANAGER,
      allowCrossTenant: false,
    });
  });

  it('accepts the CLI `gym` slug claim as the tenant id', async () => {
    const middleware = makeMiddleware(() => ({ sub: 'u-1', role: 'MEMBER', gym: 'gym-slug' }));
    const req = request('Bearer t');
    await middleware.use(req, {} as never, () => undefined);
    expect(req.user?.gymId).toBe('gym-slug');
  });

  it('defaults the role to MEMBER and the gym to null when claims are absent', async () => {
    const middleware = makeMiddleware(() => ({ sub: 'u-1' }));
    const req = request('Bearer t');
    let observed: TenantState | undefined;
    await middleware.use(req, {} as never, () => {
      observed = tenantStorage.getStore();
    });
    expect(observed).toEqual({
      userId: 'u-1',
      gymId: null,
      role: Role.MEMBER,
      allowCrossTenant: false,
    });
  });

  it('403s TENANT_MISMATCH (without opening a store) when the host names another gym', async () => {
    const middleware = makeMiddleware(() => ({
      sub: 'u-1',
      role: 'MEMBER',
      gymId: 'gym-a',
      gymSlug: 'downtown',
    }));
    const req = {
      headers: { authorization: 'Bearer t', 'x-tenant-host': 'riverside.fit.ge' },
    } as unknown as RequestWithUser;
    const next = vi.fn();

    await expect(middleware.use(req, {} as never, next)).rejects.toThrow(ForbiddenException);
    expect(next).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('lets the session through on its own gym’s host', async () => {
    const middleware = makeMiddleware(() => ({ sub: 'u-1', gymId: 'gym-a', gymSlug: 'downtown' }));
    const req = {
      headers: { authorization: 'Bearer t', host: 'downtown.fit.ge' },
    } as unknown as RequestWithUser;
    const next = vi.fn();

    await middleware.use(req, {} as never, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('propagates a verification failure (401)', async () => {
    const middleware = makeMiddleware(() => {
      throw new UnauthorizedException();
    });
    await expect(
      middleware.use(request('Bearer bad'), {} as never, () => undefined),
    ).rejects.toThrow(UnauthorizedException);
  });
});

it('does not establish an identity when the persisted session has been revoked', async () => {
  const tokens = {
    verifyAccessToken: vi.fn().mockReturnValue({ sub: 'u1', tokenVersion: 0 }),
    assertSessionActive: vi.fn().mockRejectedValue(new UnauthorizedException()),
  } as unknown as TokenService;
  const next = vi.fn();
  const req = request('Bearer old');
  await expect(new TenantMiddleware(tokens).use(req, {} as never, next)).rejects.toBeInstanceOf(
    UnauthorizedException,
  );
  expect(req.user).toBeUndefined();
  expect(next).not.toHaveBeenCalled();
});
