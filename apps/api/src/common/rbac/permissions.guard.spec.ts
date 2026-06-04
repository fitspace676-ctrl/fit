import { describe, expect, it, vi } from 'vitest';
import { type ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { Role } from '@fit/db';
import { PermissionsGuard } from './permissions.guard';
import { Permission } from '@fit/types';
import { ALLOW_CROSS_TENANT_KEY } from '../decorators/allow-cross-tenant.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
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

/** The authorization metadata a route can declare, keyed by reflector key. */
interface Meta {
  isPublic?: boolean;
  permissions?: Permission[];
  roles?: Role[];
  allowCrossTenant?: boolean;
}

/** Build a guard whose reflector returns per-key metadata for the route. */
function makeGuard(meta: Meta): PermissionsGuard {
  const reflector = {
    getAllAndOverride: vi.fn((key: string) => {
      switch (key) {
        case IS_PUBLIC_KEY:
          return meta.isPublic;
        case PERMISSIONS_KEY:
          return meta.permissions;
        case ROLES_KEY:
          return meta.roles;
        case ALLOW_CROSS_TENANT_KEY:
          return meta.allowCrossTenant;
        default:
          return undefined;
      }
    }),
  } as unknown as Reflector;
  return new PermissionsGuard(reflector, new TenantContext());
}

describe('PermissionsGuard (global deny-by-default)', () => {
  describe('@Public', () => {
    it('allows a public route with no session at all', () => {
      const guard = makeGuard({ isPublic: true });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows a public route even when other metadata is absent', () => {
      const guard = makeGuard({ isPublic: true });
      const ok = tenantStorage.run(state(), () => guard.canActivate(ctx));
      expect(ok).toBe(true);
    });
  });

  describe('deny-by-default', () => {
    it('rejects a route that declares no authorization policy with 403', () => {
      const guard = makeGuard({});
      const run = () => tenantStorage.run(state(), () => guard.canActivate(ctx));
      expect(run).toThrow(ForbiddenException);
      const error = captureError(run);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'ENDPOINT_NOT_AUTHORIZED',
      });
    });

    it('treats an empty @RequirePermissions list as no policy → 403', () => {
      const guard = makeGuard({ permissions: [] });
      const run = () => tenantStorage.run(state(), () => guard.canActivate(ctx));
      expect(run).toThrow(ForbiddenException);
    });

    it('throws 401 for an undeclared route when no tenant was established', () => {
      const guard = makeGuard({});
      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });
  });

  describe('@RequirePermissions', () => {
    it('throws 401 when no tenant was established (middleware did not run)', () => {
      const guard = makeGuard({ permissions: [Permission.MemberRead] });
      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });

    it('allows a caller whose role grants the permission', () => {
      const guard = makeGuard({ permissions: [Permission.MemberWrite] });
      const ok = tenantStorage.run(state({ role: Role.RECEPTIONIST }), () =>
        guard.canActivate(ctx),
      );
      expect(ok).toBe(true);
    });

    it('rejects a caller missing the permission with 403', () => {
      const guard = makeGuard({ permissions: [Permission.WorkoutWrite] });
      const run = () =>
        tenantStorage.run(state({ role: Role.RECEPTIONIST }), () => guard.canActivate(ctx));
      expect(run).toThrow(ForbiddenException);
    });

    it('requires ALL listed permissions (AND semantics)', () => {
      const guard = makeGuard({ permissions: [Permission.MemberWrite, Permission.WorkoutWrite] });
      // RECEPTIONIST has MemberWrite but not WorkoutWrite → rejected.
      const run = () =>
        tenantStorage.run(state({ role: Role.RECEPTIONIST }), () => guard.canActivate(ctx));
      expect(run).toThrow(ForbiddenException);
    });

    it('lets SUPER_ADMIN through for any permission', () => {
      const guard = makeGuard({ permissions: [Permission.GymManage, Permission.BillingManage] });
      const ok = tenantStorage.run(state({ role: Role.SUPER_ADMIN, gymId: null }), () =>
        guard.canActivate(ctx),
      );
      expect(ok).toBe(true);
    });
  });

  describe('delegated authorization', () => {
    it('admits a @Roles route, deferring the role check to RolesGuard', () => {
      const guard = makeGuard({ roles: [Role.OWNER] });
      const ok = tenantStorage.run(state({ role: Role.MEMBER }), () => guard.canActivate(ctx));
      expect(ok).toBe(true);
    });

    it('admits an @AllowCrossTenant route, deferring to TenantGuard', () => {
      const guard = makeGuard({ allowCrossTenant: true });
      const ok = tenantStorage.run(state({ role: Role.MEMBER }), () => guard.canActivate(ctx));
      expect(ok).toBe(true);
    });

    it('still requires a session for a delegated route (401 without tenant)', () => {
      const guard = makeGuard({ allowCrossTenant: true });
      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });
  });

  describe('constructor DI fallback (production regression)', () => {
    it('does not crash when Nest resolves it with no injected deps', () => {
      // As a global APP_GUARD (useExisting), Nest passed `undefined` for the
      // reflector in production, so `this.reflector.getAllAndOverride` threw a
      // TypeError and 500'd every request. The constructor now defaults to fresh
      // instances, so a no-arg construction resolves route metadata (none here)
      // and falls through to the auth check — a clean 401, never a TypeError.
      const guard = new PermissionsGuard();
      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });
  });
});

/** Run `fn`, returning whatever it throws (for asserting on the error body). */
function captureError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}
