import { describe, expect, it, vi } from 'vitest';
import { type ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { Role } from '@fit/db';
import { RolesGuard } from './roles.guard';
import { TenantContext, tenantStorage, type TenantState } from '../tenant/tenant.context';

function state(overrides: Partial<TenantState> = {}): TenantState {
  return {
    userId: 'u-1',
    gymId: 'gym-a',
    role: Role.MEMBER,
    allowCrossTenant: false,
    ...overrides,
  };
}

const ctx = {
  switchToHttp: () => ({ getRequest: () => ({}) }),
  getHandler: () => () => undefined,
  getClass: () => class {},
} as unknown as ExecutionContext;

/** Build a guard whose reflector returns the given `@Roles` metadata. */
function makeGuard(requiredRoles: Role[] | undefined): RolesGuard {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(requiredRoles),
  } as unknown as Reflector;
  return new RolesGuard(reflector, new TenantContext());
}

describe('RolesGuard', () => {
  it('allows any request when the handler has no @Roles metadata', () => {
    const guard = makeGuard(undefined);
    const ok = tenantStorage.run(state(), () => guard.canActivate(ctx));
    expect(ok).toBe(true);
  });

  it('allows any request when @Roles is empty', () => {
    const guard = makeGuard([]);
    const ok = tenantStorage.run(state(), () => guard.canActivate(ctx));
    expect(ok).toBe(true);
  });

  it('throws 401 when no tenant was established (middleware did not run)', () => {
    const guard = makeGuard([Role.OWNER]);
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('allows a caller whose role is listed', () => {
    const guard = makeGuard([Role.OWNER, Role.MANAGER]);
    const ok = tenantStorage.run(state({ role: Role.MANAGER }), () => guard.canActivate(ctx));
    expect(ok).toBe(true);
  });

  it('rejects a caller whose role is not listed with 403', () => {
    const guard = makeGuard([Role.OWNER, Role.MANAGER]);
    const run = () =>
      tenantStorage.run(state({ role: Role.TRAINER }), () => guard.canActivate(ctx));
    expect(run).toThrow(ForbiddenException);
  });

  it('lets SUPER_ADMIN through even when not listed', () => {
    const guard = makeGuard([Role.OWNER]);
    const ok = tenantStorage.run(state({ role: Role.SUPER_ADMIN, gymId: null }), () =>
      guard.canActivate(ctx),
    );
    expect(ok).toBe(true);
  });
});
