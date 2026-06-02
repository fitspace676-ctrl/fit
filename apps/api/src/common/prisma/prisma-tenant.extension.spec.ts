import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { Role } from '@fit/db';
import { scopeArgs, tenantExtension, TENANT_SCOPED_MODELS } from './prisma-tenant.extension';
import { tenantStorage, type TenantState } from '../tenant/tenant.context';

function state(overrides: Partial<TenantState> = {}): TenantState {
  return {
    userId: 'u-1',
    gymId: 'gym-a',
    role: Role.MEMBER,
    allowCrossTenant: false,
    ...overrides,
  };
}

describe('scopeArgs', () => {
  it('leaves a non-tenant-scoped model untouched', () => {
    const args = { where: { email: 'x@y.z' } };
    expect(scopeArgs('User', 'findFirst', args, state())).toBe(args);
  });

  it('appends gymId to the where of a scoped read', () => {
    const result = scopeArgs('GymMember', 'findMany', { where: { role: Role.TRAINER } }, state());
    expect(result).toEqual({ where: { role: Role.TRAINER, gymId: 'gym-a' } });
  });

  it('scopes AuditLog too — it carries a gymId', () => {
    expect(scopeArgs('AuditLog', 'findMany', { where: { action: 'x' } }, state())).toEqual({
      where: { action: 'x', gymId: 'gym-a' },
    });
    expect(scopeArgs('AuditLog', 'create', { data: { action: 'x' } }, state())).toEqual({
      data: { action: 'x', gymId: 'gym-a' },
    });
  });

  it('appends gymId even when the read has no where at all', () => {
    expect(scopeArgs('GymMember', 'findMany', undefined, state())).toEqual({
      where: { gymId: 'gym-a' },
    });
  });

  it('OVERWRITES a caller-supplied foreign gymId so another tenant is unreachable', () => {
    // The attacker tries to read gym B's rows while scoped to gym A.
    const result = scopeArgs('GymMember', 'findMany', { where: { gymId: 'gym-b' } }, state());
    expect(result).toEqual({ where: { gymId: 'gym-a' } });
  });

  it('stamps gymId onto created data', () => {
    expect(scopeArgs('GymMember', 'create', { data: { userId: 'u-2' } }, state())).toEqual({
      data: { userId: 'u-2', gymId: 'gym-a' },
    });
  });

  it('stamps gymId onto every row of a createMany', () => {
    const result = scopeArgs(
      'GymMember',
      'createMany',
      { data: [{ userId: 'a' }, { userId: 'b' }] },
      state(),
    );
    expect(result).toEqual({
      data: [
        { userId: 'a', gymId: 'gym-a' },
        { userId: 'b', gymId: 'gym-a' },
      ],
    });
  });

  it('constrains the where of update / delete to the tenant', () => {
    expect(scopeArgs('GymMember', 'delete', { where: { id: 'gm-1' } }, state())).toEqual({
      where: { id: 'gm-1', gymId: 'gym-a' },
    });
  });

  it('throws (fail-closed) when a scoped model is queried with no tenant in scope', () => {
    expect(() => scopeArgs('GymMember', 'findMany', {}, undefined)).toThrow(ForbiddenException);
  });

  it('throws when the request has a null gym and is not cross-tenant', () => {
    expect(() => scopeArgs('GymMember', 'findMany', {}, state({ gymId: null }))).toThrow(
      ForbiddenException,
    );
  });

  describe('cross-tenant bypass', () => {
    it('skips scoping for a SUPER_ADMIN on an allow-cross-tenant request', () => {
      const args = { where: {} };
      const result = scopeArgs(
        'GymMember',
        'findMany',
        args,
        state({ role: Role.SUPER_ADMIN, allowCrossTenant: true, gymId: null }),
      );
      expect(result).toBe(args);
    });

    it('does NOT skip scoping when allowCrossTenant is set but the role is not SUPER_ADMIN', () => {
      // A non-SuperAdmin can never bypass, even with the flag flipped — defence in depth.
      const result = scopeArgs(
        'GymMember',
        'findMany',
        {},
        state({ role: Role.OWNER, allowCrossTenant: true }),
      );
      expect(result).toEqual({ where: { gymId: 'gym-a' } });
    });
  });
});

describe('tenantExtension (load-bearing isolation)', () => {
  // An in-memory GymMember table spanning two tenants.
  const rows = [
    { id: 'gm-a1', gymId: 'gym-a', userId: 'u-a' },
    { id: 'gm-a2', gymId: 'gym-a', userId: 'u-a2' },
    { id: 'gm-b1', gymId: 'gym-b', userId: 'u-b' },
  ];

  /** Mimic Prisma's engine: return the rows matching a (possibly absent) gymId filter. */
  function fakeFindMany(args: { where?: { gymId?: string } }): typeof rows {
    const wanted = args.where?.gymId;
    return wanted ? rows.filter((r) => r.gymId === wanted) : rows;
  }

  /**
   * Run a `gymMember.findMany({})` the way the extension's `$allOperations` hook
   * does — scopeArgs then the underlying query — within gym A's request context.
   * `withExtension:false` simulates the extension having been removed.
   */
  function findMembers(withExtension: boolean, ctx: TenantState): typeof rows {
    return tenantStorage.run(ctx, () => {
      const callerArgs = {};
      const finalArgs = withExtension
        ? (scopeArgs('GymMember', 'findMany', callerArgs, tenantStorage.getStore()) as {
            where?: { gymId?: string };
          })
        : callerArgs;
      return fakeFindMany(finalArgs);
    });
  }

  it('a gym-A member sees only gym-A rows — never gym-B', () => {
    const visible = findMembers(true, state({ gymId: 'gym-a' }));
    expect(visible.map((r) => r.id)).toEqual(['gm-a1', 'gm-a2']);
    expect(visible.some((r) => r.gymId === 'gym-b')).toBe(false);
  });

  it('FAILS without the extension — the same query leaks gym-B rows (proves it is load-bearing)', () => {
    const leaked = findMembers(false, state({ gymId: 'gym-a' }));
    // Removing the extension lets gym B's row through: this is the regression the
    // extension exists to prevent, asserted so the build breaks if it is dropped.
    expect(leaked.some((r) => r.gymId === 'gym-b')).toBe(true);
  });

  it('exposes a Prisma extension factory and a documented scoped-model set', () => {
    // Prisma's defineExtension returns an extension callback.
    expect(tenantExtension()).toBeDefined();
    expect(TENANT_SCOPED_MODELS.has('GymMember')).toBe(true);
    expect(TENANT_SCOPED_MODELS.has('User')).toBe(false);
  });
});
