import { describe, expect, it, vi } from 'vitest';
import { type ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { Role } from '@fit/db';
import { PermissionsGuard } from './permissions.guard';
import { Permission } from './permissions';
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

/** Build a guard whose reflector returns the given `@RequirePermissions` metadata. */
function makeGuard(required: Permission[] | undefined): PermissionsGuard {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(required),
  } as unknown as Reflector;
  return new PermissionsGuard(reflector, new TenantContext());
}

describe('PermissionsGuard', () => {
  it('allows any request when the handler has no @RequirePermissions metadata', () => {
    const guard = makeGuard(undefined);
    const ok = tenantStorage.run(state(), () => guard.canActivate(ctx));
    expect(ok).toBe(true);
  });

  it('allows any request when @RequirePermissions is empty', () => {
    const guard = makeGuard([]);
    const ok = tenantStorage.run(state(), () => guard.canActivate(ctx));
    expect(ok).toBe(true);
  });

  it('throws 401 when no tenant was established (middleware did not run)', () => {
    const guard = makeGuard([Permission.MemberRead]);
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('allows a caller whose role grants the permission', () => {
    const guard = makeGuard([Permission.MemberWrite]);
    const ok = tenantStorage.run(state({ role: Role.RECEPTIONIST }), () => guard.canActivate(ctx));
    expect(ok).toBe(true);
  });

  it('rejects a caller missing the permission with 403', () => {
    const guard = makeGuard([Permission.WorkoutWrite]);
    const run = () =>
      tenantStorage.run(state({ role: Role.RECEPTIONIST }), () => guard.canActivate(ctx));
    expect(run).toThrow(ForbiddenException);
  });

  it('requires ALL listed permissions (AND semantics)', () => {
    const guard = makeGuard([Permission.MemberWrite, Permission.WorkoutWrite]);
    // RECEPTIONIST has MemberWrite but not WorkoutWrite → rejected.
    const run = () =>
      tenantStorage.run(state({ role: Role.RECEPTIONIST }), () => guard.canActivate(ctx));
    expect(run).toThrow(ForbiddenException);
  });

  it('lets SUPER_ADMIN through for any permission', () => {
    const guard = makeGuard([Permission.GymManage, Permission.BillingManage]);
    const ok = tenantStorage.run(state({ role: Role.SUPER_ADMIN, gymId: null }), () =>
      guard.canActivate(ctx),
    );
    expect(ok).toBe(true);
  });
});
