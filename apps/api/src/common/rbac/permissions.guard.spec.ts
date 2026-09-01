import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { Role } from '@fit/db';
import { PermissionsGuard } from './permissions.guard';
import {
  clearRequestAccessResolver,
  registerRequestAccessResolver,
  type RequestAccess,
  type RequestAccessResolver,
} from './request-access';
import { ALL_PERMISSIONS, Permission, resolveRolePermissions } from '@fit/types';
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

/** A minimal Express-ish request the guard can read and clamp. */
interface FakeRequest {
  query: Record<string, unknown>;
  params: Record<string, unknown>;
  body: Record<string, unknown>;
}

function request(overrides: Partial<FakeRequest> = {}): FakeRequest {
  return { query: {}, params: {}, body: {}, ...overrides };
}

function contextFor(req: unknown = {}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

const ctx = contextFor();

/** The authorization metadata a route can declare, keyed by reflector key. */
interface Meta {
  isPublic?: boolean;
  permissions?: Permission[];
  roles?: Role[];
  allowCrossTenant?: boolean;
}

/**
 * A resolver that answers from the built-in defaults, with a fixed branch roster
 * for the roles whose default scope is `assigned`. Mirrors what a gym that has
 * never opened the editor resolves to.
 */
function defaultsResolver(branches: readonly string[] = ['loc-1']): RequestAccessResolver {
  return {
    resolve: (s: TenantState): Promise<RequestAccess> => {
      const resolved = resolveRolePermissions(undefined, s.role);
      return Promise.resolve(
        resolved.branchScope === 'assigned'
          ? {
              ...resolved,
              allowedLocationIds: [...branches],
              defaultLocationId: branches[0] ?? null,
            }
          : { ...resolved, allowedLocationIds: null, defaultLocationId: null },
      );
    },
    invalidateGym: () => undefined,
  };
}

/** Build a guard whose reflector returns per-key metadata for the route. */
function makeGuard(meta: Meta, access: RequestAccessResolver = defaultsResolver()): PermissionsGuard {
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
  return new PermissionsGuard(reflector, new TenantContext(), access);
}

afterEach(() => {
  clearRequestAccessResolver();
});

describe('PermissionsGuard (global deny-by-default)', () => {
  describe('@Public', () => {
    it('allows a public route with no session at all', async () => {
      const guard = makeGuard({ isPublic: true });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('allows a public route even when other metadata is absent', async () => {
      const guard = makeGuard({ isPublic: true });
      const ok = await tenantStorage.run(state(), () => guard.canActivate(ctx));
      expect(ok).toBe(true);
    });
  });

  describe('deny-by-default', () => {
    it('rejects a route that declares no authorization policy with 403', async () => {
      const guard = makeGuard({});
      const error = await captureError(() =>
        tenantStorage.run(state(), () => guard.canActivate(ctx)),
      );
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'ENDPOINT_NOT_AUTHORIZED',
      });
    });

    it('treats an empty @RequirePermissions list as no policy → 403', async () => {
      const guard = makeGuard({ permissions: [] });
      await expect(
        tenantStorage.run(state(), () => guard.canActivate(ctx)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws 401 for an undeclared route when no tenant was established', async () => {
      const guard = makeGuard({});
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('@RequirePermissions', () => {
    it('throws 401 when no tenant was established (middleware did not run)', async () => {
      const guard = makeGuard({ permissions: [Permission.MemberRead] });
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('allows a caller whose role grants the permission', async () => {
      const guard = makeGuard({ permissions: [Permission.MemberWrite] });
      const ok = await tenantStorage.run(state({ role: Role.RECEPTIONIST }), () =>
        guard.canActivate(contextFor(request())),
      );
      expect(ok).toBe(true);
    });

    it('rejects a caller missing the permission with 403', async () => {
      const guard = makeGuard({ permissions: [Permission.WorkoutWrite] });
      await expect(
        tenantStorage.run(state({ role: Role.RECEPTIONIST }), () =>
          guard.canActivate(contextFor(request())),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('requires ALL listed permissions (AND semantics)', async () => {
      const guard = makeGuard({ permissions: [Permission.MemberWrite, Permission.WorkoutWrite] });
      // RECEPTIONIST has MemberWrite but not WorkoutWrite → rejected.
      await expect(
        tenantStorage.run(state({ role: Role.RECEPTIONIST }), () =>
          guard.canActivate(contextFor(request())),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lets SUPER_ADMIN through for any permission', async () => {
      const guard = makeGuard({ permissions: [Permission.GymManage, Permission.BillingManage] });
      const ok = await tenantStorage.run(state({ role: Role.SUPER_ADMIN, gymId: null }), () =>
        guard.canActivate(ctx),
      );
      expect(ok).toBe(true);
    });
  });

  describe('runtime, per-gym grants', () => {
    /** A resolver standing in for a gym that has edited its roles. */
    function overridden(grants: Permission[]): RequestAccessResolver {
      return {
        resolve: (s: TenantState) =>
          Promise.resolve({
            role: s.role,
            grants,
            branchScope: 'all' as const,
            allowedLocationIds: null,
            defaultLocationId: null,
          }),
        invalidateGym: () => undefined,
      };
    }

    it('403s a permission the gym has revoked, even though the static matrix grants it', async () => {
      // RECEPTIONIST holds MemberWrite as shipped; this gym unticked it.
      const guard = makeGuard(
        { permissions: [Permission.MemberWrite] },
        overridden([Permission.MemberRead]),
      );
      const error = await captureError(() =>
        tenantStorage.run(state({ role: Role.RECEPTIONIST }), () =>
          guard.canActivate(contextFor(request())),
        ),
      );
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'INSUFFICIENT_PERMISSION',
      });
    });

    it('allows a permission the gym has granted beyond the static matrix', async () => {
      // TRAINER holds no MemberWrite as shipped; this gym granted it.
      const guard = makeGuard(
        { permissions: [Permission.MemberWrite] },
        overridden([Permission.MemberWrite]),
      );
      const ok = await tenantStorage.run(state({ role: Role.TRAINER }), () =>
        guard.canActivate(contextFor(request())),
      );
      expect(ok).toBe(true);
    });
  });

  describe('resolution failure denies — it never falls back to the static matrix', () => {
    /** A resolver whose backing store is down. */
    const broken: RequestAccessResolver = {
      resolve: () => Promise.reject(new Error('connection terminated')),
      invalidateGym: () => undefined,
    };

    it('403s a caller the static matrix WOULD have admitted', async () => {
      const guard = makeGuard({ permissions: [Permission.MemberRead] }, broken);
      const error = await captureError(() =>
        tenantStorage.run(state({ role: Role.OWNER }), () => guard.canActivate(ctx)),
      );
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'PERMISSION_RESOLUTION_FAILED',
      });
    });

    it('403s when no resolver was ever registered, rather than admitting anyone', async () => {
      clearRequestAccessResolver();
      // No third constructor argument: the guard falls back to the process-wide
      // holder, which is empty. That is a resolution failure like any other.
      const guard = makeGuard({ permissions: [Permission.ProfileManage] });
      const withHolder = new PermissionsGuard(
        (guard as unknown as { reflector: Reflector }).reflector,
        new TenantContext(),
      );
      const error = await captureError(() =>
        tenantStorage.run(state({ role: Role.MEMBER }), () => withHolder.canActivate(ctx)),
      );
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'PERMISSION_RESOLUTION_FAILED',
      });
    });

    it('uses the registered resolver once one exists', async () => {
      registerRequestAccessResolver(defaultsResolver());
      const guard = makeGuard({ permissions: [Permission.ProfileManage] });
      const withHolder = new PermissionsGuard(
        (guard as unknown as { reflector: Reflector }).reflector,
        new TenantContext(),
      );
      const ok = await tenantStorage.run(state({ role: Role.MEMBER }), () =>
        withHolder.canActivate(contextFor(request())),
      );
      expect(ok).toBe(true);
    });
  });

  describe('branch scope', () => {
    /** A resolver for a role restricted to `branches`. */
    function assigned(branches: string[]): RequestAccessResolver {
      return {
        resolve: (s: TenantState) =>
          Promise.resolve({
            role: s.role,
            grants: [...ALL_PERMISSIONS],
            branchScope: 'assigned' as const,
            allowedLocationIds: branches,
            defaultLocationId: branches[0] ?? null,
          }),
        invalidateGym: () => undefined,
      };
    }

    it('forces a request that names no branch onto one the caller holds', async () => {
      const req = request();
      const guard = makeGuard({ permissions: [Permission.MemberRead] }, assigned(['loc-b']));
      const ok = await tenantStorage.run(state({ role: Role.RECEPTIONIST }), () =>
        guard.canActivate(contextFor(req)),
      );
      expect(ok).toBe(true);
      // The whole point: gym-wide is not an option for an `assigned` role.
      expect(req.query.locationId).toBe('loc-b');
    });

    it('leaves a permitted branch alone', async () => {
      const req = request({ query: { locationId: 'loc-c' } });
      const guard = makeGuard(
        { permissions: [Permission.MemberRead] },
        assigned(['loc-b', 'loc-c']),
      );
      await tenantStorage.run(state({ role: Role.RECEPTIONIST }), () =>
        guard.canActivate(contextFor(req)),
      );
      expect(req.query.locationId).toBe('loc-c');
    });

    it('403s a branch the caller does not hold, in the query', async () => {
      const req = request({ query: { locationId: 'loc-z' } });
      const guard = makeGuard({ permissions: [Permission.MemberRead] }, assigned(['loc-b']));
      const error = await captureError(() =>
        tenantStorage.run(state({ role: Role.RECEPTIONIST }), () =>
          guard.canActivate(contextFor(req)),
        ),
      );
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'BRANCH_FORBIDDEN',
      });
    });

    it('403s a branch the caller does not hold, in the body', async () => {
      const req = request({ body: { locationId: 'loc-z' } });
      const guard = makeGuard({ permissions: [Permission.MemberWrite] }, assigned(['loc-b']));
      await expect(
        tenantStorage.run(state({ role: Role.RECEPTIONIST }), () =>
          guard.canActivate(contextFor(req)),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('403s a branch the caller does not hold, in a route param', async () => {
      const req = request({ params: { locationId: 'loc-z' } });
      const guard = makeGuard({ permissions: [Permission.MemberRead] }, assigned(['loc-b']));
      await expect(
        tenantStorage.run(state({ role: Role.RECEPTIONIST }), () =>
          guard.canActivate(contextFor(req)),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('leaves a null body branch alone — it means "every branch", not "a branch"', async () => {
      const req = request({ body: { locationId: null } });
      const guard = makeGuard({ permissions: [Permission.ProductWrite] }, assigned(['loc-b']));
      await expect(
        tenantStorage.run(state({ role: Role.RECEPTIONIST }), () =>
          guard.canActivate(contextFor(req)),
        ),
      ).resolves.toBe(true);
    });

    it('refuses a caller rostered at no branch at all', async () => {
      const guard = makeGuard({ permissions: [Permission.MemberRead] }, assigned([]));
      const error = await captureError(() =>
        tenantStorage.run(state({ role: Role.TRAINER }), () =>
          guard.canActivate(contextFor(request())),
        ),
      );
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'BRANCH_SCOPE_UNASSIGNED',
      });
    });

    it('does not clamp a self-service route — the subject is the actor, not a branch', async () => {
      // A branch-restricted trainer must still reach their own profile, and a
      // trainer rostered nowhere must not be locked out of it either.
      const req = request();
      const guard = makeGuard({ permissions: [Permission.ProfileManage] }, assigned([]));
      const ok = await tenantStorage.run(state({ role: Role.TRAINER }), () =>
        guard.canActivate(contextFor(req)),
      );
      expect(ok).toBe(true);
      expect(req.query.locationId).toBeUndefined();
    });

    it('does not touch a gym-wide role', async () => {
      const req = request();
      const guard = makeGuard({ permissions: [Permission.MemberRead] });
      await tenantStorage.run(state({ role: Role.MANAGER }), () =>
        guard.canActivate(contextFor(req)),
      );
      expect(req.query.locationId).toBeUndefined();
    });

    it('overrides a repeated locationId param, which arrives as an array', async () => {
      // `?locationId=mine&locationId=theirs` parses to an array; anything that is
      // not a single string is replaced with the caller's own branch rather than
      // being waved through.
      const req = request({ query: { locationId: ['loc-b', 'loc-z'] } });
      const guard = makeGuard({ permissions: [Permission.MemberRead] }, assigned(['loc-b']));
      await tenantStorage.run(state({ role: Role.RECEPTIONIST }), () =>
        guard.canActivate(contextFor(req)),
      );
      expect(req.query.locationId).toBe('loc-b');
    });
  });

  describe('OWNER cannot be locked out', () => {
    it('admits an OWNER for every permission, whatever the gym stored', async () => {
      // The contract pins OWNER to every capability when the blob is PARSED, so a
      // settings row claiming otherwise resolves to full access anyway. Asserted
      // through the real resolver function, since that is what the service calls.
      const hostile = {
        OWNER: { grants: [], branchScope: 'assigned' },
        MANAGER: { grants: [], branchScope: 'assigned' },
        RECEPTIONIST: { grants: [], branchScope: 'assigned' },
        TRAINER: { grants: [], branchScope: 'assigned' },
      } as never;
      const owner = resolveRolePermissions(hostile, Role.OWNER);
      expect(owner.grants).toEqual([...ALL_PERMISSIONS]);
      expect(owner.branchScope).toBe('all');

      const guard = makeGuard({ permissions: [Permission.GymManage] });
      const ok = await tenantStorage.run(state({ role: Role.OWNER }), () =>
        guard.canActivate(contextFor(request())),
      );
      expect(ok).toBe(true);
    });
  });

  describe('constructor DI fallback (production regression)', () => {
    it('does not crash when Nest resolves it with no injected deps', async () => {
      // As a global APP_GUARD (useExisting), Nest passed `undefined` for the
      // reflector in production, so `this.reflector.getAllAndOverride` threw a
      // TypeError and 500'd every request. The constructor now defaults to fresh
      // instances, so a no-arg construction resolves route metadata (none here)
      // and falls through to the auth check — a clean 401, never a TypeError.
      const guard = new PermissionsGuard();
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});

/** Run `fn`, returning whatever it throws or rejects with. */
async function captureError(fn: () => unknown): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  return undefined;
}
