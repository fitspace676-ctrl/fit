import { describe, expect, it, vi } from 'vitest';
import {
  type ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { Role } from '@fit/db';
import { TenantGuard } from './tenant.guard';
import { TenantContext, tenantStorage, type TenantState } from './tenant.context';

function state(overrides: Partial<TenantState> = {}): TenantState {
  return {
    userId: 'u-1',
    gymId: 'gym-a',
    role: Role.MEMBER,
    allowCrossTenant: false,
    ...overrides,
  };
}

/** Build an ExecutionContext exposing a request with the given path params. */
function executionContext(params: Record<string, string> = {}): ExecutionContext {
  const request = { params };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

function makeGuard(allowCrossTenant: boolean): TenantGuard {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(allowCrossTenant),
  } as unknown as Reflector;
  return new TenantGuard(reflector, new TenantContext());
}

describe('TenantGuard', () => {
  it('throws 401 when no tenant was established (middleware did not run)', () => {
    const guard = makeGuard(false);
    expect(() => guard.canActivate(executionContext())).toThrow(UnauthorizedException);
  });

  it('allows a same-tenant request through', () => {
    const guard = makeGuard(false);
    const ok = tenantStorage.run(state(), () => guard.canActivate(executionContext()));
    expect(ok).toBe(true);
  });

  it('returns 404 (not 403) when a :gymId path param targets another tenant', () => {
    const guard = makeGuard(false);
    const run = () =>
      tenantStorage.run(state({ gymId: 'gym-a' }), () =>
        guard.canActivate(executionContext({ gymId: 'gym-b' })),
      );
    expect(run).toThrow(NotFoundException);
  });

  it('allows a matching :gymId path param', () => {
    const guard = makeGuard(false);
    const ok = tenantStorage.run(state({ gymId: 'gym-a' }), () =>
      guard.canActivate(executionContext({ gymId: 'gym-a' })),
    );
    expect(ok).toBe(true);
  });

  describe('@AllowCrossTenant', () => {
    it('lets a SUPER_ADMIN through and flips allowCrossTenant on the tenant state', () => {
      const guard = makeGuard(true);
      const ctx = state({ role: Role.SUPER_ADMIN, gymId: null });
      const ok = tenantStorage.run(ctx, () => guard.canActivate(executionContext()));
      expect(ok).toBe(true);
      expect(ctx.allowCrossTenant).toBe(true);
    });

    it('rejects a non-SUPER_ADMIN with 403 and never flips the bypass flag', () => {
      const guard = makeGuard(true);
      const ctx = state({ role: Role.OWNER });
      const run = () => tenantStorage.run(ctx, () => guard.canActivate(executionContext()));
      expect(run).toThrow(ForbiddenException);
      expect(ctx.allowCrossTenant).toBe(false);
    });
  });
});
