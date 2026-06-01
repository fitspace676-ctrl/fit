import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { Role } from '@fit/db';
import { TenantMiddleware, extractBearerToken, type RequestWithUser } from './tenant.middleware';
import { tenantStorage, type TenantState } from './tenant.context';
import type { TokenService, VerifiedAccessClaims } from '../../auth/token.service';

function makeMiddleware(verify: (token: string) => VerifiedAccessClaims): TenantMiddleware {
  const tokens = { verifyAccessToken: vi.fn(verify) } as unknown as TokenService;
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
  it('rejects a request with no bearer token (401) without verifying', () => {
    const verify = vi.fn();
    const middleware = makeMiddleware(verify);
    expect(() => middleware.use(request(), {} as never, () => undefined)).toThrow(
      UnauthorizedException,
    );
    expect(verify).not.toHaveBeenCalled();
  });

  it('establishes the tenant from gymId + role claims and runs next inside the ALS store', () => {
    const middleware = makeMiddleware(() => ({ sub: 'u-1', role: 'MANAGER', gymId: 'gym-a' }));
    const req = request('Bearer t');
    let observed: TenantState | undefined;

    middleware.use(req, {} as never, () => {
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

  it('accepts the CLI `gym` slug claim as the tenant id', () => {
    const middleware = makeMiddleware(() => ({ sub: 'u-1', role: 'MEMBER', gym: 'gym-slug' }));
    const req = request('Bearer t');
    middleware.use(req, {} as never, () => undefined);
    expect(req.user?.gymId).toBe('gym-slug');
  });

  it('defaults the role to MEMBER and the gym to null when claims are absent', () => {
    const middleware = makeMiddleware(() => ({ sub: 'u-1' }));
    const req = request('Bearer t');
    let observed: TenantState | undefined;
    middleware.use(req, {} as never, () => {
      observed = tenantStorage.getStore();
    });
    expect(observed).toEqual({
      userId: 'u-1',
      gymId: null,
      role: Role.MEMBER,
      allowCrossTenant: false,
    });
  });

  it('propagates a verification failure (401)', () => {
    const middleware = makeMiddleware(() => {
      throw new UnauthorizedException();
    });
    expect(() => middleware.use(request('Bearer bad'), {} as never, () => undefined)).toThrow(
      UnauthorizedException,
    );
  });
});
