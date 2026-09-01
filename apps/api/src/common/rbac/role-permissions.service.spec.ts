import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@fit/db';
import { ALL_PERMISSIONS, Permission, ROLE_PERMISSIONS } from '@fit/types';
import type { TenantPrismaService } from '../prisma/tenant-prisma.service';
import type { TenantState } from '../tenant/tenant.context';
import { clearRequestAccessResolver, invalidateGymAccess } from './request-access';
import { RolePermissionsService } from './role-permissions.service';

function state(overrides: Partial<TenantState> = {}): TenantState {
  return {
    userId: 'user-1',
    gymId: 'gym-1',
    role: Role.RECEPTIONIST,
    allowCrossTenant: false,
    ...overrides,
  };
}

/** A staff membership row as the branch lookup selects it. */
interface MemberRow {
  locationId: string | null;
  locationAssignments: { locationId: string }[];
}

function fakePrisma(options: {
  settings?: unknown;
  gymMissing?: boolean;
  gymError?: Error;
  member?: MemberRow | null;
}) {
  const gym = {
    findUnique: vi.fn(() => {
      if (options.gymError) {
        return Promise.reject(options.gymError);
      }
      return Promise.resolve(options.gymMissing ? null : { settings: options.settings ?? null });
    }),
  };
  const gymMember = {
    findFirst: vi.fn(() =>
      Promise.resolve(
        options.member === undefined
          ? { locationId: 'loc-a', locationAssignments: [{ locationId: 'loc-a' }] }
          : options.member,
      ),
    ),
  };
  return {
    service: { client: { gym, gymMember } } as unknown as TenantPrismaService,
    gym,
    gymMember,
  };
}

afterEach(() => {
  clearRequestAccessResolver();
  vi.useRealTimers();
});

describe('RolePermissionsService', () => {
  describe('a gym that has configured nothing behaves exactly as it shipped', () => {
    it('resolves a staff role to the built-in matrix when settings are absent', async () => {
      const { service } = fakePrisma({ settings: null });
      const resolved = await new RolePermissionsService(service).resolve(state());
      expect([...resolved.grants].sort()).toEqual([...ROLE_PERMISSIONS.RECEPTIONIST].sort());
    });

    it('resolves the same way when the settings blob has no permissions section', async () => {
      const { service } = fakePrisma({ settings: { brand: { logoUrl: null } } });
      const resolved = await new RolePermissionsService(service).resolve(state());
      expect([...resolved.grants].sort()).toEqual([...ROLE_PERMISSIONS.RECEPTIONIST].sort());
    });

    it('degrades a malformed permissions section to that field’s default, never to nothing', async () => {
      // The section normalises rather than rejects: it shares a JSON column with
      // eighteen others, so one bad write must not take the gym down with it.
      const { service } = fakePrisma({
        settings: { permissions: { RECEPTIONIST: { grants: 'not-an-array', branchScope: 42 } } },
      });
      const resolved = await new RolePermissionsService(service).resolve(state());
      expect([...resolved.grants].sort()).toEqual([...ROLE_PERMISSIONS.RECEPTIONIST].sort());
      expect(resolved.branchScope).toBe('assigned');
    });
  });

  describe('runtime overrides', () => {
    it('drops a capability the gym revoked', async () => {
      const { service } = fakePrisma({
        settings: {
          permissions: {
            RECEPTIONIST: { grants: [Permission.MemberRead], branchScope: 'all' },
          },
        },
      });
      const resolved = await new RolePermissionsService(service).resolve(state());
      expect(resolved.grants).toContain(Permission.MemberRead);
      expect(resolved.grants).not.toContain(Permission.MemberWrite);
      expect(resolved.branchScope).toBe('all');
    });

    it('keeps the self-service capabilities an override cannot express', async () => {
      // `ProfileManage` is not in the editable vocabulary, so an override with an
      // empty grants array must not take away a receptionist's own profile.
      const { service } = fakePrisma({
        settings: { permissions: { RECEPTIONIST: { grants: [], branchScope: 'all' } } },
      });
      const resolved = await new RolePermissionsService(service).resolve(state());
      expect(resolved.grants).toEqual([Permission.ProfileManage]);
    });
  });

  describe('OWNER and SUPER_ADMIN are settings-independent', () => {
    it('gives OWNER every permission without reading the gym row at all', async () => {
      // The read is skipped because the answer cannot depend on it — which is also
      // what makes an owner un-lockoutable when the gym row is unreadable.
      const { service, gym } = fakePrisma({ gymError: new Error('database is down') });
      const resolved = await new RolePermissionsService(service).resolve(
        state({ role: Role.OWNER }),
      );
      expect(resolved.grants).toEqual([...ALL_PERMISSIONS]);
      expect(resolved.branchScope).toBe('all');
      expect(gym.findUnique).not.toHaveBeenCalled();
    });

    it('gives OWNER every permission even when the stored blob says otherwise', async () => {
      // The shortcut must agree with the contract, so the same hostile blob is fed
      // through the read path a MANAGER takes and OWNER's answer is unchanged.
      const hostile = {
        permissions: {
          OWNER: { grants: [], branchScope: 'assigned' },
          MANAGER: { grants: [], branchScope: 'assigned' },
        },
      };
      const { service } = fakePrisma({ settings: hostile, member: null });
      const resolved = await new RolePermissionsService(service).resolve(
        state({ role: Role.OWNER }),
      );
      expect(resolved.grants).toEqual([...ALL_PERMISSIONS]);
      expect(resolved.branchScope).toBe('all');
    });

    it('gives SUPER_ADMIN everything with no gym in scope', async () => {
      const { service, gym } = fakePrisma({});
      const resolved = await new RolePermissionsService(service).resolve(
        state({ role: Role.SUPER_ADMIN, gymId: null }),
      );
      expect(resolved.grants).toEqual([...ALL_PERMISSIONS]);
      expect(gym.findUnique).not.toHaveBeenCalled();
    });

    it('resolves a MEMBER from the built-in matrix without reading settings', async () => {
      const { service, gym } = fakePrisma({});
      const resolved = await new RolePermissionsService(service).resolve(
        state({ role: Role.MEMBER }),
      );
      expect([...resolved.grants].sort()).toEqual([...ROLE_PERMISSIONS.MEMBER].sort());
      expect(resolved.branchScope).toBe('all');
      expect(gym.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('resolution failure throws — the guard turns that into a 403', () => {
    it('throws when the gym row does not exist', async () => {
      const { service } = fakePrisma({ gymMissing: true });
      await expect(new RolePermissionsService(service).resolve(state())).rejects.toThrow(
        /does not exist/,
      );
    });

    it('throws when the database is unreachable, and does not cache the failure', async () => {
      const { service, gym } = fakePrisma({ gymError: new Error('connection terminated') });
      const resolver = new RolePermissionsService(service);
      await expect(resolver.resolve(state())).rejects.toThrow(/connection terminated/);
      await expect(resolver.resolve(state())).rejects.toThrow(/connection terminated/);
      // A cached failure would turn a one-request blip into fifteen seconds of 403s.
      expect(gym.findUnique).toHaveBeenCalledTimes(2);
    });

    it('throws when the caller has no membership in the gym they claim', async () => {
      const { service } = fakePrisma({ settings: null, member: null });
      await expect(new RolePermissionsService(service).resolve(state())).rejects.toThrow(
        /no membership/,
      );
    });

    it('throws when a gym-scoped role arrives with no tenant', async () => {
      const { service } = fakePrisma({});
      await expect(
        new RolePermissionsService(service).resolve(state({ role: Role.MANAGER, gymId: null })),
      ).rejects.toThrow(/not scoped to a gym/);
    });
  });

  describe('branch scope', () => {
    it('returns the branches the person is rostered at, and forces the base one', async () => {
      const { service } = fakePrisma({
        settings: null,
        member: {
          locationId: 'loc-b',
          locationAssignments: [{ locationId: 'loc-c' }, { locationId: 'loc-b' }],
        },
      });
      const resolved = await new RolePermissionsService(service).resolve(state());
      expect(resolved.allowedLocationIds).toEqual(['loc-b', 'loc-c']);
      expect(resolved.defaultLocationId).toBe('loc-b');
    });

    it('falls back to the first held branch when the base branch is not one of them', async () => {
      const { service } = fakePrisma({
        settings: null,
        member: { locationId: 'loc-z', locationAssignments: [{ locationId: 'loc-c' }] },
      });
      const resolved = await new RolePermissionsService(service).resolve(state());
      expect(resolved.defaultLocationId).toBe('loc-c');
    });

    it('returns an empty roster for someone assigned nowhere — the guard fails closed on it', async () => {
      const { service } = fakePrisma({
        settings: null,
        member: { locationId: null, locationAssignments: [] },
      });
      const resolved = await new RolePermissionsService(service).resolve(state());
      expect(resolved.allowedLocationIds).toEqual([]);
      expect(resolved.defaultLocationId).toBeNull();
    });

    it('does not read the roster for a gym-wide role', async () => {
      const { service, gymMember } = fakePrisma({
        settings: { permissions: { RECEPTIONIST: { grants: [], branchScope: 'all' } } },
      });
      await new RolePermissionsService(service).resolve(state());
      expect(gymMember.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('caching and invalidation', () => {
    let now = 1_700_000_000_000;

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(now);
    });

    it('reads the gym row once for repeated requests', async () => {
      const { service, gym } = fakePrisma({ settings: null });
      const resolver = new RolePermissionsService(service);
      await resolver.resolve(state());
      await resolver.resolve(state());
      await resolver.resolve(state({ userId: 'user-2' }));
      expect(gym.findUnique).toHaveBeenCalledTimes(1);
    });

    it('caches the branch roster per person, not per gym', async () => {
      const { service, gymMember } = fakePrisma({ settings: null });
      const resolver = new RolePermissionsService(service);
      await resolver.resolve(state());
      await resolver.resolve(state());
      expect(gymMember.findFirst).toHaveBeenCalledTimes(1);
      await resolver.resolve(state({ userId: 'user-2' }));
      expect(gymMember.findFirst).toHaveBeenCalledTimes(2);
    });

    it('re-reads after the settings PATCH busts the gym', async () => {
      const { service, gym, gymMember } = fakePrisma({ settings: null });
      const resolver = new RolePermissionsService(service);
      await resolver.resolve(state());
      // The exported free function is what `GymSettingsService` calls; going
      // through it pins the wiring, not just the method.
      invalidateGymAccess('gym-1');
      await resolver.resolve(state());
      expect(gym.findUnique).toHaveBeenCalledTimes(2);
      // The roster is dropped by the same bust — a staff edit changes both.
      expect(gymMember.findFirst).toHaveBeenCalledTimes(2);
    });

    it('leaves another gym’s cache alone when one gym is busted', async () => {
      const { service, gym } = fakePrisma({ settings: null });
      const resolver = new RolePermissionsService(service);
      await resolver.resolve(state());
      await resolver.resolve(state({ gymId: 'gym-2' }));
      expect(gym.findUnique).toHaveBeenCalledTimes(2);
      invalidateGymAccess('gym-2');
      await resolver.resolve(state());
      expect(gym.findUnique).toHaveBeenCalledTimes(2);
    });

    it('re-reads once the TTL lapses — the bound on a sibling replica’s staleness', async () => {
      const { service, gym } = fakePrisma({ settings: null });
      const resolver = new RolePermissionsService(service);
      await resolver.resolve(state());
      expect(gym.findUnique).toHaveBeenCalledTimes(1);

      now += 14_000;
      vi.setSystemTime(now);
      await resolver.resolve(state());
      expect(gym.findUnique).toHaveBeenCalledTimes(1);

      now += 2_000;
      vi.setSystemTime(now);
      await resolver.resolve(state());
      expect(gym.findUnique).toHaveBeenCalledTimes(2);
    });
  });
});
